from pydantic import ValidationError
import pytest

from backend.app import (
    ChatRequest,
    EvidenceChoice,
    GraphPayload,
    ReviewChoice,
    RiskScanResponse,
    build_chat_graph_context,
    solve_schedule_response,
)


def test_old_payload_normalizes_into_new_schema() -> None:
    payload = GraphPayload.model_validate(
        {
            "nodes": [
                {
                    "id": "legacy_pk",
                    "title": "Legacy PK",
                    "content": "Legacy procedure summary",
                    "results": "Legacy result",
                    "cost": 1000,
                    "duration": 2,
                    "workHoursPerWeek": 8,
                    "parallelizationMultiplier": 2,
                    "operators": ["Avery Chen"],
                    "completed": True,
                }
            ],
            "edges": [],
            "personnel": [{"name": "Avery Chen", "hoursPerWeek": 40}],
        }
    )

    node = payload.nodes[0]
    assert node.procedureSummary == "Legacy procedure summary"
    assert node.status == "completed"
    assert node.type == "other"
    assert node.blockerPriority == "supporting"
    assert node.evidenceRefs == []
    assert payload.program.targetPhase1Design == ""
    assert payload.program.targetIndStrategy == ""


def test_schedule_behavior_is_preserved_for_old_style_payloads() -> None:
    payload = GraphPayload.model_validate(
        {
            "nodes": [
                {
                    "id": "legacy_a",
                    "title": "Legacy A",
                    "content": "First task",
                    "duration": 3,
                    "workHoursPerWeek": 0,
                    "cost": 10,
                    "completed": False,
                },
                {
                    "id": "legacy_b",
                    "title": "Legacy B",
                    "content": "Second task",
                    "duration": 5,
                    "workHoursPerWeek": 0,
                    "cost": 10,
                    "completed": False,
                },
            ],
            "edges": [
                {
                    "id": "edge_ab",
                    "source": "legacy_a",
                    "target": "legacy_b",
                    "parallelized": False,
                }
            ],
            "personnel": [],
        }
    )

    schedule = solve_schedule_response(payload)
    schedule_by_node = {node.nodeId: node for node in schedule.nodes}

    assert schedule.makespan == 8
    assert schedule_by_node["legacy_a"].start == 0
    assert schedule_by_node["legacy_a"].finish == 3
    assert schedule_by_node["legacy_b"].start == 3
    assert schedule_by_node["legacy_b"].finish == 8


def test_chat_context_includes_program_context_and_relevance_fields() -> None:
    payload = GraphPayload.model_validate(
        {
            "program": {
                "programTitle": "Demo",
                "targetPhase1Design": "SAD/MAD with PK and biomarker readouts.",
                "targetIndStrategy": "Exposure-led IND story with CNS penetration support.",
            },
            "nodes": [
                {
                    "id": "pk_node",
                    "title": "PK node",
                    "type": "pk",
                    "objective": "Check exposure",
                    "procedureSummary": "Mouse PK",
                    "successCriteria": "Exposure works",
                    "decisionSupported": "Supports brain penetration claim",
                    "phase1Relevance": "Feeds Phase 1 design",
                    "indRelevance": "Feeds IND story",
                    "duration": 4,
                    "workHoursPerWeek": 10,
                }
            ],
            "edges": [],
            "personnel": [],
        }
    )

    context = build_chat_graph_context(
        ChatRequest(messages=[], graph=payload, schedule=None)
    )

    assert context["program"]["target_phase1_design"] == "SAD/MAD with PK and biomarker readouts."
    assert context["program"]["target_ind_strategy"] == "Exposure-led IND story with CNS penetration support."
    assert context["nodes"][0]["phase1_relevance"] == "Feeds Phase 1 design"
    assert context["nodes"][0]["ind_relevance"] == "Feeds IND story"


def test_risk_scan_validation_requires_coherence_risk() -> None:
    valid_payload = {
        "assessments": [
            {
                "nodeId": "pk_node",
                "scientificRisk": "Medium",
                "executionRisk": "Low",
                "regulatoryRisk": "Low",
                "coherenceRisk": "High",
                "overallRisk": "Medium",
                "fragility": "High",
                "summary": "Summary",
                "scientificDrivers": [],
                "executionDrivers": [],
                "regulatoryDrivers": [],
                "coherenceDrivers": [],
                "fragilityDrivers": [],
                "recommendations": [],
                "keyAssumptions": [],
                "affectedClaims": [],
                "changeSummary": "",
            }
        ]
    }

    parsed = RiskScanResponse.model_validate(valid_payload)
    assert parsed.assessments[0].coherenceRisk == "High"

    invalid_payload = {
        "assessments": [
            {
                **valid_payload["assessments"][0],
            }
        ]
    }
    invalid_payload["assessments"][0].pop("coherenceRisk")

    with pytest.raises(ValidationError):
        RiskScanResponse.model_validate(invalid_payload)


def test_review_and_evidence_structured_outputs_validate() -> None:
    review_choice = ReviewChoice.model_validate(
        {
            "findings": [
                {
                    "id": "finding_1",
                    "severity": "high",
                    "type": "missing_critical_evidence",
                    "summary": "Missing exposure support",
                    "details": "The clinic-bound story still lacks confirmed exposure support.",
                    "suggestedAction": "Run the exposure study before locking the next package.",
                    "nodeIds": ["pk_node"],
                }
            ]
        }
    )
    assert review_choice.findings[0].type == "missing_critical_evidence"

    evidence_choice = EvidenceChoice.model_validate(
        {
            "answer": "The graph has one directly relevant exposure node.",
            "supportingEvidence": [
                {
                    "nodeId": "pk_node",
                    "field": "decision_supported",
                    "snippet": "Supports brain penetration claim",
                    "rationale": "This node explicitly ties the work to the claim in question.",
                }
            ],
            "missingEvidence": ["No repeat-dose exposure confirmation is present."],
            "referencedNodeIds": ["pk_node"],
        }
    )
    assert evidence_choice.supportingEvidence[0].nodeId == "pk_node"
