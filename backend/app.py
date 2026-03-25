from __future__ import annotations

import json
import os
from collections import deque
from copy import deepcopy
from decimal import Decimal
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import APIError, AuthenticationError, OpenAI
from ortools.sat.python import cp_model
from pydantic import BaseModel, Field


class NodePayload(BaseModel):
    id: str
    title: str
    content: str = ""
    cost: float = Field(default=0, ge=0)
    duration: float = Field(ge=0)
    workHoursPerWeek: float = Field(ge=0)
    parallelizationMultiplier: int = Field(default=1, ge=1, le=4)
    operators: list[str] = Field(default_factory=list)
    completed: bool = False


class EdgePayload(BaseModel):
    id: str
    source: str
    target: str
    parallelized: bool = False


class PersonnelPayload(BaseModel):
    name: str
    hoursPerWeek: float = Field(ge=0)


class GraphPayload(BaseModel):
    personnel: list[PersonnelPayload] = Field(default_factory=list)
    nodes: list[NodePayload] = Field(default_factory=list)
    edges: list[EdgePayload] = Field(default_factory=list)


class ScheduledNode(BaseModel):
    nodeId: str
    assignedOperator: str | None
    usesPersonnel: bool
    start: float
    finish: float


class ScheduleResponse(BaseModel):
    makespan: float
    nodes: list[ScheduledNode]
    diagnostics: list[str]


class AccelerationProposal(BaseModel):
    candidateId: str
    sourceNodeId: str
    sourceTitle: str
    targetNodeId: str
    targetTitle: str
    multiplier: Literal[1]
    resultingPlannedCost: float
    resultingPlannedDuration: float
    deltaCost: float
    deltaDuration: float
    summary: str
    rationale: str
    confidence: Literal["low", "medium", "high"]
    fallbackUsed: bool = False


class AccelerateRequest(GraphPayload):
    budgetUsd: float | None = Field(default=None, ge=0)
    rejectedCandidateIds: list[str] = Field(default_factory=list)


class AccelerateResponse(BaseModel):
    proposal: AccelerationProposal | None
    stopReason: str | None
    baselinePlannedCost: float
    baselinePlannedDuration: float
    candidateCount: int


class ProposalChoice(BaseModel):
    type: Literal["propose", "stop"]
    candidate_id: str | None
    summary: str
    rationale: str
    confidence: Literal["low", "medium", "high"]


app = FastAPI(title="Pipeline Scheduler")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def decimal_places(value: float) -> int:
    return max(0, -Decimal(str(value)).as_tuple().exponent)


def scale_value(value: float, scale: int) -> int:
    return int(Decimal(str(value)) * scale)


def unscale_value(value: int, scale: int) -> float:
    return value / scale


def validate_acyclic(nodes: list[NodePayload], edges: list[EdgePayload]) -> None:
    node_ids = {node.id for node in nodes}
    indegree = {node.id: 0 for node in nodes}
    adjacency = {node.id: [] for node in nodes}

    for edge in edges:
        if edge.source not in node_ids or edge.target not in node_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Edge {edge.id} references a node that does not exist.",
            )

        adjacency[edge.source].append(edge.target)
        indegree[edge.target] += 1

    queue = deque(node_id for node_id, count in indegree.items() if count == 0)
    visited = 0

    while queue:
        current = queue.popleft()
        visited += 1
        for target in adjacency[current]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)

    if visited != len(nodes):
        raise HTTPException(
            status_code=400,
            detail="The graph contains a cycle, so no valid schedule can be produced.",
        )


def get_parallelized_targets(edges: list[EdgePayload]) -> set[str]:
    return {edge.target for edge in edges if edge.parallelized}


def get_effective_multiplier(node: NodePayload, edges: list[EdgePayload]) -> int:
    return node.parallelizationMultiplier if node.id in get_parallelized_targets(edges) else 1


def get_planned_cost(nodes: list[NodePayload], edges: list[EdgePayload]) -> float:
    parallelized_targets = get_parallelized_targets(edges)
    total = 0.0
    for node in nodes:
        if node.completed:
            continue
        multiplier = node.parallelizationMultiplier if node.id in parallelized_targets else 1
        total += node.cost * multiplier
    return total


def solve_schedule_response(payload: GraphPayload) -> ScheduleResponse:
    if not payload.nodes:
        return ScheduleResponse(makespan=0, nodes=[], diagnostics=[])

    validate_acyclic(payload.nodes, payload.edges)

    scale = 10 ** max(
        [
            *(decimal_places(node.duration) for node in payload.nodes),
            *(decimal_places(node.workHoursPerWeek) for node in payload.nodes),
            *(decimal_places(person.hoursPerWeek) for person in payload.personnel),
            0,
        ]
    )
    scale = max(scale, 1)

    active_nodes = [node for node in payload.nodes if not node.completed]
    active_node_ids = {node.id for node in active_nodes}
    parallelized_targets = {
        edge.target for edge in payload.edges if edge.parallelized and edge.target in active_node_ids
    }
    personnel_capacity = {
        person.name: scale_value(person.hoursPerWeek, scale)
        for person in payload.personnel
    }
    diagnostics: list[str] = []

    if not active_nodes:
        return ScheduleResponse(
            makespan=0,
            diagnostics=["All experiments are already marked as completed."],
            nodes=[
                ScheduledNode(
                    nodeId=node.id,
                    assignedOperator=None,
                    usesPersonnel=bool(
                        [op for op in node.operators if op in personnel_capacity]
                    ),
                    start=0,
                    finish=0,
                )
                for node in payload.nodes
            ],
        )

    horizon = sum(scale_value(node.duration, scale) for node in active_nodes)
    model = cp_model.CpModel()

    start_vars: dict[str, cp_model.IntVar] = {}
    end_vars: dict[str, cp_model.IntVar] = {}
    assignment_vars: dict[tuple[str, str], cp_model.BoolVar] = {}
    operator_intervals: dict[str, list[cp_model.IntervalVar]] = {
        operator: [] for operator in personnel_capacity
    }
    operator_demands: dict[str, list[int]] = {operator: [] for operator in personnel_capacity}
    eligible_operators_by_node: dict[str, list[str]] = {}

    for node in active_nodes:
        duration = scale_value(node.duration, scale)
        effective_multiplier = node.parallelizationMultiplier if node.id in parallelized_targets else 1
        work_hours_per_week = scale_value(
            node.workHoursPerWeek * effective_multiplier,
            scale,
        )
        start = model.NewIntVar(0, horizon, f"start_{node.id}")
        end = model.NewIntVar(0, horizon, f"end_{node.id}")
        model.Add(end == start + duration)

        start_vars[node.id] = start
        end_vars[node.id] = end

        eligible_operators = [
            operator for operator in node.operators if operator in personnel_capacity
        ]
        eligible_operators_by_node[node.id] = eligible_operators

        if eligible_operators:
            presences: list[cp_model.BoolVar] = []
            for operator in eligible_operators:
                presence = model.NewBoolVar(f"assign_{node.id}_{operator}")
                interval = model.NewOptionalIntervalVar(
                    start,
                    duration,
                    end,
                    presence,
                    f"interval_{node.id}_{operator}",
                )
                assignment_vars[(node.id, operator)] = presence
                operator_intervals[operator].append(interval)
                operator_demands[operator].append(work_hours_per_week)
                presences.append(presence)

            model.AddExactlyOne(presences)
        else:
            diagnostics.append(
                f"{node.title} has no eligible operators and will be scheduled without personnel."
            )

    for operator, intervals in operator_intervals.items():
        if intervals:
            model.AddCumulative(
                intervals,
                operator_demands[operator],
                personnel_capacity[operator],
            )

    for edge in payload.edges:
        if edge.target not in active_node_ids:
            continue

        target_start = start_vars[edge.target]

        if edge.source in active_node_ids:
            if edge.parallelized:
                model.Add(target_start >= start_vars[edge.source])
            else:
                model.Add(target_start >= end_vars[edge.source])

    makespan = model.NewIntVar(0, horizon, "makespan")
    model.AddMaxEquality(makespan, list(end_vars.values()))
    weighted_sum = makespan * (len(active_nodes) * (horizon + 1) + 1) + sum(
        end_vars.values()
    )
    model.Minimize(weighted_sum)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise HTTPException(
            status_code=400,
            detail="A valid schedule could not be found for the current graph.",
        )

    scheduled_nodes: list[ScheduledNode] = []

    for node in payload.nodes:
        if node.completed:
            scheduled_nodes.append(
                ScheduledNode(
                    nodeId=node.id,
                    assignedOperator=None,
                    usesPersonnel=bool(
                        [op for op in node.operators if op in personnel_capacity]
                    ),
                    start=0,
                    finish=0,
                )
            )
            continue

        eligible_operators = eligible_operators_by_node[node.id]
        assigned_operator = next(
            (
                operator
                for operator in eligible_operators
                if solver.Value(assignment_vars[(node.id, operator)]) == 1
            ),
            None,
        )
        scheduled_nodes.append(
            ScheduledNode(
                nodeId=node.id,
                assignedOperator=assigned_operator,
                usesPersonnel=bool(eligible_operators),
                start=unscale_value(solver.Value(start_vars[node.id]), scale),
                finish=unscale_value(solver.Value(end_vars[node.id]), scale),
            )
        )

    return ScheduleResponse(
        makespan=unscale_value(solver.Value(makespan), scale),
        nodes=scheduled_nodes,
        diagnostics=diagnostics,
    )


def build_candidate_graph(
    payload: AccelerateRequest,
    edge_id: str,
) -> GraphPayload:
    next_nodes = deepcopy(payload.nodes)
    next_edges = deepcopy(payload.edges)

    for edge in next_edges:
        if edge.id == edge_id:
            edge.parallelized = True
            break

    for edge in next_edges:
        if edge.id == edge_id:
            for node in next_nodes:
                if node.id == edge.target:
                    node.parallelizationMultiplier = 1
                    break
            break

    return GraphPayload(
        personnel=deepcopy(payload.personnel),
        nodes=next_nodes,
        edges=next_edges,
    )


def enumerate_candidates(
    payload: AccelerateRequest,
    baseline_cost: float,
    baseline_duration: float,
) -> list[dict[str, object]]:
    existing_parallelized_targets = get_parallelized_targets(payload.edges)
    node_map = {node.id: node for node in payload.nodes}
    candidates: list[dict[str, object]] = []

    for edge in payload.edges:
        if edge.parallelized or edge.id in payload.rejectedCandidateIds:
            continue

        # Minimal v1: only propose a first parallelization for a successor and fix multiplier at 1x.
        if edge.target in existing_parallelized_targets:
            continue

        source_node = node_map.get(edge.source)
        target_node = node_map.get(edge.target)
        if not source_node or not target_node:
            continue

        candidate_graph = build_candidate_graph(payload, edge.id)

        try:
            schedule = solve_schedule_response(candidate_graph)
        except HTTPException:
            continue

        resulting_cost = get_planned_cost(candidate_graph.nodes, candidate_graph.edges)
        resulting_duration = schedule.makespan
        delta_cost = resulting_cost - baseline_cost
        delta_duration = baseline_duration - resulting_duration

        if payload.budgetUsd is not None and resulting_cost > payload.budgetUsd:
            continue

        if delta_duration <= 0:
            continue

        candidates.append(
            {
                "candidateId": edge.id,
                "sourceNodeId": source_node.id,
                "sourceTitle": source_node.title,
                "sourceContent": source_node.content,
                "targetNodeId": target_node.id,
                "targetTitle": target_node.title,
                "targetContent": target_node.content,
                "multiplier": 1,
                "resultingPlannedCost": resulting_cost,
                "resultingPlannedDuration": resulting_duration,
                "deltaCost": delta_cost,
                "deltaDuration": delta_duration,
            }
        )

    candidates.sort(
        key=lambda candidate: (
            -float(candidate["deltaDuration"]),
            float(candidate["deltaCost"]),
            candidate["targetTitle"],
        )
    )
    return candidates


def choose_candidate_with_llm(
    baseline_cost: float,
    baseline_duration: float,
    budget_usd: float | None,
    candidates: list[dict[str, object]],
    rejected_candidate_ids: list[str],
) -> ProposalChoice:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Accelerate requires OPENAI_API_KEY to be set on the backend.",
        )

    client = OpenAI(api_key=api_key)
    try:
        response = client.responses.create(
            model=os.getenv("OPENAI_ACCELERATE_MODEL", "gpt-5.4-2026-03-05"),
            instructions=(
                "You are an acceleration planning assistant. "
                "Choose exactly one candidate parallelization to propose next, or stop if none are worthwhile. "
                "For this v1 system, multiplier is always 1x. "
                "Prefer the largest reduction in planned duration while staying on budget. "
                "Break ties by smaller cost increase. "
                "Use the node descriptions only to write a short, sensible rationale. "
                "Do not invent candidates that are not in the list."
            ),
            input=json.dumps(
                {
                    "budget_usd": budget_usd,
                    "baseline_planned_cost": baseline_cost,
                    "baseline_planned_duration_weeks": baseline_duration,
                    "rejected_candidate_ids": rejected_candidate_ids,
                    "candidates": candidates[:8],
                }
            ),
            max_output_tokens=500,
            temperature=0.2,
            store=False,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "acceleration_choice",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": ["propose", "stop"],
                            },
                            "candidate_id": {
                                "type": ["string", "null"],
                            },
                            "summary": {
                                "type": "string",
                            },
                            "rationale": {
                                "type": "string",
                            },
                            "confidence": {
                                "type": "string",
                                "enum": ["low", "medium", "high"],
                            },
                        },
                        "required": [
                            "type",
                            "candidate_id",
                            "summary",
                            "rationale",
                            "confidence",
                        ],
                    },
                },
                "verbosity": "low",
            },
        )
    except AuthenticationError as error:
        raise HTTPException(
            status_code=400,
            detail=f"Accelerate could not authenticate with OpenAI: {error}",
        ) from error
    except APIError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Accelerate failed while calling OpenAI: {error}",
        ) from error

    return ProposalChoice.model_validate_json(response.output_text)


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/schedule", response_model=ScheduleResponse)
def schedule(payload: GraphPayload) -> ScheduleResponse:
    return solve_schedule_response(payload)


@app.post("/api/accelerate/propose", response_model=AccelerateResponse)
def accelerate_propose(payload: AccelerateRequest) -> AccelerateResponse:
    baseline_graph = GraphPayload(
        personnel=payload.personnel,
        nodes=payload.nodes,
        edges=payload.edges,
    )
    baseline_schedule = solve_schedule_response(baseline_graph)
    baseline_cost = get_planned_cost(payload.nodes, payload.edges)
    baseline_duration = baseline_schedule.makespan

    candidates = enumerate_candidates(payload, baseline_cost, baseline_duration)
    if not candidates:
        return AccelerateResponse(
            proposal=None,
            stopReason="No budget-feasible 1x parallelization remains that reduces planned duration.",
            baselinePlannedCost=baseline_cost,
            baselinePlannedDuration=baseline_duration,
            candidateCount=0,
        )

    choice = choose_candidate_with_llm(
        baseline_cost=baseline_cost,
        baseline_duration=baseline_duration,
        budget_usd=payload.budgetUsd,
        candidates=candidates,
        rejected_candidate_ids=payload.rejectedCandidateIds,
    )

    if choice.type == "stop" or not choice.candidate_id:
        return AccelerateResponse(
            proposal=None,
            stopReason=choice.rationale or "The agent chose to stop.",
            baselinePlannedCost=baseline_cost,
            baselinePlannedDuration=baseline_duration,
            candidateCount=len(candidates),
        )

    candidate = next(
        (candidate for candidate in candidates if candidate["candidateId"] == choice.candidate_id),
        None,
    )
    if not candidate:
        raise HTTPException(
            status_code=500,
            detail="Accelerate selected a candidate that was not in the shortlist.",
        )

    proposal = AccelerationProposal(
        candidateId=str(candidate["candidateId"]),
        sourceNodeId=str(candidate["sourceNodeId"]),
        sourceTitle=str(candidate["sourceTitle"]),
        targetNodeId=str(candidate["targetNodeId"]),
        targetTitle=str(candidate["targetTitle"]),
        multiplier=1,
        resultingPlannedCost=float(candidate["resultingPlannedCost"]),
        resultingPlannedDuration=float(candidate["resultingPlannedDuration"]),
        deltaCost=float(candidate["deltaCost"]),
        deltaDuration=float(candidate["deltaDuration"]),
        summary=choice.summary,
        rationale=choice.rationale,
        confidence=choice.confidence,
        fallbackUsed=False,
    )
    return AccelerateResponse(
        proposal=proposal,
        stopReason=None,
        baselinePlannedCost=baseline_cost,
        baselinePlannedDuration=baseline_duration,
        candidateCount=len(candidates),
    )
