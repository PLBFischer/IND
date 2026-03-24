from __future__ import annotations

from collections import deque
from decimal import Decimal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ortools.sat.python import cp_model
from pydantic import BaseModel, Field


class NodePayload(BaseModel):
    id: str
    title: str
    duration: float = Field(ge=0)
    operators: list[str] = Field(default_factory=list)
    completed: bool = False


class EdgePayload(BaseModel):
    id: str
    source: str
    target: str


class ScheduleRequest(BaseModel):
    personnel: list[str] = Field(default_factory=list)
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


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/schedule", response_model=ScheduleResponse)
def schedule(payload: ScheduleRequest) -> ScheduleResponse:
    if not payload.nodes:
        return ScheduleResponse(makespan=0, nodes=[], diagnostics=[])

    validate_acyclic(payload.nodes, payload.edges)

    scale = 10 ** max(decimal_places(node.duration) for node in payload.nodes)
    scale = max(scale, 1)

    active_nodes = [node for node in payload.nodes if not node.completed]
    active_node_ids = {node.id for node in active_nodes}
    personnel_set = set(payload.personnel)
    diagnostics: list[str] = []

    if not active_nodes:
        return ScheduleResponse(
            makespan=0,
            diagnostics=["All experiments are already marked as completed."],
            nodes=[
                ScheduledNode(
                    nodeId=node.id,
                    assignedOperator=None,
                    usesPersonnel=bool([op for op in node.operators if op in personnel_set]),
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
        operator: [] for operator in payload.personnel
    }
    eligible_operators_by_node: dict[str, list[str]] = {}

    for node in active_nodes:
        duration = scale_value(node.duration, scale)
        start = model.NewIntVar(0, horizon, f"start_{node.id}")
        end = model.NewIntVar(0, horizon, f"end_{node.id}")
        model.Add(end == start + duration)

        start_vars[node.id] = start
        end_vars[node.id] = end

        eligible_operators = [
            operator for operator in node.operators if operator in personnel_set
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
                presences.append(presence)

            model.AddExactlyOne(presences)
        else:
            diagnostics.append(
                f"{node.title} has no eligible operators and will be scheduled without personnel."
            )

    for operator, intervals in operator_intervals.items():
        if intervals:
            model.AddNoOverlap(intervals)

    for edge in payload.edges:
        if edge.target not in active_node_ids:
            continue

        target_start = start_vars[edge.target]

        if edge.source in active_node_ids:
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
                    usesPersonnel=bool([op for op in node.operators if op in personnel_set]),
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
