from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel as PydanticBaseModel, ConfigDict, Field, model_validator


EntityKind = Literal[
    "simple_entity",
    "complex",
    "modified_form",
    "family_or_class",
    "process_or_pathway",
    "cell_state",
    "ambiguous",
]
NormalizationStatus = Literal[
    "exact_normalized",
    "alias_normalized",
    "fuzzy_normalized",
    "ambiguous",
    "unresolved",
]
EntityType = Literal[
    "gene",
    "protein",
    "cytokine",
    "receptor",
    "pathway",
    "complex",
    "cell_type",
    "tissue",
    "small_molecule",
    "drug",
    "phenotype",
    "disease",
    "biomarker",
    "process",
    "family",
    "modified_protein",
    "other",
]
RelationType = Literal[
    "activates",
    "inhibits",
    "binds",
    "phosphorylates",
    "catalyzes",
    "regulates_expression",
    "modulates",
]
RelationCategory = Literal[
    "interaction",
    "membership",
    "modification",
    "state_relation",
    "equivalence_candidate",
    "background",
    "other",
]
AssertionStatus = Literal["explicit", "inferred", "unresolved"]
SupportClass = Literal[
    "current_paper_direct",
    "current_paper_indirect",
    "author_interpretation",
    "background_claim",
    "speculative",
    "conflicting",
]
MechanisticStatus = Literal[
    "direct",
    "indirect",
    "associative",
    "interpretive",
    "speculative",
    "conflicting",
]
EvidenceModality = Literal[
    "in_vitro",
    "in_vivo",
    "human",
    "ex_vivo",
    "computational",
    "review",
    "unknown",
]
EvidenceStrength = Literal["strong", "moderate", "weak"]
PathwaySourceType = Literal["pubmed_url", "pmc_url", "pmcid", "raw_text"]
PathwayFetchStatus = Literal["pending", "fetched", "failed"]
SimpleClaimEntityType = Literal[
    "protein",
    "gene",
    "small_molecule",
    "complex",
    "pathway",
    "phenotype",
    "other",
]
SimpleClaimInteractionType = Literal[
    "activates",
    "inhibits",
    "binds",
    "phosphorylates",
    "catalyzes",
    "regulates_expression",
    "modulates",
    "unknown",
]
SimpleClaimEvidenceLevel = Literal[
    "human",
    "in_vivo",
    "in_vitro",
    "in_silico",
    "review",
    "unknown",
]
SimpleClaimStrength = Literal["strong", "moderate", "weak", "uncertain"]


class BaseModel(PydanticBaseModel):
    model_config = ConfigDict(extra="forbid")


def normalize_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [item.strip() for item in value if isinstance(item, str) and item.strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.splitlines() if item.strip()]
    return []


class PathwayPaperSource(BaseModel):
    sourceId: str
    label: str | None = None
    sourceType: PathwaySourceType
    sourceValue: str
    title: str | None = None
    pubmedId: str | None = None
    pmcid: str | None = None
    fetchStatus: PathwayFetchStatus | None = None
    fetchError: str | None = None


class PathwayClaim(BaseModel):
    source_entity: str
    source_type: SimpleClaimEntityType
    target_entity: str
    target_type: SimpleClaimEntityType
    interaction_type: SimpleClaimInteractionType
    evidence_level: SimpleClaimEvidenceLevel
    system_context: str | None = None
    experiment_summary: str
    claim_strength: SimpleClaimStrength
    quoted_support: str


class MultiPaperPathwayClaim(PathwayClaim):
    paper_source_id: str
    paper_title: str | None = None


class MultiPaperPathwayClaimExtraction(BaseModel):
    corpus_title: str | None = None
    claims: list[MultiPaperPathwayClaim] = Field(default_factory=list)


class CuratedPathwayClaim(MultiPaperPathwayClaim):
    selection_rationale: str


class CuratedPathwayClaimSet(BaseModel):
    graph_title: str | None = None
    graph_summary: str | None = None
    claims: list[CuratedPathwayClaim] = Field(default_factory=list)


class EntityMention(BaseModel):
    mention_id: str
    paper_source_id: str | None = None
    paper_title: str | None = None
    chunk_id: str
    section: str
    raw_text: str
    canonical_name_candidate: str | None = None
    entity_type: EntityType
    entity_kind: EntityKind
    normalization_status: NormalizationStatus
    base_entity_candidate: str | None = None
    candidate_components: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    short_rationale: str


class EvidenceItem(BaseModel):
    evidence_id: str
    paper_source_id: str | None = None
    paper_title: str | None = None
    chunk_id: str
    section: str
    source_mention_id: str
    target_mention_id: str
    source_entity_name: str
    target_entity_name: str
    relation_type: RelationType
    relation_category: RelationCategory
    assertion_status: AssertionStatus
    direction: Literal["source_to_target", "undirected", "unknown"]
    support_class: SupportClass
    mechanistic_status: MechanisticStatus
    evidence_modality: EvidenceModality
    species_or_system: str | None = None
    experiment_context: str | None = None
    intervention: str | None = None
    measured_endpoint: str | None = None
    effect_direction: Literal[
        "increase",
        "decrease",
        "activate",
        "inhibit",
        "bind",
        "associate",
        "unknown",
    ]
    supporting_snippet: str
    is_from_current_paper: bool
    is_primary_result: bool
    figure_or_table_ref: str | None = None
    cited_reference_numbers: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    short_rationale: str


class NormalizedEntity(BaseModel):
    entity_id: str
    canonical_name: str
    entity_type: EntityType
    entity_kind: EntityKind
    aliases: list[str] = Field(default_factory=list)
    source_mention_ids: list[str] = Field(default_factory=list)
    normalization_status: NormalizationStatus
    base_entity_id: str | None = None
    component_entity_ids: list[str] = Field(default_factory=list)
    notes: str


class DuplicateEntitySuggestion(BaseModel):
    entity_id_a: str
    entity_id_b: str
    decision: Literal["merge", "keep_separate"]
    safe_to_auto_merge: bool = False
    confidence: float = Field(ge=0, le=1)
    rationale: str


class DuplicateEntityReview(BaseModel):
    suggestions: list[DuplicateEntitySuggestion] = Field(default_factory=list)


class AggregatedRelation(BaseModel):
    relation_id: str
    source_entity_id: str
    target_entity_id: str
    relation_type: RelationType
    relation_category: RelationCategory
    assertion_status: AssertionStatus
    direction: Literal["source_to_target", "undirected", "unknown"]
    support_class: SupportClass | None = None
    mechanistic_status: MechanisticStatus | None = None
    evidence_strength: EvidenceStrength | None = None
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[str] = Field(default_factory=list)
    summary: str
    notes: str


class NormalizationDecision(BaseModel):
    decision_id: str
    decision_type: Literal[
        "merge",
        "keep_separate",
        "complex_assembly",
        "modified_form_link",
        "family_member_separation",
        "pathway_entity_separation",
    ]
    input_mention_ids: list[str] = Field(default_factory=list)
    output_entity_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    rationale: str


class UnresolvedIssue(BaseModel):
    issue_id: str
    issue_type: Literal[
        "entity_merge_uncertain",
        "relation_conflict",
        "direction_uncertain",
        "complex_identity_uncertain",
        "modified_form_base_uncertain",
        "family_vs_member_uncertain",
        "pathway_vs_entity_uncertain",
        "other",
    ]
    description: str
    related_entity_ids: list[str] = Field(default_factory=list)
    related_evidence_ids: list[str] = Field(default_factory=list)
    recommended_handling: Literal[
        "keep separate",
        "hide by default",
        "manual review",
        "other",
    ]


class PaperMetadata(BaseModel):
    title: str | None = None
    pubmed_id: str | None = None
    pmcid: str | None = None
    doi: str | None = None


class PathwayGraph(BaseModel):
    paper_metadata: PaperMetadata
    entity_mentions: list[EntityMention] = Field(default_factory=list)
    evidence_items: list[EvidenceItem] = Field(default_factory=list)
    normalized_entities: list[NormalizedEntity] = Field(default_factory=list)
    default_relations: list[AggregatedRelation] = Field(default_factory=list)
    structural_relations: list[AggregatedRelation] = Field(default_factory=list)
    nondefault_relations: list[AggregatedRelation] = Field(default_factory=list)
    normalization_decisions: list[NormalizationDecision] = Field(default_factory=list)
    unresolved_issues: list[UnresolvedIssue] = Field(default_factory=list)


class PathwaySanityFinding(BaseModel):
    finding_id: str
    severity: Literal["low", "medium", "high"]
    finding_type: Literal[
        "near_duplicate_entities",
        "family_member_confusion",
        "pathway_entity_confusion",
        "complex_missing_membership",
        "modified_form_disconnected",
        "suspicious_merge",
        "relation_conflict",
        "missing_structural_link",
        "singleton_alias_fragment",
        "weak_default_edge",
        "other",
    ]
    description: str
    related_entity_ids: list[str] = Field(default_factory=list)
    related_relation_ids: list[str] = Field(default_factory=list)
    recommended_action: Literal[
        "keep separate",
        "add membership relation",
        "add modified-form relation",
        "downgrade to nondefault",
        "split merged entity",
        "mark ambiguous",
        "manual review",
        "other",
    ]
    confidence: float = Field(ge=0, le=1)


class PathwaySanitySummary(BaseModel):
    overall_graph_quality: Literal["good", "acceptable_with_warnings", "needs_review"]
    high_priority_issue_count: int = Field(ge=0)
    notes: str


class PathwaySanityReport(BaseModel):
    sanity_findings: list[PathwaySanityFinding] = Field(default_factory=list)
    summary: PathwaySanitySummary


class UnresolvedStructuralIssue(BaseModel):
    issue_id: str
    chunk_id: str
    issue_type: Literal[
        "complex_identity_uncertain",
        "modified_form_base_uncertain",
        "family_vs_member_uncertain",
        "pathway_vs_entity_uncertain",
        "alias_uncertain",
        "other",
    ]
    description: str
    related_mention_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class RejectedCandidate(BaseModel):
    chunk_id: str
    text_snippet: str
    reason: Literal[
        "background_only",
        "too_vague",
        "no_experimental_context",
        "unsupported_summary",
        "ambiguous_entities",
        "ambiguous_direction",
        "other",
    ]


class PathwayEvidenceFilter(BaseModel):
    modalities: list[str] = Field(default_factory=list)
    support_classes: list[str] = Field(default_factory=list)
    min_confidence: float = Field(default=0, ge=0, le=1)
    require_all_edges_meet_filter: bool = False
    include_background: bool = False


class PathwayRenderInstructions(BaseModel):
    show_only_subgraph: bool = False
    highlight_entity_types: list[str] = Field(default_factory=list)
    highlight_relation_types: list[str] = Field(default_factory=list)


class ExtractionPassResult(BaseModel):
    paper_metadata: PaperMetadata
    entity_mentions: list[EntityMention] = Field(default_factory=list)
    evidence_items: list[EvidenceItem] = Field(default_factory=list)
    unresolved_structural_issues: list[UnresolvedStructuralIssue] = Field(default_factory=list)
    rejected_candidates: list[RejectedCandidate] = Field(default_factory=list)


class AggregationPassResult(BaseModel):
    normalized_entities: list[NormalizedEntity] = Field(default_factory=list)
    default_relations: list[AggregatedRelation] = Field(default_factory=list)
    structural_relations: list[AggregatedRelation] = Field(default_factory=list)
    nondefault_relations: list[AggregatedRelation] = Field(default_factory=list)
    normalization_decisions: list[NormalizationDecision] = Field(default_factory=list)
    unresolved_issues: list[UnresolvedIssue] = Field(default_factory=list)


class PathwayQueryHistoryItem(BaseModel):
    id: str
    query: str
    askedAt: str
    answerSummary: str
    status: Literal["ok", "no_match", "ambiguous_entity", "no_supported_path", "unsupported_query"]


class PathwayNodePayload(BaseModel):
    id: str
    title: str
    nodeKind: Literal["biological_pathway"] = "biological_pathway"
    summary: str | None = None
    focusTerms: list[str] = Field(default_factory=list)
    paperSources: list[PathwayPaperSource] = Field(default_factory=list)
    extractionStatus: Literal["empty", "building", "ready", "error"] = "empty"
    extractionError: str | None = None
    pathwayGraph: PathwayGraph | None = None
    sanityReport: PathwaySanityReport | None = None
    queryHistory: list[PathwayQueryHistoryItem] = Field(default_factory=list)
    lastBuiltAt: str | None = None
    linkedExperimentNodeIds: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        normalized["focusTerms"] = normalize_string_list(normalized.get("focusTerms"))
        normalized["linkedExperimentNodeIds"] = normalize_string_list(
            normalized.get("linkedExperimentNodeIds")
        )
        return normalized

class PathwayBuildRequest(BaseModel):
    title: str | None = None
    focusTerms: list[str] = Field(default_factory=list)
    paperSources: list[PathwayPaperSource] = Field(default_factory=list)
    pathwayNode: PathwayNodePayload | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        normalized["focusTerms"] = normalize_string_list(normalized.get("focusTerms"))
        return normalized

    @model_validator(mode="after")
    def resolve_sources(self) -> "PathwayBuildRequest":
        if self.pathwayNode:
            if not self.paperSources:
                self.paperSources = list(self.pathwayNode.paperSources)
            if not self.focusTerms:
                self.focusTerms = list(self.pathwayNode.focusTerms)
            if not self.title:
                self.title = self.pathwayNode.title
        return self


class ParsedSourceSummary(BaseModel):
    sourceId: str
    label: str
    fetchStatus: Literal["fetched", "failed"]
    title: str | None = None
    pubmedId: str | None = None
    pmcid: str | None = None
    warnings: list[str] = Field(default_factory=list)


class PathwayBuildResponse(BaseModel):
    status: Literal["ready", "error"]
    parsedSources: list[ParsedSourceSummary] = Field(default_factory=list)
    pathwayGraph: PathwayGraph | None = None
    sanityReport: PathwaySanityReport | None = None
    buildSummary: str
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class PathwayQueryPlan(BaseModel):
    query_intent: Literal[
        "path_between",
        "direct_relation",
        "neighbors",
        "evidence_for_relation",
        "highlight_entities",
        "highlight_relations",
        "support_gap",
        "summarize_subgraph",
    ]
    source_entity_text: str | None = None
    target_entity_text: str | None = None
    entity_texts: list[str] = Field(default_factory=list)
    search_mode: Literal["direct_only", "indirect_path", "neighborhood"]
    max_hops: int = Field(default=4, ge=1, le=6)
    path_validation_mode: Literal[
        "all_edges_must_match",
        "at_least_one_edge_matches",
        "rank_by_match_density",
    ] = "rank_by_match_density"
    allowed_relation_types: list[str] = Field(default_factory=list)
    allowed_entity_types: list[str] = Field(default_factory=list)
    include_structural_relations: bool = True
    include_nondefault_relations: bool = False
    evidence_filter: PathwayEvidenceFilter = Field(default_factory=PathwayEvidenceFilter)
    render_instructions: PathwayRenderInstructions = Field(default_factory=PathwayRenderInstructions)
    answer_mode: Literal["yes_no_with_subgraph", "subgraph_and_summary", "evidence_table"]


class PathwayQueryRequest(BaseModel):
    pathwayGraph: PathwayGraph
    query: str = Field(min_length=1)


class ResolvedEntityMatch(BaseModel):
    input_text: str
    matched_entity_id: str | None = None
    matched_entity_name: str | None = None
    match_confidence: float = Field(ge=0, le=1)
    match_status: Literal["exact", "alias", "fuzzy", "ambiguous", "unresolved"]


class EvidenceCard(BaseModel):
    relation_id: str
    evidence_id: str
    paper_title: str
    section: str
    support_class: SupportClass
    evidence_modality: EvidenceModality
    experiment_context: str | None = None
    supporting_snippet: str


class PathwayQueryPlanSummary(BaseModel):
    query_intent: str
    search_mode: str
    max_hops: int = Field(ge=1)


class PathwayQueryResponse(BaseModel):
    query_status: Literal[
        "ok",
        "no_match",
        "ambiguous_entity",
        "no_supported_path",
        "unsupported_query",
    ]
    query_plan: PathwayQueryPlanSummary
    resolved_entities: list[ResolvedEntityMatch] = Field(default_factory=list)
    subgraph_entity_ids: list[str] = Field(default_factory=list)
    subgraph_relation_ids: list[str] = Field(default_factory=list)
    evidence_cards: list[EvidenceCard] = Field(default_factory=list)
    answer_summary: str
    notes: list[str] = Field(default_factory=list)
