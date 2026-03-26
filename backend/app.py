from __future__ import annotations

import json
import os
import re
import ssl
from collections import deque
from copy import deepcopy
from decimal import Decimal
from html import unescape
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import APIError, AuthenticationError, OpenAI
from ortools.sat.python import cp_model
from pydantic import BaseModel, Field, model_validator
from pydantic_core import ValidationError as PydanticValidationError

try:
    import certifi
except ImportError:  # pragma: no cover
    certifi = None

from backend.pathway_models import (
    AggregatedRelation,
    AggregationPassResult,
    EvidenceCard,
    EvidenceItem,
    ExtractionPassResult,
    NormalizedEntity,
    ParsedSourceSummary,
    PathwayBuildRequest,
    PathwayBuildResponse,
    PathwayGraph,
    PathwayNodePayload,
    PathwayPaperSource,
    PathwayQueryPlan,
    PathwayQueryRequest,
    PathwayQueryResponse,
    PathwaySanityFinding,
    PathwaySanityReport,
    PathwaySanitySummary,
    PaperChunk,
    ResolvedEntityMatch,
    UnresolvedIssue,
)
from backend.pathway_prompts import (
    AGGREGATION_SYSTEM_PROMPT,
    EXTRACTION_SYSTEM_PROMPT,
    QUERY_SYSTEM_PROMPT,
    SANITY_SYSTEM_PROMPT,
)


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
    nodeKind: Literal["experiment"] = "experiment"
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
    linkedPathwayNodeIds: list[str] = Field(default_factory=list)

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
        normalized.setdefault("nodeKind", "experiment")
        normalized["evidenceRefs"] = normalize_string_list(normalized.get("evidenceRefs"))
        normalized["linkedPathwayNodeIds"] = normalize_string_list(
            normalized.get("linkedPathwayNodeIds")
        )
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
    nodes: list[NodePayload | PathwayNodePayload] = Field(default_factory=list)
    edges: list[EdgePayload] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_node_kinds(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        raw_nodes = normalized.get("nodes")
        if isinstance(raw_nodes, list):
            normalized["nodes"] = [
                {**node, "nodeKind": node.get("nodeKind", "experiment")}
                if isinstance(node, dict)
                else node
                for node in raw_nodes
            ]
        return normalized


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


def is_experiment_node(node: NodePayload | PathwayNodePayload) -> bool:
    return isinstance(node, NodePayload)


def is_pathway_node(node: NodePayload | PathwayNodePayload) -> bool:
    return isinstance(node, PathwayNodePayload)


def get_experiment_nodes(graph: GraphPayload) -> list[NodePayload]:
    return [node for node in graph.nodes if is_experiment_node(node)]


def get_pathway_nodes(graph: GraphPayload) -> list[PathwayNodePayload]:
    return [node for node in graph.nodes if is_pathway_node(node)]


def get_experiment_edges(
    nodes: list[NodePayload],
    edges: list[EdgePayload],
) -> list[EdgePayload]:
    node_ids = {node.id for node in nodes}
    return [
        edge
        for edge in edges
        if edge.source in node_ids and edge.target in node_ids
    ]


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
    experiment_nodes = get_experiment_nodes(payload)
    experiment_edges = get_experiment_edges(experiment_nodes, payload.edges)

    if not experiment_nodes:
        return ScheduleResponse(makespan=0, nodes=[], diagnostics=[])

    validate_acyclic(experiment_nodes, experiment_edges)

    scale = 10 ** max(
        [
            *(decimal_places(node.duration) for node in experiment_nodes),
            *(decimal_places(node.workHoursPerWeek) for node in experiment_nodes),
            *(decimal_places(person.hoursPerWeek) for person in payload.personnel),
            0,
        ]
    )
    scale = max(scale, 1)

    active_nodes = [node for node in experiment_nodes if is_node_active(node)]
    active_node_ids = {node.id for node in active_nodes}
    parallelized_targets = {
        edge.target
        for edge in experiment_edges
        if edge.parallelized and edge.target in active_node_ids
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
                for node in experiment_nodes
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

    for edge in experiment_edges:
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

    for node in experiment_nodes:
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
    experiment_nodes = get_experiment_nodes(payload)
    experiment_edges = get_experiment_edges(experiment_nodes, payload.edges)
    node_map = {node.id: node for node in experiment_nodes}
    incoming_edges_by_target: dict[str, list[EdgePayload]] = {}
    for edge in experiment_edges:
        incoming_edges_by_target.setdefault(edge.target, []).append(edge)
    candidates: list[dict[str, object]] = []

    for edge in experiment_edges:
        if edge.parallelized:
            continue

        source_node = node_map.get(edge.source)
        target_node = node_map.get(edge.target)
        if not source_node or not target_node:
            continue
        if not is_node_active(target_node):
            continue

        current_multiplier = get_effective_multiplier(target_node, experiment_edges)
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

            candidate_experiment_nodes = get_experiment_nodes(candidate_graph)
            candidate_experiment_edges = get_experiment_edges(
                candidate_experiment_nodes,
                candidate_graph.edges,
            )
            resulting_cost = get_planned_cost(
                candidate_experiment_nodes,
                candidate_experiment_edges,
            )
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
    experiment_nodes = get_experiment_nodes(payload.graph)
    pathway_nodes = get_pathway_nodes(payload.graph)
    experiment_edges = get_experiment_edges(experiment_nodes, payload.graph.edges)
    node_map = {node.id: node for node in experiment_nodes}
    children_by_node: dict[str, list[str]] = {node.id: [] for node in experiment_nodes}
    parents_by_node: dict[str, list[str]] = {node.id: [] for node in experiment_nodes}

    for edge in experiment_edges:
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
            for node in experiment_nodes
        ],
        "edges": [
            {
                "id": edge.id,
                "source": edge.source,
                "target": edge.target,
                "parallelized": edge.parallelized,
            }
            for edge in experiment_edges
        ],
        "pathway_nodes": [
            {
                "id": node.id,
                "title": node.title,
                "summary": node.summary,
                "focus_terms": node.focusTerms,
                "extraction_status": node.extractionStatus,
                "linked_experiment_node_ids": node.linkedExperimentNodeIds,
                "default_relation_count": len(node.pathwayGraph.default_relations)
                if node.pathwayGraph
                else 0,
                "nondefault_relation_count": len(node.pathwayGraph.nondefault_relations)
                if node.pathwayGraph
                else 0,
                "high_priority_issue_count": node.sanityReport.summary.high_priority_issue_count
                if node.sanityReport
                else 0,
                "top_unresolved_issues": [
                    issue.description
                    for issue in (node.pathwayGraph.unresolved_issues if node.pathwayGraph else [])[:3]
                ],
            }
            for node in pathway_nodes
        ],
        "planned_cost_usd": get_planned_cost(experiment_nodes, experiment_edges),
        "planned_duration_weeks": resolved_schedule.makespan if resolved_schedule else None,
    }


def build_risk_graph_context(graph: GraphPayload) -> tuple[dict[str, object], ScheduleResponse]:
    schedule = solve_schedule_response(graph)
    context = build_chat_graph_context(ChatRequest(messages=[], graph=graph, schedule=schedule))
    scheduled_by_node = {node.nodeId: node for node in schedule.nodes}

    experiment_nodes = get_experiment_nodes(graph)
    experiment_edges = get_experiment_edges(experiment_nodes, graph.edges)
    node_depths: dict[str, int] = {node.id: 0 for node in experiment_nodes}
    outgoing: dict[str, list[str]] = {node.id: [] for node in experiment_nodes}
    indegree: dict[str, int] = {node.id: 0 for node in experiment_nodes}
    active_node_ids = {node.id for node in experiment_nodes if is_node_active(node)}

    for edge in experiment_edges:
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
        for node in experiment_nodes
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

    active_nodes = [node for node in get_experiment_nodes(payload.graph) if is_node_active(node)]
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

    node_map = {node.id: node for node in get_experiment_nodes(payload.graph)}
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
    node_ids = {node.id for node in get_experiment_nodes(payload.graph)}

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
    node_ids = {node.id for node in get_experiment_nodes(payload.graph)}

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
    node_ids = {node.id for node in get_experiment_nodes(payload.graph)}

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


RESULTS_SECTION_TOKENS = ("results", "figure", "table")
VAGUE_LANGUAGE_PATTERNS = [
    "has been shown to",
    "is known to",
    "has been implicated in",
    "may regulate",
    "suggests that",
    "previous studies reported",
    "associated with",
]
GREEK_REPLACEMENTS = {
    "α": "alpha",
    "β": "beta",
    "γ": "gamma",
    "δ": "delta",
    "κ": "kappa",
    "λ": "lambda",
}


def normalize_surface_form(value: str) -> str:
    normalized = value.strip().lower()
    for greek, replacement in GREEK_REPLACEMENTS.items():
        normalized = normalized.replace(greek, replacement)
    normalized = normalized.replace("/", " ").replace("-", " ").replace(":", " ")
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = normalized.strip(" .,;()[]{}")
    return normalized


def is_results_bearing_section(section: str) -> bool:
    lowered = section.strip().lower()
    return any(token in lowered for token in RESULTS_SECTION_TOKENS)


def contains_vague_language(text: str) -> bool:
    lowered = text.lower()
    return any(pattern in lowered for pattern in VAGUE_LANGUAGE_PATTERNS)


def strip_html_to_text(value: str) -> str:
    without_scripts = re.sub(r"<script.*?</script>", " ", value, flags=re.IGNORECASE | re.DOTALL)
    without_styles = re.sub(r"<style.*?</style>", " ", without_scripts, flags=re.IGNORECASE | re.DOTALL)
    stripped = re.sub(r"<[^>]+>", " ", without_styles)
    return re.sub(r"\s+", " ", unescape(stripped)).strip()


def extract_pmcid_from_value(value: str) -> str | None:
    match = re.search(r"(PMC\d+)", value, flags=re.IGNORECASE)
    return match.group(1).upper() if match else None


def extract_pubmed_id_from_value(value: str) -> str | None:
    parsed = urlparse(value)
    if "pubmed.ncbi.nlm.nih.gov" in parsed.netloc.lower():
        match = re.search(r"/(\d+)/?", parsed.path)
        if match:
            return match.group(1)
    match = re.search(r"\bPMID[:\s]*(\d+)\b", value, flags=re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def build_ncbi_request_headers(extra_headers: dict[str, str] | None = None) -> dict[str, str]:
    headers = {
        "User-Agent": "pathway-demo/1.0 (+https://openai.com; contact via app operator)",
        "Accept-Language": "en-US,en;q=0.9",
    }
    if extra_headers:
        headers.update(extra_headers)
    return headers


def build_ncbi_url(base_url: str, params: dict[str, str]) -> str:
    request_params = dict(params)
    tool_name = os.getenv("NCBI_TOOL_NAME", "pathway_demo")
    request_params.setdefault("tool", tool_name)

    contact_email = os.getenv("NCBI_CONTACT_EMAIL", "").strip()
    if contact_email:
        request_params.setdefault("email", contact_email)

    return f"{base_url}?{urlencode(request_params)}"


def fetch_url_bytes(url: str, *, headers: dict[str, str] | None = None) -> bytes:
    request = Request(url, headers=build_ncbi_request_headers(headers))

    ssl_context = None
    if certifi is not None:
        ssl_context = ssl.create_default_context(cafile=certifi.where())
    else:
        ssl_context = ssl.create_default_context()

    if os.getenv("PATHWAY_FETCH_ALLOW_INSECURE_SSL", "").lower() in {"1", "true", "yes"}:
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

    with urlopen(request, timeout=20, context=ssl_context) as response:
        return response.read()


def fetch_url_text(url: str, *, headers: dict[str, str] | None = None) -> str:
    return fetch_url_bytes(url, headers=headers).decode("utf-8", errors="ignore")


def fetch_url_json(url: str, *, headers: dict[str, str] | None = None) -> Any:
    return json.loads(fetch_url_text(url, headers=headers))


def extract_pmcid_from_pubmed_html(html: str) -> str | None:
    patterns = [
        r'citation_pmcid"\s+content="(PMC\d+)"',
        r"/articles/(PMC\d+)/",
        r"\b(PMC\d+)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, html, flags=re.IGNORECASE)
        if match:
            return match.group(1).upper()
    return None


def extract_text_from_pmc_xml(xml_text: str) -> str:
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError:
        return ""

    text_parts: list[str] = []
    for tag_name in ("article-title", "abstract", "body"):
        for node in root.findall(f".//{tag_name}"):
            content = " ".join(segment.strip() for segment in node.itertext() if segment.strip())
            if content:
                text_parts.append(content)
    return re.sub(r"\s+", " ", " ".join(text_parts)).strip()


def extract_text_from_bioc_payload(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""

    documents = payload.get("documents")
    if not isinstance(documents, list):
        return ""

    text_parts: list[str] = []
    for document in documents:
        if not isinstance(document, dict):
            continue
        passages = document.get("passages")
        if not isinstance(passages, list):
            continue
        for passage in passages:
            if not isinstance(passage, dict):
                continue
            text = passage.get("text")
            if isinstance(text, str) and text.strip():
                text_parts.append(text.strip())

    return re.sub(r"\s+", " ", " ".join(text_parts)).strip()


def resolve_pubmed_id_to_pmcid(pubmed_id: str) -> str | None:
    idconv_url = build_ncbi_url(
        "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/",
        {"ids": pubmed_id, "format": "json"},
    )
    payload = fetch_url_json(idconv_url, headers={"Accept": "application/json"})
    if not isinstance(payload, dict):
        return None

    records = payload.get("records")
    if not isinstance(records, list):
        return None

    for record in records:
        if not isinstance(record, dict):
            continue
        pmcid = record.get("pmcid")
        if isinstance(pmcid, str) and pmcid.strip():
            return pmcid.strip().upper()
    return None


def fetch_pmc_full_text_via_efetch(pmcid: str) -> str:
    numeric_id = pmcid.upper().removeprefix("PMC")
    efetch_url = build_ncbi_url(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
        {"db": "pmc", "id": numeric_id, "retmode": "xml"},
    )
    xml_text = fetch_url_text(efetch_url, headers={"Accept": "application/xml,text/xml;q=0.9,*/*;q=0.1"})
    return extract_text_from_pmc_xml(xml_text)


def fetch_pmc_full_text_via_bioc(pmcid: str) -> str:
    bioc_url = (
        "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/"
        f"BioC_json/{pmcid.upper()}/unicode"
    )
    payload = fetch_url_json(bioc_url, headers={"Accept": "application/json"})
    return extract_text_from_bioc_payload(payload)


def fetch_pmc_full_text(pmcid: str) -> tuple[str | None, str | None]:
    fetch_attempts = (
        ("NCBI E-utilities efetch XML", fetch_pmc_full_text_via_efetch),
        ("PMC BioC API", fetch_pmc_full_text_via_bioc),
        ("PMC article HTML", lambda value: strip_html_to_text(fetch_url_text(f"https://pmc.ncbi.nlm.nih.gov/articles/{value}/"))),
    )

    failure_messages: list[str] = []
    for label, fetcher in fetch_attempts:
        try:
            text = fetcher(pmcid)
        except ssl.SSLError as error:
            return (
                None,
                (
                    f"Failed to fetch PMC full text for {pmcid} because TLS certificate verification failed "
                    f"while using {label}: {error}"
                ),
            )
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ElementTree.ParseError) as error:
            failure_messages.append(f"{label}: {error}")
            continue

        if len(text) >= 1200:
            return text, None
        if text:
            failure_messages.append(f"{label}: content too short")

    return None, f"Failed to fetch PMC full text for {pmcid}: {'; '.join(failure_messages)}"


def resolve_pubmed_url_to_pmcid(source: PathwayPaperSource) -> tuple[str | None, list[str]]:
    warnings: list[str] = []
    pubmed_id = source.pubmedId or extract_pubmed_id_from_value(source.sourceValue)
    if pubmed_id:
        try:
            pmcid = resolve_pubmed_id_to_pmcid(pubmed_id)
        except ssl.SSLError as error:
            warnings.append(
                f"Failed to resolve PMCID from PubMed ID {pubmed_id} because TLS verification failed: {error}"
            )
            return None, warnings
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            warnings.append(f"Failed to resolve PMCID from PubMed ID {pubmed_id}: {error}")
        else:
            if pmcid:
                return pmcid, warnings

    try:
        html = fetch_url_text(source.sourceValue)
    except ssl.SSLError as error:
        warnings.append(
            f"Failed to fetch PubMed page for PMC resolution because TLS verification failed: {error}"
        )
        return None, warnings
    except (HTTPError, URLError, TimeoutError) as error:
        warnings.append(f"Failed to fetch PubMed page for PMC resolution: {error}")
        return None, warnings

    pmcid = extract_pmcid_from_pubmed_html(html)
    if not pmcid:
        warnings.append(
            "PubMed page did not expose a usable PMC full-text link, so the source remains abstract-only."
        )
    return pmcid, warnings


def resolve_source_text(
    source: PathwayPaperSource,
) -> tuple[str | None, ParsedSourceSummary, list[str], bool]:
    warnings: list[str] = []
    label = source.label or source.title or source.sourceId
    summary = ParsedSourceSummary(
        sourceId=source.sourceId,
        label=label,
        fetchStatus="failed",
        sectionCount=0,
        chunkCount=0,
        title=source.title,
        pubmedId=source.pubmedId,
        pmcid=source.pmcid,
        warnings=[],
    )

    if source.sourceType == "raw_text":
        text = source.sourceValue.strip()
        if not text:
            summary.warnings.append("Raw text source was empty.")
            return None, summary, ["Raw text source was empty."], False
        summary.fetchStatus = "fetched"
        return text, summary, warnings, True

    if source.sourceType == "pubmed_url":
        pmcid, pubmed_warnings = resolve_pubmed_url_to_pmcid(source)
        summary.warnings.extend(pubmed_warnings)
        warnings.extend(pubmed_warnings)
        if not pmcid:
            warning = (
                "PubMed URL source did not resolve to a usable PMC full-text article. "
                "If only the abstract is available, provide raw full text instead."
            )
            summary.warnings.append(warning)
            return None, summary, [*warnings, warning], False
        summary.pmcid = pmcid
        source = PathwayPaperSource(**{**source.model_dump(), "pmcid": pmcid, "sourceType": "pmcid"})

    pmcid = source.pmcid or extract_pmcid_from_value(source.sourceValue)
    if not pmcid:
        warning = "PMC source could not be resolved to a PMCID."
        summary.warnings.append(warning)
        return None, summary, [warning], False

    summary.pmcid = pmcid
    text, warning = fetch_pmc_full_text(pmcid)
    if warning:
        if "TLS certificate verification failed" in warning:
            warning = (
                f"{warning}. This usually means the local Python trust store does not trust "
                "the certificate chain presented for the site."
            )
        summary.warnings.append(warning)
        return None, summary, [warning], False

    assert text is not None
    if len(text) < 1200:
        warning = f"PMC full text for {pmcid} was too short to support pathway extraction."
        summary.warnings.append(warning)
        return None, summary, [warning], False

    summary.fetchStatus = "fetched"
    if not summary.title:
        summary.title = label
    return text, summary, warnings, True


def classify_heading(value: str) -> str | None:
    compact = normalize_surface_form(value)
    if compact in {"abstract"}:
        return "Abstract"
    if compact in {"introduction", "background"}:
        return "Introduction"
    if compact in {"methods", "materials and methods", "patients and methods"}:
        return "Methods"
    if compact in {"results"}:
        return "Results"
    if compact in {"discussion"}:
        return "Discussion"
    if compact in {"conclusion", "conclusions"}:
        return "Conclusion"
    if compact.startswith("figure ") or compact.startswith("fig "):
        return "Figure captions"
    if compact.startswith("table "):
        return "Tables"
    return None


def parse_section_chunks(
    text: str,
    source_id: str,
    paper_title: str | None,
) -> tuple[list[PaperChunk], set[str]]:
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", cleaned) if part.strip()]
    current_section = "Unknown"
    current_subsection: str | None = None
    chunks: list[PaperChunk] = []
    seen_sections: set[str] = set()
    chunk_index = 1

    for paragraph in paragraphs:
        first_line = paragraph.splitlines()[0].strip()
        heading = classify_heading(first_line)
        if heading and len(paragraph) <= 160:
            current_section = heading
            current_subsection = first_line if heading == "Unknown" else None
            seen_sections.add(current_section)
            continue

        section = current_section
        if not seen_sections:
            seen_sections.add(section)

        text_blocks = re.split(r"(?<=[.!?])\s+", paragraph)
        buffer = ""
        for block in text_blocks:
            candidate = f"{buffer} {block}".strip() if buffer else block
            if len(candidate) <= 1000:
                buffer = candidate
                continue
            if buffer:
                chunks.append(
                    PaperChunk(
                        chunk_id=f"{source_id}_chunk_{chunk_index}",
                        section=section,
                        subsection=current_subsection,
                        text=buffer,
                        paper_source_id=source_id,
                        paper_title=paper_title,
                    )
                )
                chunk_index += 1
            buffer = block
        if buffer:
            chunks.append(
                PaperChunk(
                    chunk_id=f"{source_id}_chunk_{chunk_index}",
                    section=section,
                    subsection=current_subsection,
                    text=buffer,
                    paper_source_id=source_id,
                    paper_title=paper_title,
                )
            )
            chunk_index += 1

    return chunks, seen_sections


def require_openai_client(feature_name: str) -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"{feature_name} requires OPENAI_API_KEY to be set on the backend.",
        )
    return OpenAI(api_key=api_key)


def call_pathway_model(
    *,
    feature_name: str,
    model_env: str,
    default_model: str,
    schema_name: str,
    instructions: str,
    input_payload: dict[str, object],
    response_model: type[BaseModel],
) -> BaseModel:
    client = require_openai_client(feature_name)
    try:
        response = client.responses.create(
            model=os.getenv(model_env, default_model),
            instructions=instructions,
            input=json.dumps(input_payload),
            max_output_tokens=7000,
            temperature=0.1,
            store=False,
            text={
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "strict": True,
                    "schema": response_model.model_json_schema(),
                },
                "verbosity": "low",
            },
        )
    except AuthenticationError as error:
        raise HTTPException(
            status_code=400,
            detail=f"{feature_name} could not authenticate with OpenAI: {error}",
        ) from error
    except APIError as error:
        raise HTTPException(
            status_code=502,
            detail=f"{feature_name} failed while calling OpenAI: {error}",
        ) from error

    try:
        return response_model.model_validate_json(response.output_text)
    except PydanticValidationError as error:
        raise HTTPException(
            status_code=502,
            detail=f"{feature_name} returned an invalid structured response.",
        ) from error


def attach_source_metadata_to_extraction(
    extraction: ExtractionPassResult,
    source_id: str,
    paper_title: str | None,
) -> ExtractionPassResult:
    for mention in extraction.entity_mentions:
        if not mention.paper_source_id:
            mention.paper_source_id = source_id
        if not mention.paper_title:
            mention.paper_title = paper_title
    for evidence in extraction.evidence_items:
        if not evidence.paper_source_id:
            evidence.paper_source_id = source_id
        if not evidence.paper_title:
            evidence.paper_title = paper_title
    return extraction


def build_pathway_graph(
    paper_title: str,
    extraction_results: list[ExtractionPassResult],
    aggregation_result: AggregationPassResult,
) -> PathwayGraph:
    entity_mentions = [
        mention
        for result in extraction_results
        for mention in result.entity_mentions
    ]
    evidence_items = [
        item
        for result in extraction_results
        for item in result.evidence_items
    ]

    return PathwayGraph(
        paper_metadata={
            "title": paper_title,
            "pubmed_id": None,
            "pmcid": None,
            "doi": None,
        },
        entity_mentions=entity_mentions,
        evidence_items=evidence_items,
        normalized_entities=aggregation_result.normalized_entities,
        default_relations=aggregation_result.default_relations,
        structural_relations=aggregation_result.structural_relations,
        nondefault_relations=aggregation_result.nondefault_relations,
        normalization_decisions=aggregation_result.normalization_decisions,
        unresolved_issues=aggregation_result.unresolved_issues,
    )


def evidence_supports_default_admission(evidence: EvidenceItem) -> bool:
    if evidence.support_class not in {"current_paper_direct", "current_paper_indirect"}:
        return False
    if not is_results_bearing_section(evidence.section):
        return False
    if not evidence.supporting_snippet.strip():
        return False
    if not (evidence.experiment_context or "").strip():
        return False
    if evidence.confidence < 0.65:
        return False
    if contains_vague_language(evidence.supporting_snippet):
        return False
    return True


def is_structural_relation(relation: AggregatedRelation) -> bool:
    return relation.relation_category in {
        "membership",
        "modification",
        "state_relation",
        "equivalence_candidate",
    }


def apply_pathway_admission_policy(graph: PathwayGraph) -> PathwayGraph:
    evidence_by_id = {item.evidence_id: item for item in graph.evidence_items}
    admitted: list[AggregatedRelation] = []
    downgraded: list[AggregatedRelation] = list(graph.nondefault_relations)

    for relation in graph.default_relations:
        if is_structural_relation(relation):
            admitted.append(relation)
            continue

        supporting_evidence = [
            evidence_by_id[evidence_id]
            for evidence_id in relation.evidence_ids
            if evidence_id in evidence_by_id
        ]
        if any(evidence_supports_default_admission(item) for item in supporting_evidence):
            admitted.append(relation)
            continue

        relation_payload = relation.model_dump()
        relation_payload.update(
            {
                "support_class": relation.support_class or "background_claim",
                "mechanistic_status": relation.mechanistic_status or "interpretive",
                "notes": (relation.notes + " Downgraded by deterministic admission policy.").strip(),
            }
        )
        downgraded.append(
            AggregatedRelation(**relation_payload)
        )

    graph_payload = graph.model_dump()
    graph_payload["default_relations"] = admitted
    graph_payload["nondefault_relations"] = downgraded
    return PathwayGraph(**graph_payload)


def build_deterministic_sanity_report(graph: PathwayGraph) -> PathwaySanityReport:
    findings: list[PathwaySanityFinding] = []
    relation_ids = {relation.relation_id for relation in graph.structural_relations}
    entity_by_id = {entity.entity_id: entity for entity in graph.normalized_entities}
    membership_targets = {
        relation.target_entity_id
        for relation in graph.structural_relations
        if relation.relation_type == "component_of"
    }
    modified_targets = {
        relation.source_entity_id
        for relation in graph.structural_relations
        if relation.relation_type in {"modified_form_of", "active_state_of", "inactive_state_of"}
    }

    seen_surface_keys: dict[str, str] = {}
    for entity in graph.normalized_entities:
        surface_key = normalize_surface_form(entity.canonical_name)
        if surface_key in seen_surface_keys and seen_surface_keys[surface_key] != entity.entity_id:
            findings.append(
                PathwaySanityFinding(
                    finding_id=f"dup_{entity.entity_id}",
                    severity="medium",
                    finding_type="near_duplicate_entities",
                    description=f"{entity.canonical_name} may duplicate another entity by surface form.",
                    related_entity_ids=[seen_surface_keys[surface_key], entity.entity_id],
                    related_relation_ids=[],
                    recommended_action="mark ambiguous",
                    confidence=0.7,
                )
            )
        else:
            seen_surface_keys[surface_key] = entity.entity_id

        if entity.entity_kind == "complex" and entity.entity_id not in membership_targets:
            findings.append(
                PathwaySanityFinding(
                    finding_id=f"complex_{entity.entity_id}",
                    severity="high",
                    finding_type="complex_missing_membership",
                    description=f"{entity.canonical_name} is a complex without explicit component membership.",
                    related_entity_ids=[entity.entity_id],
                    related_relation_ids=[],
                    recommended_action="add membership relation",
                    confidence=0.8,
                )
            )

        if entity.entity_kind == "modified_form" and entity.entity_id not in modified_targets:
            findings.append(
                PathwaySanityFinding(
                    finding_id=f"modified_{entity.entity_id}",
                    severity="high",
                    finding_type="modified_form_disconnected",
                    description=f"{entity.canonical_name} is a modified form without a structural base link.",
                    related_entity_ids=[entity.entity_id],
                    related_relation_ids=[],
                    recommended_action="add modified-form relation",
                    confidence=0.8,
                )
            )

        if entity.entity_kind == "family_or_class":
            for other in graph.normalized_entities:
                if other.entity_id == entity.entity_id:
                    continue
                if normalize_surface_form(other.canonical_name) == normalize_surface_form(entity.canonical_name):
                    findings.append(
                        PathwaySanityFinding(
                            finding_id=f"family_{entity.entity_id}_{other.entity_id}",
                            severity="medium",
                            finding_type="family_member_confusion",
                            description=f"{entity.canonical_name} may be conflated with a more specific member.",
                            related_entity_ids=[entity.entity_id, other.entity_id],
                            related_relation_ids=[],
                            recommended_action="keep separate",
                            confidence=0.7,
                        )
                    )

    evidence_by_id = {item.evidence_id: item for item in graph.evidence_items}
    for relation in graph.default_relations:
        if all(
            not evidence_supports_default_admission(evidence_by_id[evidence_id])
            for evidence_id in relation.evidence_ids
            if evidence_id in evidence_by_id
        ):
            findings.append(
                PathwaySanityFinding(
                    finding_id=f"weak_{relation.relation_id}",
                    severity="medium",
                    finding_type="weak_default_edge",
                    description=f"{relation.summary} lacks strong deterministic support for the default graph.",
                    related_entity_ids=[relation.source_entity_id, relation.target_entity_id],
                    related_relation_ids=[relation.relation_id],
                    recommended_action="downgrade to nondefault",
                    confidence=0.75,
                )
            )

    high_priority_issue_count = len([finding for finding in findings if finding.severity == "high"])
    if high_priority_issue_count > 0:
        quality = "needs_review"
    elif findings:
        quality = "acceptable_with_warnings"
    else:
        quality = "good"

    return PathwaySanityReport(
        sanity_findings=findings,
        summary=PathwaySanitySummary(
            overall_graph_quality=quality,
            high_priority_issue_count=high_priority_issue_count,
            notes="Deterministic sanity audit supplements the model-generated review.",
        ),
    )


def merge_sanity_reports(
    model_report: PathwaySanityReport,
    deterministic_report: PathwaySanityReport,
) -> PathwaySanityReport:
    combined_findings = model_report.sanity_findings + [
        finding
        for finding in deterministic_report.sanity_findings
        if finding.finding_id not in {existing.finding_id for existing in model_report.sanity_findings}
    ]
    high_priority_issue_count = len([finding for finding in combined_findings if finding.severity == "high"])
    if high_priority_issue_count > 0:
        quality = "needs_review"
    elif combined_findings:
        quality = "acceptable_with_warnings"
    else:
        quality = "good"

    return PathwaySanityReport(
        sanity_findings=combined_findings,
        summary=PathwaySanitySummary(
            overall_graph_quality=quality,
            high_priority_issue_count=high_priority_issue_count,
            notes=model_report.summary.notes or deterministic_report.summary.notes,
        ),
    )


def build_pathway_graph_with_llm(payload: PathwayBuildRequest) -> PathwayBuildResponse:
    if not payload.paperSources:
        raise HTTPException(
            status_code=400,
            detail="Pathway build requires at least one paper source or raw text source.",
        )

    parsed_sources: list[ParsedSourceSummary] = []
    all_chunks: list[PaperChunk] = []
    warnings: list[str] = []
    extraction_results: list[ExtractionPassResult] = []

    for source in payload.paperSources:
        source_text, summary, source_warnings, has_full_text = resolve_source_text(source)
        warnings.extend(source_warnings)

        if not source_text or not has_full_text:
            parsed_sources.append(summary)
            continue

        chunks, seen_sections = parse_section_chunks(source_text, source.sourceId, summary.title)
        summary.sectionCount = len(seen_sections)
        summary.chunkCount = len(chunks)
        parsed_sources.append(summary)
        all_chunks.extend(chunks)

        extraction = call_pathway_model(
            feature_name="Pathway build",
            model_env="OPENAI_PATHWAY_EXTRACTION_MODEL",
            default_model="gpt-5.4-2026-03-05",
            schema_name="pathway_extraction",
            instructions=EXTRACTION_SYSTEM_PROMPT,
            input_payload={
                "paper_title": summary.title or payload.title or summary.label,
                "pubmed_id": summary.pubmedId,
                "pmcid": summary.pmcid,
                "doi": None,
                "json_chunks": [chunk.model_dump() for chunk in chunks],
            },
            response_model=ExtractionPassResult,
        )
        extraction_results.append(
            attach_source_metadata_to_extraction(
                extraction,
                source.sourceId,
                summary.title or payload.title or summary.label,
            )
        )

    if not extraction_results or not all_chunks:
        return PathwayBuildResponse(
            status="error",
            parsedSources=parsed_sources,
            pathwayGraph=None,
            sanityReport=None,
            buildSummary="No reliable full text was available for conservative pathway extraction.",
            warnings=warnings,
            errors=["Provide raw full text or a fetchable PMC source."],
        )

    combined_mentions = [
        mention.model_dump()
        for result in extraction_results
        for mention in result.entity_mentions
    ]
    combined_evidence = [
        evidence.model_dump()
        for result in extraction_results
        for evidence in result.evidence_items
    ]
    combined_issues = [
        issue.model_dump()
        for result in extraction_results
        for issue in result.unresolved_structural_issues
    ]

    aggregation = call_pathway_model(
        feature_name="Pathway aggregation",
        model_env="OPENAI_PATHWAY_AGGREGATION_MODEL",
        default_model="gpt-5.4-2026-03-05",
        schema_name="pathway_aggregation",
        instructions=AGGREGATION_SYSTEM_PROMPT,
        input_payload={
            "paper_metadata_json": {
                "title": payload.title or parsed_sources[0].title or parsed_sources[0].label,
            },
            "entity_mentions_json": combined_mentions,
            "evidence_items_json": combined_evidence,
            "unresolved_structural_issues_json": combined_issues,
        },
        response_model=AggregationPassResult,
    )
    graph = apply_pathway_admission_policy(
        build_pathway_graph(
            payload.title or parsed_sources[0].title or parsed_sources[0].label,
            extraction_results,
            aggregation,
        )
    )

    if not graph.default_relations and not graph.structural_relations and not graph.nondefault_relations:
        return PathwayBuildResponse(
            status="error",
            parsedSources=parsed_sources,
            pathwayGraph=None,
            sanityReport=None,
            buildSummary="Extraction completed but produced no admissible pathway relations.",
            warnings=warnings,
            errors=["No conservative evidence items were retained."],
        )

    sanity = call_pathway_model(
        feature_name="Pathway sanity check",
        model_env="OPENAI_PATHWAY_SANITY_MODEL",
        default_model="gpt-5.4-2026-03-05",
        schema_name="pathway_sanity",
        instructions=SANITY_SYSTEM_PROMPT,
        input_payload={
            "normalized_entities_json": [entity.model_dump() for entity in graph.normalized_entities],
            "default_relations_json": [relation.model_dump() for relation in graph.default_relations],
            "structural_relations_json": [relation.model_dump() for relation in graph.structural_relations],
            "nondefault_relations_json": [relation.model_dump() for relation in graph.nondefault_relations],
            "normalization_decisions_json": [
                decision.model_dump() for decision in graph.normalization_decisions
            ],
        },
        response_model=PathwaySanityReport,
    )

    final_sanity = merge_sanity_reports(sanity, build_deterministic_sanity_report(graph))
    return PathwayBuildResponse(
        status="ready",
        parsedSources=parsed_sources,
        pathwayGraph=graph,
        sanityReport=final_sanity,
        buildSummary=(
            f"Built a conservative pathway graph with {len(graph.normalized_entities)} entities, "
            f"{len(graph.default_relations)} default relations, and "
            f"{final_sanity.summary.high_priority_issue_count} high-priority sanity findings."
        ),
        warnings=warnings,
        errors=[],
    )


def build_entity_catalog(graph: PathwayGraph) -> list[dict[str, object]]:
    return [
        {
            "entity_id": entity.entity_id,
            "canonical_name": entity.canonical_name,
            "entity_type": entity.entity_type,
            "aliases": entity.aliases,
        }
        for entity in graph.normalized_entities
    ]


def resolve_entity_match(
    graph: PathwayGraph,
    text: str,
) -> ResolvedEntityMatch:
    normalized_text = normalize_surface_form(text)
    exact_matches = [
        entity
        for entity in graph.normalized_entities
        if normalize_surface_form(entity.canonical_name) == normalized_text
    ]
    if len(exact_matches) == 1:
        entity = exact_matches[0]
        return ResolvedEntityMatch(
            input_text=text,
            matched_entity_id=entity.entity_id,
            matched_entity_name=entity.canonical_name,
            match_confidence=0.99,
            match_status="exact",
        )
    if len(exact_matches) > 1:
        return ResolvedEntityMatch(
            input_text=text,
            match_confidence=0.5,
            match_status="ambiguous",
        )

    alias_matches = [
        entity
        for entity in graph.normalized_entities
        if normalized_text in {normalize_surface_form(alias) for alias in entity.aliases}
    ]
    if len(alias_matches) == 1:
        entity = alias_matches[0]
        return ResolvedEntityMatch(
            input_text=text,
            matched_entity_id=entity.entity_id,
            matched_entity_name=entity.canonical_name,
            match_confidence=0.85,
            match_status="alias",
        )
    if len(alias_matches) > 1:
        return ResolvedEntityMatch(
            input_text=text,
            match_confidence=0.45,
            match_status="ambiguous",
        )

    fuzzy_matches = [
        entity
        for entity in graph.normalized_entities
        if normalized_text and normalized_text in normalize_surface_form(entity.canonical_name)
    ]
    if len(fuzzy_matches) == 1:
        entity = fuzzy_matches[0]
        return ResolvedEntityMatch(
            input_text=text,
            matched_entity_id=entity.entity_id,
            matched_entity_name=entity.canonical_name,
            match_confidence=0.68,
            match_status="fuzzy",
        )

    return ResolvedEntityMatch(
        input_text=text,
        match_confidence=0,
        match_status="unresolved",
    )


def relation_matches_query_plan(
    relation: AggregatedRelation,
    graph: PathwayGraph,
    plan: PathwayQueryPlan,
) -> bool:
    if plan.allowed_relation_types and relation.relation_type not in plan.allowed_relation_types:
        return False

    if relation.confidence < float(plan.evidence_filter.min_confidence):
        return False

    evidence_by_id = {item.evidence_id: item for item in graph.evidence_items}
    evidence = [
        evidence_by_id[evidence_id]
        for evidence_id in relation.evidence_ids
        if evidence_id in evidence_by_id
    ]

    modalities = set(plan.evidence_filter.modalities)
    if modalities and not any(item.evidence_modality in modalities for item in evidence):
        return False

    support_classes = set(plan.evidence_filter.support_classes)
    if support_classes and not any(item.support_class in support_classes for item in evidence):
        return False

    if not plan.evidence_filter.include_background:
        if relation.support_class == "background_claim":
            return False

    return True


def get_query_relations(graph: PathwayGraph, plan: PathwayQueryPlan) -> list[AggregatedRelation]:
    relations = list(graph.default_relations)
    if plan.include_structural_relations:
        relations.extend(graph.structural_relations)
    if plan.include_nondefault_relations:
        relations.extend(graph.nondefault_relations)
    return [relation for relation in relations if relation_matches_query_plan(relation, graph, plan)]


def build_evidence_cards(
    graph: PathwayGraph,
    relation_ids: list[str],
) -> list[EvidenceCard]:
    relation_by_id = {
        relation.relation_id: relation
        for relation in (
            graph.default_relations + graph.structural_relations + graph.nondefault_relations
        )
    }
    evidence_by_id = {item.evidence_id: item for item in graph.evidence_items}
    cards: list[EvidenceCard] = []
    for relation_id in relation_ids:
        relation = relation_by_id.get(relation_id)
        if not relation:
            continue
        for evidence_id in relation.evidence_ids[:3]:
            evidence = evidence_by_id.get(evidence_id)
            if not evidence:
                continue
            cards.append(
                EvidenceCard(
                    relation_id=relation_id,
                    evidence_id=evidence.evidence_id,
                    paper_title=evidence.paper_title or graph.paper_metadata.title or "Unknown paper",
                    section=evidence.section,
                    support_class=evidence.support_class,
                    evidence_modality=evidence.evidence_modality,
                    experiment_context=evidence.experiment_context,
                    supporting_snippet=evidence.supporting_snippet,
                )
            )
    return cards


def execute_path_search(
    graph: PathwayGraph,
    relations: list[AggregatedRelation],
    source_entity_id: str,
    target_entity_id: str,
    max_hops: int,
) -> tuple[list[str], list[str]]:
    adjacency: dict[str, list[tuple[str, str]]] = {}
    for relation in relations:
        adjacency.setdefault(relation.source_entity_id, []).append(
            (relation.target_entity_id, relation.relation_id)
        )
        if relation.direction == "undirected":
            adjacency.setdefault(relation.target_entity_id, []).append(
                (relation.source_entity_id, relation.relation_id)
            )

    queue = deque([(source_entity_id, [source_entity_id], [])])
    visited = {(source_entity_id, 0)}
    while queue:
        current, entity_path, relation_path = queue.popleft()
        if current == target_entity_id:
            return entity_path, relation_path
        if len(relation_path) >= max_hops:
            continue
        for next_entity, relation_id in adjacency.get(current, []):
            state = (next_entity, len(relation_path) + 1)
            if state in visited:
                continue
            visited.add(state)
            queue.append(
                (
                    next_entity,
                    entity_path + [next_entity],
                    relation_path + [relation_id],
                )
            )

    return [], []


def execute_pathway_query_plan(
    graph: PathwayGraph,
    plan: PathwayQueryPlan,
) -> PathwayQueryResponse:
    entity_texts = list(plan.entity_texts)
    if plan.source_entity_text:
        entity_texts.append(plan.source_entity_text)
    if plan.target_entity_text:
        entity_texts.append(plan.target_entity_text)
    resolved_entities = [resolve_entity_match(graph, text) for text in entity_texts]

    if any(match.match_status == "ambiguous" for match in resolved_entities):
        return PathwayQueryResponse(
            query_status="ambiguous_entity",
            query_plan={
                "query_intent": plan.query_intent,
                "search_mode": plan.search_mode,
                "max_hops": plan.max_hops,
            },
            resolved_entities=resolved_entities,
            subgraph_entity_ids=[],
            subgraph_relation_ids=[],
            evidence_cards=[],
            answer_summary="Multiple entities matched the query text. Keep entities separate and refine the request.",
            notes=["Try a more specific entity name or alias."],
        )

    if entity_texts and any(match.match_status == "unresolved" for match in resolved_entities):
        return PathwayQueryResponse(
            query_status="no_match",
            query_plan={
                "query_intent": plan.query_intent,
                "search_mode": plan.search_mode,
                "max_hops": plan.max_hops,
            },
            resolved_entities=resolved_entities,
            subgraph_entity_ids=[],
            subgraph_relation_ids=[],
            evidence_cards=[],
            answer_summary="No graph entities matched the requested text conservatively.",
            notes=["Query execution only uses stored normalized entities and aliases."],
        )

    relations = get_query_relations(graph, plan)
    relation_ids: list[str] = []
    entity_ids: list[str] = []
    notes: list[str] = []

    if plan.query_intent in {"path_between", "direct_relation", "evidence_for_relation"}:
        if not plan.source_entity_text or not plan.target_entity_text:
            return PathwayQueryResponse(
                query_status="unsupported_query",
                query_plan={
                    "query_intent": plan.query_intent,
                    "search_mode": plan.search_mode,
                    "max_hops": plan.max_hops,
                },
                resolved_entities=resolved_entities,
                subgraph_entity_ids=[],
                subgraph_relation_ids=[],
                evidence_cards=[],
                answer_summary="This query requires both a source and target entity.",
                notes=[],
            )

        source_match = resolve_entity_match(graph, plan.source_entity_text)
        target_match = resolve_entity_match(graph, plan.target_entity_text)
        resolved_entities = [source_match, target_match]
        if not source_match.matched_entity_id or not target_match.matched_entity_id:
            return PathwayQueryResponse(
                query_status="no_match",
                query_plan={
                    "query_intent": plan.query_intent,
                    "search_mode": plan.search_mode,
                    "max_hops": plan.max_hops,
                },
                resolved_entities=resolved_entities,
                subgraph_entity_ids=[],
                subgraph_relation_ids=[],
                evidence_cards=[],
                answer_summary="One or both entities could not be resolved conservatively.",
                notes=[],
            )

        if plan.query_intent in {"direct_relation", "evidence_for_relation"} or plan.search_mode == "direct_only":
            direct_relations = [
                relation
                for relation in relations
                if relation.source_entity_id == source_match.matched_entity_id
                and relation.target_entity_id == target_match.matched_entity_id
            ]
            if not direct_relations:
                return PathwayQueryResponse(
                    query_status="no_supported_path",
                    query_plan={
                        "query_intent": plan.query_intent,
                        "search_mode": plan.search_mode,
                        "max_hops": plan.max_hops,
                    },
                    resolved_entities=resolved_entities,
                    subgraph_entity_ids=[],
                    subgraph_relation_ids=[],
                    evidence_cards=[],
                    answer_summary="No direct supported relation matched the requested constraints.",
                    notes=[],
                )
            relation_ids = [relation.relation_id for relation in direct_relations]
            entity_ids = [source_match.matched_entity_id, target_match.matched_entity_id]
        else:
            entity_path, relation_path = execute_path_search(
                graph,
                relations,
                source_match.matched_entity_id,
                target_match.matched_entity_id,
                plan.max_hops,
            )
            if not relation_path:
                return PathwayQueryResponse(
                    query_status="no_supported_path",
                    query_plan={
                        "query_intent": plan.query_intent,
                        "search_mode": plan.search_mode,
                        "max_hops": plan.max_hops,
                    },
                    resolved_entities=resolved_entities,
                    subgraph_entity_ids=[],
                    subgraph_relation_ids=[],
                    evidence_cards=[],
                    answer_summary="No supported path matched the requested evidence constraints.",
                    notes=[],
                )
            entity_ids = entity_path
            relation_ids = relation_path
            if any(
                relation.support_class not in {"current_paper_direct", "current_paper_indirect"}
                for relation in relations
                if relation.relation_id in relation_ids
            ):
                notes.append("At least one retrieved edge is non-primary or interpretive.")

    elif plan.query_intent in {"neighbors", "summarize_subgraph", "highlight_entities", "highlight_relations"}:
        selected_ids = [match.matched_entity_id for match in resolved_entities if match.matched_entity_id]
        if not selected_ids:
            entity_ids = [entity.entity_id for entity in graph.normalized_entities[:12]]
            relation_ids = [relation.relation_id for relation in relations[:16]]
        else:
            relation_ids = [
                relation.relation_id
                for relation in relations
                if relation.source_entity_id in selected_ids or relation.target_entity_id in selected_ids
            ]
            entity_ids = list(
                {
                    entity_id
                    for relation in relations
                    if relation.relation_id in relation_ids
                    for entity_id in (relation.source_entity_id, relation.target_entity_id)
                }
            )
    elif plan.query_intent == "support_gap":
        selected_ids = {match.matched_entity_id for match in resolved_entities if match.matched_entity_id}
        gap_issues = [
            issue
            for issue in graph.unresolved_issues
            if not selected_ids or any(entity_id in selected_ids for entity_id in issue.related_entity_ids)
        ]
        notes = [issue.description for issue in gap_issues[:4]]
        relation_ids = [
            relation.relation_id
            for relation in graph.nondefault_relations
            if not selected_ids
            or relation.source_entity_id in selected_ids
            or relation.target_entity_id in selected_ids
        ][:10]
        entity_ids = list(selected_ids)
        if not relation_ids and not notes:
            notes = ["No explicit support-gap annotations were found for the selected entities."]
    else:
        return PathwayQueryResponse(
            query_status="unsupported_query",
            query_plan={
                "query_intent": plan.query_intent,
                "search_mode": plan.search_mode,
                "max_hops": plan.max_hops,
            },
            resolved_entities=resolved_entities,
            subgraph_entity_ids=[],
            subgraph_relation_ids=[],
            evidence_cards=[],
            answer_summary="This query intent is not supported by the current deterministic executor.",
            notes=[],
        )

    evidence_cards = build_evidence_cards(graph, relation_ids)
    if plan.query_intent == "support_gap":
        answer_summary = (
            "Support gaps are shown from unresolved issues and nondefault relations; "
            "the graph does not currently contain fully admitted evidence for all requested claims."
        )
    elif relation_ids:
        answer_summary = (
            f"Retrieved {len(relation_ids)} relation{'s' if len(relation_ids) != 1 else ''} "
            f"across {len(entity_ids)} entit{'ies' if len(entity_ids) != 1 else 'y'}."
        )
    else:
        answer_summary = "No supported subgraph matched the requested constraints."

    return PathwayQueryResponse(
        query_status="ok" if relation_ids or entity_ids or notes else "no_supported_path",
        query_plan={
            "query_intent": plan.query_intent,
            "search_mode": plan.search_mode,
            "max_hops": plan.max_hops,
        },
        resolved_entities=resolved_entities,
        subgraph_entity_ids=entity_ids,
        subgraph_relation_ids=relation_ids,
        evidence_cards=evidence_cards,
        answer_summary=answer_summary,
        notes=notes,
    )


def query_pathway_graph(payload: PathwayQueryRequest) -> PathwayQueryResponse:
    plan = call_pathway_model(
        feature_name="Pathway query",
        model_env="OPENAI_PATHWAY_QUERY_MODEL",
        default_model="gpt-5.4-2026-03-05",
        schema_name="pathway_query_plan",
        instructions=QUERY_SYSTEM_PROMPT,
        input_payload={
            "entity_catalog_json": build_entity_catalog(payload.pathwayGraph),
            "user_query": payload.query,
        },
        response_model=PathwayQueryPlan,
    )
    return execute_pathway_query_plan(payload.pathwayGraph, plan)


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/schedule", response_model=ScheduleResponse)
def schedule(payload: GraphPayload) -> ScheduleResponse:
    return solve_schedule_response(payload)


@app.post("/api/accelerate/propose", response_model=AccelerateResponse)
def accelerate_propose(payload: AccelerateRequest) -> AccelerateResponse:
    experiment_nodes = get_experiment_nodes(payload)
    experiment_edges = get_experiment_edges(experiment_nodes, payload.edges)
    baseline_graph = GraphPayload(
        program=payload.program,
        personnel=payload.personnel,
        nodes=payload.nodes,
        edges=payload.edges,
    )
    baseline_schedule = solve_schedule_response(baseline_graph)
    baseline_cost = get_planned_cost(experiment_nodes, experiment_edges)
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


@app.post("/api/pathway/build", response_model=PathwayBuildResponse)
def pathway_build(payload: PathwayBuildRequest) -> PathwayBuildResponse:
    return build_pathway_graph_with_llm(payload)


@app.post("/api/pathway/query", response_model=PathwayQueryResponse)
def pathway_query(payload: PathwayQueryRequest) -> PathwayQueryResponse:
    return query_pathway_graph(payload)
