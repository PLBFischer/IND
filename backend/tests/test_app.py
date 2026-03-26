import subprocess
from urllib.error import HTTPError

from pydantic import ValidationError
import pytest

from backend.app import (
    ChatRequest,
    EvidenceChoice,
    GraphPayload,
    ReviewChoice,
    RiskScanResponse,
    apply_duplicate_entity_merges,
    apply_pathway_admission_policy,
    build_deterministic_sanity_report,
    build_chat_graph_context,
    execute_pathway_query_plan,
    extract_pubmed_id_from_value,
    extract_pmcid_from_pubmed_html,
    fetch_url_text,
    normalize_surface_form,
    prune_auxiliary_small_molecule_nodes,
    prune_nonvisual_process_and_phenotype_edges,
    reconcile_curated_claim_abstractions,
    resolve_source_text,
    solve_schedule_response,
)
from backend.pathway_models import (
    AggregatedRelation,
    CuratedPathwayClaimSet,
    DuplicateEntityReview,
    EvidenceItem,
    NormalizedEntity,
    PathwayGraph,
    PathwayPaperSource,
    PathwayQueryPlan,
    PathwaySanityReport,
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


def make_test_pathway_graph() -> PathwayGraph:
    return PathwayGraph(
        paper_metadata={
            "title": "Demo pathway paper",
            "pubmed_id": None,
            "pmcid": None,
            "doi": None,
        },
        entity_mentions=[],
        evidence_items=[
            EvidenceItem(
                evidence_id="EV_results",
                paper_title="Demo pathway paper",
                chunk_id="chunk_results",
                section="Results",
                source_mention_id="M1",
                target_mention_id="M2",
                source_entity_name="B",
                target_entity_name="D",
                relation_type="binds",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="current_paper_direct",
                mechanistic_status="direct",
                evidence_modality="in_vivo",
                species_or_system="mouse",
                experiment_context="Co-IP in treated animals",
                intervention="compound X",
                measured_endpoint="binding",
                effect_direction="bind",
                supporting_snippet="BC complex bound D in treated animals.",
                is_from_current_paper=True,
                is_primary_result=True,
                figure_or_table_ref="Fig. 2",
                cited_reference_numbers=[],
                confidence=0.9,
                short_rationale="Direct result-bearing evidence.",
            ),
            EvidenceItem(
                evidence_id="EV_intro",
                paper_title="Demo pathway paper",
                chunk_id="chunk_intro",
                section="Introduction",
                source_mention_id="M3",
                target_mention_id="M4",
                source_entity_name="A",
                target_entity_name="B",
                relation_type="activates",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="background_claim",
                mechanistic_status="interpretive",
                evidence_modality="review",
                species_or_system=None,
                experiment_context=None,
                intervention=None,
                measured_endpoint=None,
                effect_direction="activate",
                supporting_snippet="A has been shown to activate B.",
                is_from_current_paper=False,
                is_primary_result=False,
                figure_or_table_ref=None,
                cited_reference_numbers=["12"],
                confidence=0.7,
                short_rationale="Background only.",
            ),
        ],
        normalized_entities=[
            NormalizedEntity(
                entity_id="E_A",
                canonical_name="A",
                entity_type="protein",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
            NormalizedEntity(
                entity_id="E_B",
                canonical_name="B",
                entity_type="protein",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
            NormalizedEntity(
                entity_id="E_C",
                canonical_name="C",
                entity_type="protein",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
            NormalizedEntity(
                entity_id="E_BC",
                canonical_name="BC complex",
                entity_type="protein",
                entity_kind="complex",
                aliases=["B:C complex"],
                source_mention_ids=[],
                normalization_status="alias_normalized",
                base_entity_id=None,
                component_entity_ids=["E_B", "E_C"],
                notes="Explicit heterodimer.",
            ),
            NormalizedEntity(
                entity_id="E_D",
                canonical_name="D",
                entity_type="protein",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
            NormalizedEntity(
                entity_id="E_pERK",
                canonical_name="p-ERK",
                entity_type="protein",
                entity_kind="modified_form",
                aliases=["phosphorylated ERK"],
                source_mention_ids=[],
                normalization_status="alias_normalized",
                base_entity_id="E_ERK",
                component_entity_ids=[],
                notes="Explicit modified form.",
            ),
            NormalizedEntity(
                entity_id="E_ERK",
                canonical_name="ERK",
                entity_type="protein",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="Base protein remains separate from p-ERK.",
            ),
            NormalizedEntity(
                entity_id="E_MAPK_family",
                canonical_name="MAPK family",
                entity_type="protein",
                entity_kind="family_or_class",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="Family level entity.",
            ),
        ],
        default_relations=[
            AggregatedRelation(
                relation_id="R_results",
                source_entity_id="E_BC",
                target_entity_id="E_D",
                relation_type="binds",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="current_paper_direct",
                mechanistic_status="direct",
                evidence_strength="strong",
                confidence=0.91,
                evidence_ids=["EV_results"],
                summary="BC complex binds D.",
                notes="",
            ),
            AggregatedRelation(
                relation_id="R_intro",
                source_entity_id="E_A",
                target_entity_id="E_B",
                relation_type="activates",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="background_claim",
                mechanistic_status="interpretive",
                evidence_strength="weak",
                confidence=0.7,
                evidence_ids=["EV_intro"],
                summary="A activates B.",
                notes="Introduction summary.",
            ),
        ],
        structural_relations=[],
        nondefault_relations=[],
        normalization_decisions=[],
        unresolved_issues=[],
    )


def test_scheduler_ignores_pathway_nodes() -> None:
    payload = GraphPayload.model_validate(
        {
            "nodes": [
                {
                    "id": "exp_a",
                    "title": "Experiment A",
                    "nodeKind": "experiment",
                    "duration": 2,
                    "workHoursPerWeek": 0,
                },
                {
                    "id": "path_1",
                    "title": "TNF pathway",
                    "nodeKind": "biological_pathway",
                    "paperSources": [],
                    "extractionStatus": "empty",
                },
            ],
            "edges": [],
            "personnel": [],
        }
    )

    schedule = solve_schedule_response(payload)
    assert schedule.makespan == 2
    assert [node.nodeId for node in schedule.nodes] == ["exp_a"]


def test_pathway_admission_policy_downgrades_introduction_only_relations() -> None:
    graph = make_test_pathway_graph()
    filtered = apply_pathway_admission_policy(graph)

    assert [relation.relation_id for relation in filtered.default_relations] == ["R_results"]
    assert "R_intro" in {relation.relation_id for relation in filtered.nondefault_relations}


def test_results_backed_claims_remain_in_default_relations() -> None:
    graph = make_test_pathway_graph()
    filtered = apply_pathway_admission_policy(graph)
    relation = filtered.default_relations[0]

    assert relation.relation_id == "R_results"
    assert relation.support_class == "current_paper_direct"


def test_results_backed_claims_are_rescued_from_overly_conservative_labels() -> None:
    graph = make_test_pathway_graph()
    graph.evidence_items[0].support_class = "author_interpretation"
    graph.evidence_items[0].mechanistic_status = "interpretive"
    graph.default_relations[0].support_class = "author_interpretation"
    graph.default_relations[0].mechanistic_status = "interpretive"
    graph.default_relations[0].evidence_strength = "weak"

    filtered = apply_pathway_admission_policy(graph)
    relation = next(relation for relation in filtered.default_relations if relation.relation_id == "R_results")

    assert relation.support_class == "current_paper_direct"
    assert relation.mechanistic_status == "indirect"
    assert relation.evidence_strength == "moderate"


def test_normalize_surface_form_merges_greek_suffix_variants() -> None:
    assert normalize_surface_form("TNF-α") == normalize_surface_form("TNFα")
    assert normalize_surface_form("TNF α") == normalize_surface_form("TNFα")


def test_apply_duplicate_entity_merges_combines_safe_duplicate_entities() -> None:
    graph = PathwayGraph(
        paper_metadata={"title": "TNF demo", "pubmed_id": None, "pmcid": None, "doi": None},
        entity_mentions=[],
        evidence_items=[],
        normalized_entities=[
            NormalizedEntity(
                entity_id="E_TNF1",
                canonical_name="TNF-α",
                entity_type="protein",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
            NormalizedEntity(
                entity_id="E_TNF2",
                canonical_name="TNFα",
                entity_type="protein",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
            NormalizedEntity(
                entity_id="E_CAMP",
                canonical_name="cyclic AMP",
                entity_type="small_molecule",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
        ],
        default_relations=[
            AggregatedRelation(
                relation_id="R_tnf_1",
                source_entity_id="E_TNF1",
                target_entity_id="E_CAMP",
                relation_type="modulates",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="current_paper_direct",
                mechanistic_status="indirect",
                evidence_strength="strong",
                confidence=0.9,
                evidence_ids=["EV1"],
                summary="TNF-α modulates cyclic AMP.",
                notes="",
            ),
            AggregatedRelation(
                relation_id="R_tnf_2",
                source_entity_id="E_TNF2",
                target_entity_id="E_CAMP",
                relation_type="modulates",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="current_paper_direct",
                mechanistic_status="indirect",
                evidence_strength="strong",
                confidence=0.88,
                evidence_ids=["EV2"],
                summary="TNFα modulates cyclic AMP.",
                notes="",
            ),
        ],
        structural_relations=[],
        nondefault_relations=[],
        normalization_decisions=[],
        unresolved_issues=[],
    )

    review = DuplicateEntityReview.model_validate(
        {
            "suggestions": [
                {
                    "entity_id_a": "E_TNF1",
                    "entity_id_b": "E_TNF2",
                    "decision": "merge",
                    "safe_to_auto_merge": True,
                    "confidence": 0.98,
                    "rationale": "Greek-letter punctuation variant of the same cytokine.",
                }
            ]
        }
    )

    merged = apply_duplicate_entity_merges(graph, review)

    assert len(merged.normalized_entities) == 2
    assert len(merged.default_relations) == 1
    merged_entity = next(entity for entity in merged.normalized_entities if "TNF" in entity.canonical_name)
    assert "TNFα" in merged_entity.aliases or "TNF-α" in merged_entity.aliases
    assert merged.default_relations[0].source_entity_id == merged_entity.entity_id
    assert set(merged.default_relations[0].evidence_ids) == {"EV1", "EV2"}


def test_reconcile_curated_claim_abstractions_collapses_family_member_splits() -> None:
    curated = CuratedPathwayClaimSet.model_validate(
        {
            "graph_title": "PDE4 demo",
            "graph_summary": "Demo graph",
            "claims": [
                {
                    "paper_source_id": "paper_1",
                    "paper_title": "Paper 1",
                    "source_entity": "11h",
                    "source_type": "small_molecule",
                    "target_entity": "PDE4",
                    "target_type": "protein",
                    "interaction_type": "inhibits",
                    "evidence_level": "in_vitro",
                    "system_context": "assay",
                    "experiment_summary": "11h inhibits PDE4 family activity.",
                    "claim_strength": "strong",
                    "quoted_support": "11h inhibited PDE4 isoforms.",
                    "selection_rationale": "Keeps the target family compact.",
                },
                {
                    "paper_source_id": "paper_2",
                    "paper_title": "Paper 2",
                    "source_entity": "TNF alpha",
                    "source_type": "protein",
                    "target_entity": "PDE4B",
                    "target_type": "protein",
                    "interaction_type": "activates",
                    "evidence_level": "in_vitro",
                    "system_context": "microglia",
                    "experiment_summary": "TNF alpha raises PDE4-linked activity.",
                    "claim_strength": "moderate",
                    "quoted_support": "TNF alpha increased PDE activity.",
                    "selection_rationale": "Captures the inflammatory branch.",
                },
            ],
        }
    )

    reconciled = reconcile_curated_claim_abstractions(curated)

    assert [claim.target_entity for claim in reconciled.claims] == ["PDE4", "PDE4"]


def test_reconcile_curated_claim_abstractions_collapses_subunit_to_canonical_node() -> None:
    curated = CuratedPathwayClaimSet.model_validate(
        {
            "graph_title": "NF-kB demo",
            "graph_summary": "Demo graph",
            "claims": [
                {
                    "paper_source_id": "paper_1",
                    "paper_title": "Paper 1",
                    "source_entity": "cAMP",
                    "source_type": "small_molecule",
                    "target_entity": "NF-kB",
                    "target_type": "protein",
                    "interaction_type": "inhibits",
                    "evidence_level": "in_vitro",
                    "system_context": "microglia",
                    "experiment_summary": "cAMP antagonizes NF-kB signaling.",
                    "claim_strength": "strong",
                    "quoted_support": "cAMP blocked NF-kB nuclear signaling.",
                    "selection_rationale": "Keeps the pathway readable.",
                },
                {
                    "paper_source_id": "paper_2",
                    "paper_title": "Paper 2",
                    "source_entity": "TNF-alpha",
                    "source_type": "protein",
                    "target_entity": "NF-kB p65",
                    "target_type": "protein",
                    "interaction_type": "activates",
                    "evidence_level": "in_vitro",
                    "system_context": "microglia",
                    "experiment_summary": "TNF-alpha increases p65 nuclear signaling.",
                    "claim_strength": "strong",
                    "quoted_support": "TNF-alpha increased p-p65 Ser-536.",
                    "selection_rationale": "Preserves the inflammatory branch.",
                },
            ],
        }
    )

    reconciled = reconcile_curated_claim_abstractions(curated)

    assert [claim.target_entity for claim in reconciled.claims] == ["NF-kB", "NF-kB"]


def test_prune_nonvisual_process_and_phenotype_edges_removes_expression_to_phenotype() -> None:
    graph = PathwayGraph(
        paper_metadata={"title": "Demo", "pubmed_id": None, "pmcid": None, "doi": None},
        entity_mentions=[],
        evidence_items=[],
        normalized_entities=[
            NormalizedEntity(
                entity_id="E1",
                canonical_name="NF-kB",
                entity_type="protein",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
            NormalizedEntity(
                entity_id="E2",
                canonical_name="phagocytosis",
                entity_type="phenotype",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
            NormalizedEntity(
                entity_id="E3",
                canonical_name="iNOS",
                entity_type="protein",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
        ],
        default_relations=[
            AggregatedRelation(
                relation_id="R1",
                source_entity_id="E1",
                target_entity_id="E2",
                relation_type="regulates_expression",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="current_paper_direct",
                mechanistic_status="indirect",
                evidence_strength="strong",
                confidence=0.9,
                evidence_ids=[],
                summary="NF-kB regulates_expression phagocytosis.",
                notes="",
            ),
            AggregatedRelation(
                relation_id="R2",
                source_entity_id="E1",
                target_entity_id="E3",
                relation_type="regulates_expression",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="current_paper_direct",
                mechanistic_status="indirect",
                evidence_strength="strong",
                confidence=0.9,
                evidence_ids=[],
                summary="NF-kB regulates_expression iNOS.",
                notes="",
            ),
        ],
        structural_relations=[],
        nondefault_relations=[],
        normalization_decisions=[],
        unresolved_issues=[],
    )

    pruned = prune_nonvisual_process_and_phenotype_edges(graph)

    assert [relation.relation_id for relation in pruned.default_relations] == ["R2"]
    assert [entity.canonical_name for entity in pruned.normalized_entities] == ["NF-kB", "iNOS"]


def test_prune_auxiliary_small_molecule_nodes_removes_support_tool_compound() -> None:
    graph = PathwayGraph(
        paper_metadata={"title": "Demo", "pubmed_id": None, "pmcid": None, "doi": None},
        entity_mentions=[],
        evidence_items=[
            EvidenceItem(
                evidence_id="EV1",
                paper_title="Paper 1",
                chunk_id="c1",
                section="Results",
                source_mention_id="m1",
                target_mention_id="m2",
                source_entity_name="11h",
                target_entity_name="PDE4",
                relation_type="inhibits",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="current_paper_direct",
                mechanistic_status="direct",
                evidence_modality="in_vitro",
                species_or_system=None,
                experiment_context="Main intervention",
                intervention="11h",
                measured_endpoint="PDE4",
                effect_direction="inhibit",
                supporting_snippet="11h inhibits PDE4",
                is_from_current_paper=True,
                is_primary_result=True,
                figure_or_table_ref=None,
                cited_reference_numbers=[],
                confidence=0.9,
                short_rationale="",
            ),
            EvidenceItem(
                evidence_id="EV2",
                paper_title="Paper 2",
                chunk_id="c2",
                section="Results",
                source_mention_id="m3",
                target_mention_id="m4",
                source_entity_name="Rolipram",
                target_entity_name="cAMP",
                relation_type="activates",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="current_paper_direct",
                mechanistic_status="direct",
                evidence_modality="in_vitro",
                species_or_system=None,
                experiment_context="Support compound",
                intervention="Rolipram",
                measured_endpoint="cAMP",
                effect_direction="activate",
                supporting_snippet="Rolipram raises cAMP",
                is_from_current_paper=True,
                is_primary_result=True,
                figure_or_table_ref=None,
                cited_reference_numbers=[],
                confidence=0.9,
                short_rationale="",
            ),
        ],
        normalized_entities=[
            NormalizedEntity(
                entity_id="E1",
                canonical_name="11h",
                entity_type="small_molecule",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
            NormalizedEntity(
                entity_id="E2",
                canonical_name="PDE4",
                entity_type="protein",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
            NormalizedEntity(
                entity_id="E3",
                canonical_name="Rolipram",
                entity_type="small_molecule",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
            NormalizedEntity(
                entity_id="E4",
                canonical_name="cAMP",
                entity_type="small_molecule",
                entity_kind="simple_entity",
                aliases=[],
                source_mention_ids=[],
                normalization_status="exact_normalized",
                base_entity_id=None,
                component_entity_ids=[],
                notes="",
            ),
        ],
        default_relations=[
            AggregatedRelation(
                relation_id="R1",
                source_entity_id="E1",
                target_entity_id="E2",
                relation_type="inhibits",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="current_paper_direct",
                mechanistic_status="direct",
                evidence_strength="strong",
                confidence=0.9,
                evidence_ids=["EV1"],
                summary="11h inhibits PDE4.",
                notes="",
            ),
            AggregatedRelation(
                relation_id="R2",
                source_entity_id="E3",
                target_entity_id="E4",
                relation_type="activates",
                relation_category="interaction",
                assertion_status="explicit",
                direction="source_to_target",
                support_class="current_paper_direct",
                mechanistic_status="direct",
                evidence_strength="strong",
                confidence=0.9,
                evidence_ids=["EV2"],
                summary="Rolipram activates cAMP.",
                notes="",
            ),
        ],
        structural_relations=[],
        nondefault_relations=[],
        normalization_decisions=[],
        unresolved_issues=[],
    )

    pruned = prune_auxiliary_small_molecule_nodes(graph)

    assert [relation.relation_id for relation in pruned.default_relations] == ["R1"]
    assert [entity.canonical_name for entity in pruned.normalized_entities] == ["11h", "PDE4"]


def test_sanity_report_no_longer_requires_structural_links() -> None:
    graph = make_test_pathway_graph()
    report = build_deterministic_sanity_report(graph)

    assert report.summary.overall_graph_quality in {
        "good",
        "acceptable_with_warnings",
        "needs_review",
    }
    assert all(
        finding.finding_type not in {"complex_missing_membership", "modified_form_disconnected"}
        for finding in report.sanity_findings
    )


def test_family_entities_are_kept_separate_in_sanity_audit() -> None:
    graph = make_test_pathway_graph()
    graph.normalized_entities.append(
        NormalizedEntity(
            entity_id="E_MAPK1",
            canonical_name="MAPK1",
            entity_type="protein",
            entity_kind="simple_entity",
            aliases=[],
            source_mention_ids=[],
            normalization_status="exact_normalized",
            base_entity_id=None,
            component_entity_ids=[],
            notes="Specific member.",
        )
    )

    report = build_deterministic_sanity_report(graph)
    assert isinstance(report, PathwaySanityReport)


def test_query_plan_schema_and_execution_return_expected_subgraph() -> None:
    plan = PathwayQueryPlan.model_validate(
        {
            "query_intent": "path_between",
            "source_entity_text": "B:C complex",
            "target_entity_text": "D",
            "entity_texts": [],
            "search_mode": "indirect_path",
            "max_hops": 3,
            "path_validation_mode": "rank_by_match_density",
            "allowed_relation_types": [],
            "allowed_entity_types": [],
            "include_structural_relations": True,
            "include_nondefault_relations": False,
            "evidence_filter": {
                "modalities": ["in_vivo"],
                "support_classes": ["current_paper_direct"],
                "min_confidence": 0.65,
                "require_all_edges_meet_filter": False,
                "include_background": False,
            },
            "render_instructions": {
                "show_only_subgraph": True,
                "highlight_entity_types": [],
                "highlight_relation_types": [],
            },
            "answer_mode": "yes_no_with_subgraph",
        }
    )

    response = execute_pathway_query_plan(make_test_pathway_graph(), plan)

    assert response.query_status == "ok"
    assert response.subgraph_relation_ids == ["R_results"]
    assert response.subgraph_entity_ids == ["E_BC", "E_D"]
    assert response.evidence_cards[0].evidence_id == "EV_results"


def test_direct_relation_query_matches_bidirectionally() -> None:
    plan = PathwayQueryPlan.model_validate(
        {
            "query_intent": "direct_relation",
            "source_entity_text": "D",
            "target_entity_text": "B:C complex",
            "entity_texts": [],
            "search_mode": "direct_only",
            "max_hops": 2,
            "path_validation_mode": "rank_by_match_density",
            "allowed_relation_types": [],
            "allowed_entity_types": [],
            "include_structural_relations": True,
            "include_nondefault_relations": False,
            "evidence_filter": {
                "modalities": [],
                "support_classes": [],
                "min_confidence": 0.0,
                "require_all_edges_meet_filter": False,
                "include_background": False,
            },
            "render_instructions": {
                "show_only_subgraph": True,
                "highlight_entity_types": [],
                "highlight_relation_types": [],
            },
            "answer_mode": "subgraph_and_summary",
        }
    )

    response = execute_pathway_query_plan(make_test_pathway_graph(), plan)

    assert response.query_status == "ok"
    assert response.subgraph_relation_ids == ["R_results"]


def test_direct_relation_query_includes_nondefault_when_needed() -> None:
    graph = make_test_pathway_graph()
    relation = graph.default_relations.pop(0)
    relation.relation_id = "R_results_nondefault"
    graph.nondefault_relations.append(relation)

    plan = PathwayQueryPlan.model_validate(
        {
            "query_intent": "direct_relation",
            "source_entity_text": "B:C complex",
            "target_entity_text": "D",
            "entity_texts": [],
            "search_mode": "direct_only",
            "max_hops": 2,
            "path_validation_mode": "rank_by_match_density",
            "allowed_relation_types": [],
            "allowed_entity_types": [],
            "include_structural_relations": True,
            "include_nondefault_relations": False,
            "evidence_filter": {
                "modalities": [],
                "support_classes": [],
                "min_confidence": 0.0,
                "require_all_edges_meet_filter": False,
                "include_background": False,
            },
            "render_instructions": {
                "show_only_subgraph": True,
                "highlight_entity_types": [],
                "highlight_relation_types": [],
            },
            "answer_mode": "subgraph_and_summary",
        }
    )

    response = execute_pathway_query_plan(graph, plan)

    assert response.query_status == "ok"
    assert response.subgraph_relation_ids == ["R_results_nondefault"]
    assert any("nondefault" in note for note in response.notes)


def test_direct_relation_query_falls_back_to_indirect_path() -> None:
    graph = make_test_pathway_graph()
    graph.default_relations.append(
        AggregatedRelation(
            relation_id="R_a_bc",
            source_entity_id="E_A",
            target_entity_id="E_BC",
            relation_type="activates",
            relation_category="interaction",
            assertion_status="explicit",
            direction="source_to_target",
            support_class="current_paper_direct",
            mechanistic_status="direct",
            evidence_strength="strong",
            confidence=0.9,
            evidence_ids=["EV_results"],
            summary="A activates BC complex.",
            notes="",
        )
    )

    plan = PathwayQueryPlan.model_validate(
        {
            "query_intent": "direct_relation",
            "source_entity_text": "A",
            "target_entity_text": "D",
            "entity_texts": [],
            "search_mode": "direct_only",
            "max_hops": 1,
            "path_validation_mode": "rank_by_match_density",
            "allowed_relation_types": [],
            "allowed_entity_types": [],
            "include_structural_relations": True,
            "include_nondefault_relations": False,
            "evidence_filter": {
                "modalities": [],
                "support_classes": [],
                "min_confidence": 0.0,
                "require_all_edges_meet_filter": False,
                "include_background": False,
            },
            "render_instructions": {
                "show_only_subgraph": True,
                "highlight_entity_types": [],
                "highlight_relation_types": [],
            },
            "answer_mode": "subgraph_and_summary",
        }
    )

    response = execute_pathway_query_plan(graph, plan)

    assert response.query_status == "ok"
    assert response.subgraph_relation_ids == ["R_a_bc", "R_results"]
    assert any("indirect path" in note for note in response.notes)


def test_sanity_report_schema_validates() -> None:
    report = PathwaySanityReport.model_validate(
        {
            "sanity_findings": [
                {
                    "finding_id": "finding_1",
                    "severity": "medium",
                    "finding_type": "weak_default_edge",
                    "description": "A default edge is weakly supported.",
                    "related_entity_ids": ["E_A", "E_B"],
                    "related_relation_ids": ["R_intro"],
                    "recommended_action": "downgrade to nondefault",
                    "confidence": 0.8,
                }
            ],
            "summary": {
                "overall_graph_quality": "acceptable_with_warnings",
                "high_priority_issue_count": 0,
                "notes": "Schema validation smoke test.",
            },
        }
    )

    assert report.sanity_findings[0].finding_type == "weak_default_edge"


def test_extract_pmcid_from_pubmed_html_reads_free_full_text_link() -> None:
    html = """
    <html>
      <head><meta name="citation_pmcid" content="PMC5038198" /></head>
      <body><a href="/articles/PMC5038198/">Free full text</a></body>
    </html>
    """

    assert extract_pmcid_from_pubmed_html(html) == "PMC5038198"


def test_extract_pubmed_id_from_value_reads_pubmed_url() -> None:
    assert extract_pubmed_id_from_value("https://pubmed.ncbi.nlm.nih.gov/41585874/") == "41585874"


def test_fetch_url_text_falls_back_to_curl_for_blocked_ncbi_html(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_urlopen(*_args, **_kwargs):
        raise HTTPError(
            "https://pmc.ncbi.nlm.nih.gov/articles/PMC5038198/",
            403,
            "Forbidden",
            hdrs=None,
            fp=None,
        )

    def fake_run(args: list[str], **_kwargs):
        assert args == [
            "curl",
            "-fsSL",
            "--max-time",
            "20",
            "https://pmc.ncbi.nlm.nih.gov/articles/PMC5038198/",
        ]
        return subprocess.CompletedProcess(args=args, returncode=0, stdout=b"<html>ok</html>")

    monkeypatch.setattr("backend.app.urlopen", fake_urlopen)
    monkeypatch.setattr("backend.app.subprocess.run", fake_run)

    assert fetch_url_text("https://pmc.ncbi.nlm.nih.gov/articles/PMC5038198/") == "<html>ok</html>"


def test_pubmed_source_resolves_through_pmc_when_available(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_fetch_json(url: str, *, headers: dict[str, str] | None = None) -> object:
        assert headers is not None
        if "idconv" in url:
            return {"records": [{"pmcid": "PMC4334621"}]}
        raise AssertionError(f"Unexpected JSON fetch: {url}")

    def fake_fetch_text(url: str, *, headers: dict[str, str] | None = None) -> str:
        assert headers is not None
        if "elink.fcgi" in url:
            return "<eLinkResult></eLinkResult>"
        assert "efetch.fcgi" in url
        return (
            "<article><front><article-meta><title-group><article-title>PMC article</article-title>"
            "</title-group><abstract><p>"
            + ("Results. " * 150)
            + "</p></abstract></article-meta></front><body><sec><title>Results</title><p>"
            + ("Mechanism. " * 200)
            + "</p></sec></body></article>"
        )

    monkeypatch.setattr("backend.app.fetch_url_json", fake_fetch_json)
    monkeypatch.setattr("backend.app.fetch_url_text", fake_fetch_text)

    text, summary, warnings, has_full_text = resolve_source_text(
        PathwayPaperSource(
            sourceId="source_1",
            sourceType="pubmed_url",
            sourceValue="https://pubmed.ncbi.nlm.nih.gov/41585874/",
        )
    )

    assert has_full_text is True
    assert text is not None
    assert summary.pmcid == "PMC4334621"
    assert warnings == []


def test_pmc_source_falls_back_from_efetch_to_bioc(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_fetch_json(url: str, *, headers: dict[str, str] | None = None) -> object:
        assert headers is not None
        assert "pmcoa.cgi" in url
        return {
            "documents": [
                {
                    "passages": [
                        {"text": "Background. " * 80},
                        {"text": "Results. " * 220},
                    ]
                }
            ]
        }

    def fake_fetch_text(url: str, *, headers: dict[str, str] | None = None) -> str:
        assert headers is not None
        if "efetch.fcgi" in url:
            raise HTTPError(url, 403, "Forbidden", hdrs=None, fp=None)
        raise AssertionError(f"Unexpected text fetch: {url}")

    monkeypatch.setattr("backend.app.fetch_url_json", fake_fetch_json)
    monkeypatch.setattr("backend.app.fetch_url_text", fake_fetch_text)

    text, summary, warnings, has_full_text = resolve_source_text(
        PathwayPaperSource(
            sourceId="source_1b",
            sourceType="pmcid",
            sourceValue="PMC5038198",
        )
    )

    assert has_full_text is True
    assert text is not None
    assert "Results." in text
    assert summary.pmcid == "PMC5038198"
    assert warnings == []


def test_pubmed_source_fails_cleanly_when_only_abstract_is_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "backend.app.fetch_url_json",
        lambda _url, *, headers=None: {"records": [{}]},
    )
    monkeypatch.setattr(
        "backend.app.fetch_url_text",
        lambda _url, *, headers=None: "<html><title>PubMed only</title><body>No PMC link.</body></html>",
    )

    text, summary, warnings, has_full_text = resolve_source_text(
        PathwayPaperSource(
            sourceId="source_2",
            sourceType="pubmed_url",
            sourceValue="https://pubmed.ncbi.nlm.nih.gov/00000000/",
        )
    )

    assert text is None
    assert has_full_text is False
    assert summary.fetchStatus == "failed"
    assert any("PMC full-text" in warning or "abstract-only" in warning for warning in warnings)
