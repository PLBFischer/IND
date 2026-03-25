from __future__ import annotations

import json
import os
from collections import deque
from copy import deepcopy
from decimal import Decimal
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import APIError, AuthenticationError, OpenAI
from ortools.sat.python import cp_model
from pydantic import BaseModel, Field, model_validator
from pydantic_core import ValidationError as PydanticValidationError


RiskLevel = Literal["Very Low", "Low", "Medium", "High", "Very High"]
NodeType = Literal[
    "in_vitro",
    "in_vivo",
    "pk",
    "tox",
    "safety_pharmacology",
    "efficacy",
    "formulation_cmc",
    "bioanalysis",
    "regulatory",
    "vendor",
    "analysis",
    "milestone",
    "other",
]
NodeStatus = Literal[
    "planned",
    "in_progress",
    "blocked",
    "completed",
    "failed",
    "canceled",
]
BlockerPriority = Literal["critical", "supporting", "exploratory"]

TERMINAL_STATUSES = {"completed", "failed", "canceled"}
BLOCKER_PRIORITY_ORDER = {"critical": 0, "supporting": 1, "exploratory": 2}


def normalize_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [
            item.strip()
            for item in value
            if isinstance(item, str) and item.strip()
        ]
    if isinstance(value, str):
        return [item.strip() for item in value.splitlines() if item.strip()]
    return []


class ProgramPayload(BaseModel):
    programTitle: str | None = None
    targetPhase1Design: str = ""
    targetIndStrategy: str = ""

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return {}

        normalized = dict(value)
        if not isinstance(normalized.get("programTitle"), str) or not normalized.get("programTitle", "").strip():
            normalized["programTitle"] = None
        return normalized


class NodePayload(BaseModel):
    id: str
    title: str
    type: NodeType = "other"
    objective: str = ""
    procedureSummary: str = ""
    successCriteria: str = ""
    decisionSupported: str = ""
    results: str = ""
    operationalNotes: str = ""
    cost: float = Field(default=0, ge=0)
    duration: float = Field(default=0, ge=0)
    workHoursPerWeek: float = Field(default=40, ge=0)
    parallelizationMultiplier: int = Field(default=1, ge=1, le=4)
    operators: list[str] = Field(default_factory=list)
    owner: str | None = None
    status: NodeStatus = "planned"
    blockerPriority: BlockerPriority = "supporting"
    phase1Relevance: str = ""
    indRelevance: str = ""
    evidenceRefs: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        if "procedureSummary" not in normalized and isinstance(normalized.get("content"), str):
            normalized["procedureSummary"] = normalized["content"]
        if "status" not in normalized and isinstance(normalized.get("completed"), bool):
            normalized["status"] = "completed" if normalized["completed"] else "planned"
        normalized["evidenceRefs"] = normalize_string_list(normalized.get("evidenceRefs"))
        if not isinstance(normalized.get("owner"), str) or not normalized.get("owner", "").strip():
            normalized["owner"] = None
        return normalized


class EdgePayload(BaseModel):
    id: str
    source: str
    target: str
    parallelized: bool = False


class PersonnelPayload(BaseModel):
    name: str
    hoursPerWeek: float = Field(ge=0)


class GraphPayload(BaseModel):
    program: ProgramPayload = Field(default_factory=ProgramPayload)
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
    edgeId: str
    sourceNodeId: str
    sourceTitle: str
    targetNodeId: str
    targetTitle: str
    multiplier: Literal[1, 2, 3, 4]
    resultingPlannedCost: float
    resultingPlannedDuration: float
    deltaCost: float
    deltaDuration: float
    estimatedSuccessProbability: float = Field(ge=0, le=1)
    expectedPlannedDuration: float
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
    estimated_success_probability: float = Field(ge=0, le=1)


class RiskRecommendation(BaseModel):
    action: str
    targetRiskDimension: Literal[
        "scientific",
        "execution",
        "regulatory",
        "coherence",
        "fragility",
        "cross_cutting",
    ]
    expectedEffect: str
    costImplication: Literal["Low", "Medium", "High"]
    timelineImpact: Literal["reduces delay", "prevents rework", "neutral"]


class NodeRiskAssessment(BaseModel):
    nodeId: str
    scientificRisk: RiskLevel
    executionRisk: RiskLevel
    regulatoryRisk: RiskLevel
    coherenceRisk: RiskLevel
    overallRisk: RiskLevel
    fragility: RiskLevel
    summary: str
    scientificDrivers: list[str] = Field(default_factory=list)
    executionDrivers: list[str] = Field(default_factory=list)
    regulatoryDrivers: list[str] = Field(default_factory=list)
    coherenceDrivers: list[str] = Field(default_factory=list)
    fragilityDrivers: list[str] = Field(default_factory=list)
    recommendations: list[RiskRecommendation] = Field(default_factory=list)
    keyAssumptions: list[str] = Field(default_factory=list)
    affectedClaims: list[str] = Field(default_factory=list)
    changeSummary: str = ""


class RiskScanRequest(BaseModel):
    graph: GraphPayload
    previousAssessments: list[NodeRiskAssessment] = Field(default_factory=list)


class RiskScanResponse(BaseModel):
    assessments: list[NodeRiskAssessment] = Field(default_factory=list)


class ParallelizationOption(BaseModel):
    action: str
    rationale: str
    prerequisites: str
    tradeoffs: str


class ScenarioAssessment(BaseModel):
    label: Literal["conservative", "base", "optimistic"]
    outlook: str


class DeepRiskAnalysis(BaseModel):
    nodeId: str
    scientificRisk: RiskLevel
    executionRisk: RiskLevel
    regulatoryRisk: RiskLevel
    coherenceRisk: RiskLevel
    overallRisk: RiskLevel
    fragility: RiskLevel
    executiveSummary: str
    detailedReasoning: str
    scientificBreakdown: list[str] = Field(default_factory=list)
    executionBreakdown: list[str] = Field(default_factory=list)
    regulatoryBreakdown: list[str] = Field(default_factory=list)
    coherenceBreakdown: list[str] = Field(default_factory=list)
    fragilityBreakdown: list[str] = Field(default_factory=list)
    keyAssumptionsUsed: list[str] = Field(default_factory=list)
    affectedDownstreamClaims: list[str] = Field(default_factory=list)
    missingEvidence: list[str] = Field(default_factory=list)
    mitigationStrategies: list[RiskRecommendation] = Field(default_factory=list)
    parallelizationOptions: list[ParallelizationOption] = Field(default_factory=list)
    whatWouldResolveUncertainty: list[str] = Field(default_factory=list)
    likelyTimelineImpact: str
    likelySpendImpact: str
    scenarios: list[ScenarioAssessment] = Field(default_factory=list)


class DeepRiskRequest(BaseModel):
    graph: GraphPayload
    nodeId: str
    previousAssessment: NodeRiskAssessment | None = None


class DeepRiskResponse(BaseModel):
    analysis: DeepRiskAnalysis


class ChatMessagePayload(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    referencedNodeIds: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    messages: list[ChatMessagePayload] = Field(default_factory=list)
    graph: GraphPayload
    schedule: ScheduleResponse | None = None


class ChatResponseMessage(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str
    referencedNodeIds: list[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    message: ChatResponseMessage


class ChatChoice(BaseModel):
    answer: str
    referenced_node_ids: list[str] = Field(default_factory=list)


class ReviewRequest(BaseModel):
    graph: GraphPayload
    schedule: ScheduleResponse | None = None


class ReviewFinding(BaseModel):
    id: str
    severity: Literal["high", "medium", "low"]
    type: Literal[
        "contradiction",
        "outdated_description",
        "redundancy",
        "instrumentation_risk",
        "dependency_mismatch",
        "phase1_ind_inconsistency",
        "missing_critical_evidence",
        "blocker_priority_mismatch",
        "orphaned_experiment",
        "wasted_spend",
        "stale_results_assumption",
        "other",
    ]
    summary: str
    details: str
    suggestedAction: str
    nodeIds: list[str] = Field(default_factory=list)


class ReviewResponse(BaseModel):
    findings: list[ReviewFinding] = Field(default_factory=list)


class ReviewChoice(BaseModel):
    findings: list[ReviewFinding] = Field(default_factory=list)


class EvidenceQueryRequest(BaseModel):
    query: str = Field(min_length=1)
    graph: GraphPayload
    schedule: ScheduleResponse | None = None


class EvidenceReference(BaseModel):
    nodeId: str
    field: str
    snippet: str
    rationale: str


class EvidenceQueryResponse(BaseModel):
    answer: str
    supportingEvidence: list[EvidenceReference] = Field(default_factory=list)
    missingEvidence: list[str] = Field(default_factory=list)
    referencedNodeIds: list[str] = Field(default_factory=list)


class EvidenceChoice(BaseModel):
    answer: str
    supportingEvidence: list[EvidenceReference] = Field(default_factory=list)
    missingEvidence: list[str] = Field(default_factory=list)
    referencedNodeIds: list[str] = Field(default_factory=list)


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


def is_node_active(node: NodePayload) -> bool:
    return node.status not in TERMINAL_STATUSES


def is_node_completed(node: NodePayload) -> bool:
    return node.status == "completed"


def get_node_effective_summary(node: NodePayload) -> str:
    return (
        node.objective.strip()
        or node.procedureSummary.strip()
        or node.decisionSupported.strip()
        or node.results.strip()
    )


def get_program_relevance_score(node: NodePayload) -> int:
    score = 0
    if node.blockerPriority == "critical":
        score += 2
    elif node.blockerPriority == "supporting":
        score += 1
    if node.phase1Relevance.strip():
        score += 1
    if node.indRelevance.strip():
        score += 1
    if node.decisionSupported.strip():
        score += 1
    return score


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
        if not is_node_active(node):
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

    active_nodes = [node for node in payload.nodes if is_node_active(node)]
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
            diagnostics=["All experiments are already in a terminal state."],
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
        if not is_node_active(node):
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
    multiplier: int,
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
                    node.parallelizationMultiplier = multiplier
                    break
            break

    return GraphPayload(
        program=deepcopy(payload.program),
        personnel=deepcopy(payload.personnel),
        nodes=next_nodes,
        edges=next_edges,
    )


def enumerate_candidates(
    payload: AccelerateRequest,
    baseline_cost: float,
    baseline_duration: float,
) -> list[dict[str, object]]:
    node_map = {node.id: node for node in payload.nodes}
    incoming_edges_by_target: dict[str, list[EdgePayload]] = {}
    for edge in payload.edges:
        incoming_edges_by_target.setdefault(edge.target, []).append(edge)
    candidates: list[dict[str, object]] = []

    for edge in payload.edges:
        if edge.parallelized:
            continue

        source_node = node_map.get(edge.source)
        target_node = node_map.get(edge.target)
        if not source_node or not target_node:
            continue
        if not is_node_active(target_node):
            continue

        current_multiplier = get_effective_multiplier(target_node, payload.edges)
        minimum_multiplier = current_multiplier if current_multiplier > 1 else 1

        incoming_dependencies = [
            {
                "edgeId": incoming_edge.id,
                "sourceNodeId": predecessor.id,
                "sourceTitle": predecessor.title,
                "sourceSummary": get_node_effective_summary(predecessor),
                "sourceStatus": predecessor.status,
                "sourceBlockerPriority": predecessor.blockerPriority,
                "alreadyParallelized": incoming_edge.parallelized,
            }
            for incoming_edge in incoming_edges_by_target.get(edge.target, [])
            if (predecessor := node_map.get(incoming_edge.source)) is not None
        ]

        for multiplier in range(minimum_multiplier, 5):
            candidate_id = f"{edge.id}::x{multiplier}"
            if candidate_id in payload.rejectedCandidateIds:
                continue

            candidate_graph = build_candidate_graph(payload, edge.id, multiplier)

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
                    "candidateId": candidate_id,
                    "edgeId": edge.id,
                    "sourceNodeId": source_node.id,
                    "sourceTitle": source_node.title,
                    "sourceType": source_node.type,
                    "sourceSummary": get_node_effective_summary(source_node),
                    "sourceDecisionSupported": source_node.decisionSupported,
                    "targetNodeId": target_node.id,
                    "targetTitle": target_node.title,
                    "targetType": target_node.type,
                    "targetSummary": get_node_effective_summary(target_node),
                    "targetStatus": target_node.status,
                    "targetBlockerPriority": target_node.blockerPriority,
                    "targetPhase1Relevance": target_node.phase1Relevance,
                    "targetIndRelevance": target_node.indRelevance,
                    "targetDecisionSupported": target_node.decisionSupported,
                    "targetProgramRelevanceScore": get_program_relevance_score(target_node),
                    "targetDurationWeeks": target_node.duration,
                    "targetCostUsd": target_node.cost,
                    "currentMultiplier": current_multiplier,
                    "multiplier": multiplier,
                    "incomingDependencies": incoming_dependencies,
                    "resultingPlannedCost": resulting_cost,
                    "resultingPlannedDuration": resulting_duration,
                    "deltaCost": delta_cost,
                    "deltaDuration": delta_duration,
                    "remainingBudget": None
                    if payload.budgetUsd is None
                    else payload.budgetUsd - resulting_cost,
                }
            )

    candidates.sort(
        key=lambda candidate: (
            BLOCKER_PRIORITY_ORDER[str(candidate["targetBlockerPriority"])],
            -float(candidate["deltaDuration"]),
            -int(candidate["targetProgramRelevanceScore"]),
            float(candidate["deltaCost"]),
            int(candidate["multiplier"]),
            candidate["targetTitle"],
        )
    )
    return candidates


def clamp_probability(value: float) -> float:
    return min(1.0, max(0.0, value))


def resolve_schedule_context(
    graph: GraphPayload,
    schedule: ScheduleResponse | None,
) -> ScheduleResponse | None:
    if schedule is not None:
        return schedule
    try:
        return solve_schedule_response(graph)
    except HTTPException:
        return None


def build_chat_graph_context(payload: ChatRequest) -> dict[str, object]:
    resolved_schedule = resolve_schedule_context(payload.graph, payload.schedule)
    node_map = {node.id: node for node in payload.graph.nodes}
    children_by_node: dict[str, list[str]] = {node.id: [] for node in payload.graph.nodes}
    parents_by_node: dict[str, list[str]] = {node.id: [] for node in payload.graph.nodes}

    for edge in payload.graph.edges:
        if edge.source in node_map and edge.target in node_map:
            children_by_node[edge.source].append(edge.target)
            parents_by_node[edge.target].append(edge.source)

    schedule_by_node_id = (
        {scheduled.nodeId: scheduled for scheduled in resolved_schedule.nodes}
        if resolved_schedule
        else {}
    )

    return {
        "program": {
            "program_title": payload.graph.program.programTitle,
            "target_phase1_design": payload.graph.program.targetPhase1Design,
            "target_ind_strategy": payload.graph.program.targetIndStrategy,
        },
        "personnel": [
            {
                "name": person.name,
                "hours_per_week": person.hoursPerWeek,
            }
            for person in payload.graph.personnel
        ],
        "nodes": [
            {
                "id": node.id,
                "title": node.title,
                "type": node.type,
                "status": node.status,
                "objective": node.objective,
                "procedure_summary": node.procedureSummary,
                "success_criteria": node.successCriteria,
                "decision_supported": node.decisionSupported,
                "results": node.results,
                "operational_notes": node.operationalNotes,
                "owner": node.owner,
                "blocker_priority": node.blockerPriority,
                "phase1_relevance": node.phase1Relevance,
                "ind_relevance": node.indRelevance,
                "evidence_refs": node.evidenceRefs,
                "active_for_schedule": is_node_active(node),
                "cost_usd": node.cost,
                "duration_weeks": node.duration,
                "work_hours_per_week": node.workHoursPerWeek,
                "effective_multiplier": get_effective_multiplier(node, payload.graph.edges),
                "eligible_operators": node.operators,
                "predecessor_node_ids": parents_by_node[node.id],
                "successor_node_ids": children_by_node[node.id],
                "schedule": (
                    {
                        "assigned_operator": schedule_by_node_id[node.id].assignedOperator,
                        "uses_personnel": schedule_by_node_id[node.id].usesPersonnel,
                        "start_week": schedule_by_node_id[node.id].start,
                        "finish_week": schedule_by_node_id[node.id].finish,
                    }
                    if node.id in schedule_by_node_id
                    else None
                ),
            }
            for node in payload.graph.nodes
        ],
        "edges": [
            {
                "id": edge.id,
                "source": edge.source,
                "target": edge.target,
                "parallelized": edge.parallelized,
            }
            for edge in payload.graph.edges
        ],
        "planned_cost_usd": get_planned_cost(payload.graph.nodes, payload.graph.edges),
        "planned_duration_weeks": resolved_schedule.makespan if resolved_schedule else None,
    }


def build_risk_graph_context(graph: GraphPayload) -> tuple[dict[str, object], ScheduleResponse]:
    schedule = solve_schedule_response(graph)
    context = build_chat_graph_context(ChatRequest(messages=[], graph=graph, schedule=schedule))
    scheduled_by_node = {node.nodeId: node for node in schedule.nodes}

    node_depths: dict[str, int] = {node.id: 0 for node in graph.nodes}
    outgoing: dict[str, list[str]] = {node.id: [] for node in graph.nodes}
    indegree: dict[str, int] = {node.id: 0 for node in graph.nodes}
    active_node_ids = {node.id for node in graph.nodes if is_node_active(node)}

    for edge in graph.edges:
        if edge.source in outgoing and edge.target in outgoing:
            outgoing[edge.source].append(edge.target)
            indegree[edge.target] += 1

    queue = deque(node_id for node_id, count in indegree.items() if count == 0)
    while queue:
        current = queue.popleft()
        for target in outgoing.get(current, []):
            node_depths[target] = max(node_depths.get(target, 0), node_depths.get(current, 0) + 1)
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)

    downstream_counts: dict[str, int] = {}

    def count_downstream(node_id: str) -> int:
        if node_id in downstream_counts:
            return downstream_counts[node_id]
        reachable: set[str] = set()
        local_queue = deque(outgoing.get(node_id, []))
        while local_queue:
            current = local_queue.popleft()
            if current in reachable:
                continue
            reachable.add(current)
            local_queue.extend(outgoing.get(current, []))
        downstream_counts[node_id] = len(reachable)
        return downstream_counts[node_id]

    critical_path_node_ids = {
        node.nodeId
        for node in schedule.nodes
        if node.nodeId in active_node_ids and abs(node.finish - schedule.makespan) < 1e-9
    }

    context["risk_focus_nodes"] = [
        {
            "node_id": node.id,
            "title": node.title,
            "status": node.status,
            "blocker_priority": node.blockerPriority,
            "phase1_relevance": node.phase1Relevance,
            "ind_relevance": node.indRelevance,
            "decision_supported": node.decisionSupported,
            "program_relevance_score": get_program_relevance_score(node),
            "schedule": (
                {
                    "start_week": scheduled_by_node[node.id].start,
                    "finish_week": scheduled_by_node[node.id].finish,
                }
                if node.id in scheduled_by_node
                else None
            ),
            "depth": node_depths.get(node.id, 0),
            "downstream_dependency_count": count_downstream(node.id),
            "critical_path_terminal": node.id in critical_path_node_ids,
        }
        for node in graph.nodes
    ]
    return context, schedule


def choose_candidate_with_llm(
    baseline_cost: float,
    baseline_duration: float,
    budget_usd: float | None,
    graph_context: dict[str, object],
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
                "You are an acceleration planning assistant for a translational program cockpit. "
                "Choose exactly one candidate edge parallelization and multiplier to propose next, or stop if none are worthwhile. "
                "Objective: shorten the credible path to Phase 1 and IND readiness while keeping planned cost within budget. "
                "Interpret a higher multiplier on the target experiment as running more parallel variants of that experiment. "
                "Higher multipliers should only be recommended when they materially improve the chance that the early parallelized attempt will still be usable once predecessor outputs are known. "
                "Use the target Phase 1 design, target IND strategy, and node metadata to judge whether a speedup strengthens or weakens the clinic-bound story. "
                "Avoid recommending acceleration for exploratory work if it does not materially improve the clinic-bound path. "
                "Prefer candidates on critical or supporting blockers that reinforce the intended Phase 1 / IND narrative. "
                "Do not chase raw makespan if it weakens evidence coherence or burns budget on poorly aligned work. "
                "Use the experiment titles, summaries, priorities, and relevance fields to estimate dependency risk and likely success probability. "
                "Think about whether the successor genuinely depends on precise predecessor outputs, and whether multiple variants are likely to hedge that risk. "
                "Use this rough expected-duration model when comparing candidates: expected duration is the deterministic resulting planned duration plus (1 - success probability) * target duration weeks. "
                "Use diminishing returns: if moving from 1x to a higher multiplier only marginally helps, prefer the cheaper option and preserve budget for future acceleration opportunities. "
                "Prefer candidates with meaningful deterministic duration savings, good expected value, sensible scientific and operational logic, and preserved program coherence. "
                "Stop if none of the candidates seem worthwhile after risk adjustment. "
                "If you choose stop, set estimated_success_probability to 0. "
                "Do not invent candidates that are not in the list."
            ),
            input=json.dumps(
                {
                    "graph_context": graph_context,
                    "budget_usd": budget_usd,
                    "baseline_planned_cost": baseline_cost,
                    "baseline_planned_duration_weeks": baseline_duration,
                    "rejected_candidate_ids": rejected_candidate_ids,
                    "candidates": candidates[:24],
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
                            "estimated_success_probability": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1,
                            },
                        },
                        "required": [
                            "type",
                            "candidate_id",
                            "summary",
                            "rationale",
                            "confidence",
                            "estimated_success_probability",
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


def score_risks_with_llm(payload: RiskScanRequest) -> RiskScanResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Risk scoring requires OPENAI_API_KEY to be set on the backend.",
        )

    active_nodes = [node for node in payload.graph.nodes if is_node_active(node)]
    if not active_nodes:
        return RiskScanResponse(assessments=[])

    graph_context, schedule = build_risk_graph_context(payload.graph)
    client = OpenAI(api_key=api_key)
    node_ids = {node.id for node in active_nodes}

    try:
        response = client.responses.create(
            model=os.getenv("OPENAI_RISK_MODEL", "gpt-5.4-2026-03-05"),
            instructions=(
                "You evaluate preclinical program experiments for first-pass risk, Phase 1 / IND coherence risk, and program fragility. "
                "Follow this policy strictly: score each active node on scientific risk, execution risk, regulatory risk, coherence risk, overall risk, and fragility. "
                "Use exactly these buckets: Very Low, Low, Medium, High, Very High. "
                "Do not use numeric probabilities. "
                "Risk means likelihood of failure, repetition, redesign, delay, or added cost. "
                "Coherence risk means likelihood that the node, its absence, its delay, or its current results undermine the intended Phase 1 design or IND story. "
                "Fragility means program-level impact if the node slips or fails, including critical path disruption, downstream dependency depth, rework cascades, replaceability, and hedgeability through parallelization. "
                "Use the graph snapshot, program context, and derived schedule as the source of truth for program structure. "
                "Be concise but specific. Avoid boilerplate. "
                "Provide recommendations whenever overall risk, coherence risk, or fragility is Medium or higher. "
                "List key assumptions and affected program claims whenever they materially shape the assessment. "
                "When previous assessments are provided, include a short changeSummary that explains what changed and why; otherwise leave changeSummary empty. "
                "Do not score terminal nodes. "
                "Return one assessment for every active node and only those nodes."
            ),
            input=json.dumps(
                {
                    "graph_context": graph_context,
                    "schedule": schedule.model_dump(),
                    "previous_assessments": [assessment.model_dump() for assessment in payload.previousAssessments],
                }
            ),
            max_output_tokens=7000,
            temperature=0.2,
            store=False,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "risk_scan",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "assessments": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "nodeId": {"type": "string"},
                                        "scientificRisk": {
                                            "type": "string",
                                            "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                        },
                                        "executionRisk": {
                                            "type": "string",
                                            "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                        },
                                        "regulatoryRisk": {
                                            "type": "string",
                                            "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                        },
                                        "coherenceRisk": {
                                            "type": "string",
                                            "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                        },
                                        "overallRisk": {
                                            "type": "string",
                                            "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                        },
                                        "fragility": {
                                            "type": "string",
                                            "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                        },
                                        "summary": {"type": "string"},
                                        "scientificDrivers": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "executionDrivers": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "regulatoryDrivers": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "coherenceDrivers": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "fragilityDrivers": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "recommendations": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "additionalProperties": False,
                                                "properties": {
                                                    "action": {"type": "string"},
                                                    "targetRiskDimension": {
                                                        "type": "string",
                                                        "enum": [
                                                            "scientific",
                                                            "execution",
                                                            "regulatory",
                                                            "coherence",
                                                            "fragility",
                                                            "cross_cutting",
                                                        ],
                                                    },
                                                    "expectedEffect": {"type": "string"},
                                                    "costImplication": {
                                                        "type": "string",
                                                        "enum": ["Low", "Medium", "High"],
                                                    },
                                                    "timelineImpact": {
                                                        "type": "string",
                                                        "enum": ["reduces delay", "prevents rework", "neutral"],
                                                    },
                                                },
                                                "required": [
                                                    "action",
                                                    "targetRiskDimension",
                                                    "expectedEffect",
                                                    "costImplication",
                                                    "timelineImpact",
                                                ],
                                            },
                                        },
                                        "keyAssumptions": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "affectedClaims": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "changeSummary": {"type": "string"},
                                    },
                                    "required": [
                                        "nodeId",
                                        "scientificRisk",
                                        "executionRisk",
                                        "regulatoryRisk",
                                        "coherenceRisk",
                                        "overallRisk",
                                        "fragility",
                                        "summary",
                                        "scientificDrivers",
                                        "executionDrivers",
                                        "regulatoryDrivers",
                                        "coherenceDrivers",
                                        "fragilityDrivers",
                                        "recommendations",
                                        "keyAssumptions",
                                        "affectedClaims",
                                        "changeSummary",
                                    ],
                                },
                            }
                        },
                        "required": ["assessments"],
                    },
                },
                "verbosity": "low",
            },
        )
    except AuthenticationError as error:
        raise HTTPException(
            status_code=400,
            detail=f"Risk scoring could not authenticate with OpenAI: {error}",
        ) from error
    except APIError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Risk scoring failed while calling OpenAI: {error}",
        ) from error

    parsed = RiskScanResponse.model_validate_json(response.output_text)
    assessments = [
        assessment
        for assessment in parsed.assessments
        if assessment.nodeId in node_ids
    ]
    return RiskScanResponse(assessments=assessments)


def deep_risk_analysis_with_llm(payload: DeepRiskRequest) -> DeepRiskResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Deep risk reasoning requires OPENAI_API_KEY to be set on the backend.",
        )

    node_map = {node.id: node for node in payload.graph.nodes}
    focus_node = node_map.get(payload.nodeId)
    if not focus_node:
        raise HTTPException(status_code=404, detail="The requested node was not found.")
    if not is_node_active(focus_node):
        raise HTTPException(
            status_code=400,
            detail="Deep risk reasoning is only available for active nodes.",
        )

    graph_context, schedule = build_risk_graph_context(payload.graph)
    client = OpenAI(api_key=api_key)

    try:
        response = client.responses.create(
            model=os.getenv("OPENAI_RISK_DEEP_MODEL", "gpt-5.4-2026-03-05"),
            instructions=(
                "You are producing a deep risk, fragility, and Phase 1 / IND coherence assessment for one preclinical program node. "
                "Use the graph snapshot and derived schedule as the source of truth for program structure, dependencies, and timeline. "
                "Provide a rigorous but decision-oriented analysis. "
                "Do not reveal hidden chain-of-thought; instead provide an explicit, well-structured explanation of the main reasoning and evidence. "
                "Use exactly these buckets for each category: Very Low, Low, Medium, High, Very High. "
                "No numeric probabilities. "
                "Coherence risk must focus on whether the node and its current state support the target Phase 1 design and IND story. "
                "Fragility must focus on program-level impact if the node slips or fails, not just the chance of failure. "
                "State the key assumptions, affected downstream claims, missing evidence, and what would resolve uncertainty. "
                "Mitigations should be concrete, and parallelization options should discuss whether earlier downstream work can be responsibly hedged. "
                "If previous assessment data is provided, incorporate it where useful."
            ),
            input=json.dumps(
                {
                    "focus_node_id": payload.nodeId,
                    "graph_context": graph_context,
                    "schedule": schedule.model_dump(),
                    "previous_assessment": payload.previousAssessment.model_dump()
                    if payload.previousAssessment
                    else None,
                }
            ),
            max_output_tokens=5000,
            temperature=0.2,
            store=False,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "deep_risk_analysis",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "analysis": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "nodeId": {"type": "string"},
                                    "scientificRisk": {
                                        "type": "string",
                                        "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                    },
                                    "executionRisk": {
                                        "type": "string",
                                        "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                    },
                                    "regulatoryRisk": {
                                        "type": "string",
                                        "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                    },
                                    "coherenceRisk": {
                                        "type": "string",
                                        "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                    },
                                    "overallRisk": {
                                        "type": "string",
                                        "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                    },
                                    "fragility": {
                                        "type": "string",
                                        "enum": ["Very Low", "Low", "Medium", "High", "Very High"],
                                    },
                                    "executiveSummary": {"type": "string"},
                                    "detailedReasoning": {"type": "string"},
                                    "scientificBreakdown": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "executionBreakdown": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "regulatoryBreakdown": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "coherenceBreakdown": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "fragilityBreakdown": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "keyAssumptionsUsed": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "affectedDownstreamClaims": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "missingEvidence": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "mitigationStrategies": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "additionalProperties": False,
                                            "properties": {
                                                "action": {"type": "string"},
                                                "targetRiskDimension": {
                                                    "type": "string",
                                                    "enum": [
                                                        "scientific",
                                                        "execution",
                                                        "regulatory",
                                                        "coherence",
                                                        "fragility",
                                                        "cross_cutting",
                                                    ],
                                                },
                                                "expectedEffect": {"type": "string"},
                                                "costImplication": {
                                                    "type": "string",
                                                    "enum": ["Low", "Medium", "High"],
                                                },
                                                "timelineImpact": {
                                                    "type": "string",
                                                    "enum": ["reduces delay", "prevents rework", "neutral"],
                                                },
                                            },
                                            "required": [
                                                "action",
                                                "targetRiskDimension",
                                                "expectedEffect",
                                                "costImplication",
                                                "timelineImpact",
                                            ],
                                        },
                                    },
                                    "parallelizationOptions": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "additionalProperties": False,
                                            "properties": {
                                                "action": {"type": "string"},
                                                "rationale": {"type": "string"},
                                                "prerequisites": {"type": "string"},
                                                "tradeoffs": {"type": "string"},
                                            },
                                            "required": [
                                                "action",
                                                "rationale",
                                                "prerequisites",
                                                "tradeoffs",
                                            ],
                                        },
                                    },
                                    "whatWouldResolveUncertainty": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "likelyTimelineImpact": {"type": "string"},
                                    "likelySpendImpact": {"type": "string"},
                                    "scenarios": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "additionalProperties": False,
                                            "properties": {
                                                "label": {
                                                    "type": "string",
                                                    "enum": ["conservative", "base", "optimistic"],
                                                },
                                                "outlook": {"type": "string"},
                                            },
                                            "required": ["label", "outlook"],
                                        },
                                    },
                                },
                                "required": [
                                    "nodeId",
                                    "scientificRisk",
                                    "executionRisk",
                                    "regulatoryRisk",
                                    "coherenceRisk",
                                    "overallRisk",
                                    "fragility",
                                    "executiveSummary",
                                    "detailedReasoning",
                                    "scientificBreakdown",
                                    "executionBreakdown",
                                    "regulatoryBreakdown",
                                    "coherenceBreakdown",
                                    "fragilityBreakdown",
                                    "keyAssumptionsUsed",
                                    "affectedDownstreamClaims",
                                    "missingEvidence",
                                    "mitigationStrategies",
                                    "parallelizationOptions",
                                    "whatWouldResolveUncertainty",
                                    "likelyTimelineImpact",
                                    "likelySpendImpact",
                                    "scenarios",
                                ],
                            }
                        },
                        "required": ["analysis"],
                    },
                },
                "verbosity": "low",
            },
        )
    except AuthenticationError as error:
        raise HTTPException(
            status_code=400,
            detail=f"Deep risk reasoning could not authenticate with OpenAI: {error}",
        ) from error
    except APIError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Deep risk reasoning failed while calling OpenAI: {error}",
        ) from error

    parsed = DeepRiskResponse.model_validate_json(response.output_text)
    if parsed.analysis.nodeId != payload.nodeId:
        raise HTTPException(
            status_code=502,
            detail="Deep risk reasoning returned a mismatched node.",
        )
    return parsed


def answer_chat_with_llm(payload: ChatRequest) -> ChatResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Grounded chat requires OPENAI_API_KEY to be set on the backend.",
        )

    client = OpenAI(api_key=api_key)
    node_ids = {node.id for node in payload.graph.nodes}

    try:
        response = client.responses.create(
            model=os.getenv("OPENAI_CHAT_MODEL", "gpt-5.4-2026-03-05"),
            instructions=(
                "You are a scientific program planning assistant embedded in a graph-based translational program cockpit. "
                "Use the current graph snapshot and program context as the sole source of truth for any claims about what experiments exist, what results belong to the user's program, what the intended Phase 1 / IND path is, and how nodes in the graph relate to one another. "
                "You may also use your general scientific and drug-development knowledge to provide interpretation, judgment, suggestions, and opinion. "
                "The latest graph snapshot in the current request is the source of truth and overrides any earlier conversation content if they conflict. "
                "When an answer mixes graph-grounded facts and your general knowledge, clearly distinguish them in the wording. "
                "If the answer depends on specific experiments or milestones, cite the corresponding node IDs in referenced_node_ids. "
                "Do not write raw node IDs in the prose answer itself; keep node references only in referenced_node_ids. "
                "Only include node IDs that actually appear in the graph. "
                "If the graph does not contain enough information to support a graph-grounded claim, say so explicitly instead of inventing program facts. "
                "Keep answers concise but useful for a researcher inspecting the plan."
            ),
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": json.dumps(
                                {
                                    "graph_context": build_chat_graph_context(payload),
                                }
                            ),
                        }
                    ],
                },
                *[
                    {
                        "role": message.role,
                        "content": [
                            {
                                "type": "input_text"
                                if message.role == "user"
                                else "output_text",
                                "text": message.content,
                            }
                        ],
                    }
                    for message in payload.messages
                ],
            ],
            max_output_tokens=600,
            temperature=0.2,
            store=False,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "chat_answer",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "answer": {
                                "type": "string",
                            },
                            "referenced_node_ids": {
                                "type": "array",
                                "items": {
                                    "type": "string",
                                },
                            },
                        },
                        "required": ["answer", "referenced_node_ids"],
                    },
                },
                "verbosity": "low",
            },
        )
    except AuthenticationError as error:
        raise HTTPException(
            status_code=400,
            detail=f"Grounded chat could not authenticate with OpenAI: {error}",
        ) from error
    except APIError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Grounded chat failed while calling OpenAI: {error}",
        ) from error

    choice = ChatChoice.model_validate_json(response.output_text)
    referenced_node_ids = [
        node_id for node_id in choice.referenced_node_ids if node_id in node_ids
    ]
    return ChatResponse(
        message=ChatResponseMessage(
            content=choice.answer,
            referencedNodeIds=referenced_node_ids,
        )
    )


def review_graph_with_llm(payload: ReviewRequest) -> ReviewResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Review requires OPENAI_API_KEY to be set on the backend.",
        )

    client = OpenAI(api_key=api_key)
    node_ids = {node.id for node in payload.graph.nodes}

    try:
        response = client.responses.create(
            model=os.getenv("OPENAI_REVIEW_MODEL", "gpt-5.4-2026-03-05"),
            instructions=(
                "You are reviewing a translational R&D experiment graph for contradictions, outdated downstream assumptions, redundancies, instrumentation risks, dependency mismatches, Phase 1 / IND inconsistencies, missing critical evidence, blocker-priority mismatches, orphaned experiments, wasted spend, and stale results assumptions. "
                "Use the current graph snapshot as the sole source of truth for claims about the user's actual program. "
                "Read the objective, procedure summary, decision supported, results, and program-relevance fields for every node. "
                "Do not limit yourself to completed nodes: intermediate results in ongoing nodes can also invalidate future plans. "
                "Identify cases where results from one node suggest that another node's plan should be updated, reconsidered, split, deprioritized, or removed. "
                "Use the target Phase 1 design, target IND strategy, graph topology, and schedule context when deciding whether work is aligned or wasted. "
                "Focus on high-signal findings rather than exhaustive commentary. Keep each finding concise. "
                "Do not invent scientific results that are not in the graph. "
                "Do not write raw node IDs in the prose fields; keep node references only in nodeIds. "
                "Return at most 8 findings, ordered from most important to least important."
            ),
            input=json.dumps(
                {
                    "graph_context": build_chat_graph_context(
                        ChatRequest(messages=[], graph=payload.graph, schedule=payload.schedule)
                    )
                }
            ),
            max_output_tokens=2400,
            temperature=0.2,
            store=False,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "graph_review",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "findings": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "id": {"type": "string"},
                                        "severity": {
                                            "type": "string",
                                            "enum": ["high", "medium", "low"],
                                        },
                                        "type": {
                                            "type": "string",
                                            "enum": [
                                                "contradiction",
                                                "outdated_description",
                                                "redundancy",
                                                "instrumentation_risk",
                                                "dependency_mismatch",
                                                "phase1_ind_inconsistency",
                                                "missing_critical_evidence",
                                                "blocker_priority_mismatch",
                                                "orphaned_experiment",
                                                "wasted_spend",
                                                "stale_results_assumption",
                                                "other",
                                            ],
                                        },
                                        "summary": {"type": "string"},
                                        "details": {"type": "string"},
                                        "suggestedAction": {"type": "string"},
                                        "nodeIds": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                    },
                                    "required": [
                                        "id",
                                        "severity",
                                        "type",
                                        "summary",
                                        "details",
                                        "suggestedAction",
                                        "nodeIds",
                                    ],
                                },
                            }
                        },
                        "required": ["findings"],
                    },
                },
                "verbosity": "low",
            },
        )
    except AuthenticationError as error:
        raise HTTPException(
            status_code=400,
            detail=f"Review could not authenticate with OpenAI: {error}",
        ) from error
    except APIError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Review failed while calling OpenAI: {error}",
        ) from error

    try:
        choice = ReviewChoice.model_validate_json(response.output_text)
    except PydanticValidationError as error:
        raise HTTPException(
            status_code=502,
            detail="Review produced an incomplete response. Please run Review again.",
        ) from error
    findings = [
        ReviewFinding(
            id=finding.id,
            severity=finding.severity,
            type=finding.type,
            summary=finding.summary,
            details=finding.details,
            suggestedAction=finding.suggestedAction,
            nodeIds=[node_id for node_id in finding.nodeIds if node_id in node_ids],
        )
        for finding in choice.findings
    ]
    return ReviewResponse(findings=findings)


def answer_evidence_query_with_llm(payload: EvidenceQueryRequest) -> EvidenceQueryResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Evidence query requires OPENAI_API_KEY to be set on the backend.",
        )

    client = OpenAI(api_key=api_key)
    node_ids = {node.id for node in payload.graph.nodes}

    try:
        response = client.responses.create(
            model=os.getenv("OPENAI_EVIDENCE_MODEL", "gpt-5.4-2026-03-05"),
            instructions=(
                "You answer evidence queries over a translational program graph. "
                "Use the provided graph snapshot and program context as the source of truth for what evidence exists in the user's program. "
                "You may use general scientific knowledge to interpret the evidence, but never invent graph-specific facts. "
                "Return a concise answer, a list of supporting evidence snippets tied to node IDs and fields, and a list of missing evidence or weakly supported claims if relevant. "
                "Only cite node IDs that exist in the graph. "
                "If the graph does not support the claim directly, say so clearly and put the gap in missingEvidence. "
                "Keep snippets short and inspectable."
            ),
            input=json.dumps(
                {
                    "query": payload.query,
                    "graph_context": build_chat_graph_context(
                        ChatRequest(messages=[], graph=payload.graph, schedule=payload.schedule)
                    ),
                }
            ),
            max_output_tokens=2400,
            temperature=0.2,
            store=False,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "evidence_query",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "answer": {"type": "string"},
                            "supportingEvidence": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "nodeId": {"type": "string"},
                                        "field": {"type": "string"},
                                        "snippet": {"type": "string"},
                                        "rationale": {"type": "string"},
                                    },
                                    "required": ["nodeId", "field", "snippet", "rationale"],
                                },
                            },
                            "missingEvidence": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "referencedNodeIds": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": [
                            "answer",
                            "supportingEvidence",
                            "missingEvidence",
                            "referencedNodeIds",
                        ],
                    },
                },
                "verbosity": "low",
            },
        )
    except AuthenticationError as error:
        raise HTTPException(
            status_code=400,
            detail=f"Evidence query could not authenticate with OpenAI: {error}",
        ) from error
    except APIError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Evidence query failed while calling OpenAI: {error}",
        ) from error

    try:
        choice = EvidenceChoice.model_validate_json(response.output_text)
    except PydanticValidationError as error:
        raise HTTPException(
            status_code=502,
            detail="Evidence query produced an incomplete response. Please run it again.",
        ) from error

    filtered_supporting_evidence = [
        evidence
        for evidence in choice.supportingEvidence
        if evidence.nodeId in node_ids
    ]
    referenced_node_ids = [
        node_id for node_id in choice.referencedNodeIds if node_id in node_ids
    ]

    return EvidenceQueryResponse(
        answer=choice.answer,
        supportingEvidence=filtered_supporting_evidence,
        missingEvidence=choice.missingEvidence,
        referencedNodeIds=referenced_node_ids,
    )


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/schedule", response_model=ScheduleResponse)
def schedule(payload: GraphPayload) -> ScheduleResponse:
    return solve_schedule_response(payload)


@app.post("/api/accelerate/propose", response_model=AccelerateResponse)
def accelerate_propose(payload: AccelerateRequest) -> AccelerateResponse:
    baseline_graph = GraphPayload(
        program=payload.program,
        personnel=payload.personnel,
        nodes=payload.nodes,
        edges=payload.edges,
    )
    baseline_schedule = solve_schedule_response(baseline_graph)
    baseline_cost = get_planned_cost(payload.nodes, payload.edges)
    baseline_duration = baseline_schedule.makespan
    baseline_graph_context = build_chat_graph_context(
        ChatRequest(messages=[], graph=baseline_graph, schedule=baseline_schedule)
    )

    candidates = enumerate_candidates(payload, baseline_cost, baseline_duration)
    if not candidates:
        return AccelerateResponse(
            proposal=None,
            stopReason="No budget-feasible parallelization remains that credibly improves the Phase 1 / IND path.",
            baselinePlannedCost=baseline_cost,
            baselinePlannedDuration=baseline_duration,
            candidateCount=0,
        )

    choice = choose_candidate_with_llm(
        baseline_cost=baseline_cost,
        baseline_duration=baseline_duration,
        budget_usd=payload.budgetUsd,
        graph_context=baseline_graph_context,
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
        edgeId=str(candidate["edgeId"]),
        sourceNodeId=str(candidate["sourceNodeId"]),
        sourceTitle=str(candidate["sourceTitle"]),
        targetNodeId=str(candidate["targetNodeId"]),
        targetTitle=str(candidate["targetTitle"]),
        multiplier=int(candidate["multiplier"]),
        resultingPlannedCost=float(candidate["resultingPlannedCost"]),
        resultingPlannedDuration=float(candidate["resultingPlannedDuration"]),
        deltaCost=float(candidate["deltaCost"]),
        deltaDuration=float(candidate["deltaDuration"]),
        estimatedSuccessProbability=clamp_probability(choice.estimated_success_probability),
        expectedPlannedDuration=float(candidate["resultingPlannedDuration"])
        + (1 - clamp_probability(choice.estimated_success_probability))
        * float(candidate["targetDurationWeeks"]),
        summary=choice.summary,
        rationale=choice.rationale,
        confidence=choice.confidence,
        fallbackUsed=False,
    )
    if proposal.expectedPlannedDuration >= baseline_duration:
        return AccelerateResponse(
            proposal=None,
            stopReason="No parallelization candidate appears worthwhile after risk and coherence adjustment.",
            baselinePlannedCost=baseline_cost,
            baselinePlannedDuration=baseline_duration,
            candidateCount=len(candidates),
        )
    return AccelerateResponse(
        proposal=proposal,
        stopReason=None,
        baselinePlannedCost=baseline_cost,
        baselinePlannedDuration=baseline_duration,
        candidateCount=len(candidates),
    )


@app.post("/api/risk/scan", response_model=RiskScanResponse)
def risk_scan(payload: RiskScanRequest) -> RiskScanResponse:
    return score_risks_with_llm(payload)


@app.post("/api/risk/deep", response_model=DeepRiskResponse)
def risk_deep(payload: DeepRiskRequest) -> DeepRiskResponse:
    return deep_risk_analysis_with_llm(payload)


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    return answer_chat_with_llm(payload)


@app.post("/api/review", response_model=ReviewResponse)
def review(payload: ReviewRequest) -> ReviewResponse:
    return review_graph_with_llm(payload)


@app.post("/api/evidence/query", response_model=EvidenceQueryResponse)
def evidence_query(payload: EvidenceQueryRequest) -> EvidenceQueryResponse:
    return answer_evidence_query_with_llm(payload)
