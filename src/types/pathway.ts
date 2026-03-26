export const ENTITY_KIND_OPTIONS = [
  'simple_entity',
  'complex',
  'modified_form',
  'family_or_class',
  'process_or_pathway',
  'cell_state',
  'ambiguous',
] as const;

export type EntityKind = (typeof ENTITY_KIND_OPTIONS)[number];

export const NORMALIZATION_STATUS_OPTIONS = [
  'exact_normalized',
  'alias_normalized',
  'fuzzy_normalized',
  'ambiguous',
  'unresolved',
] as const;

export type NormalizationStatus = (typeof NORMALIZATION_STATUS_OPTIONS)[number];

export const ENTITY_TYPE_OPTIONS = [
  'gene',
  'protein',
  'small_molecule',
  'cell_state',
  'phenotype',
] as const;

export type EntityType = (typeof ENTITY_TYPE_OPTIONS)[number];

export const RELATION_TYPE_OPTIONS = [
  'activates',
  'inhibits',
  'binds',
  'phosphorylates',
  'catalyzes',
  'regulates_expression',
  'modulates',
] as const;

export type RelationType = (typeof RELATION_TYPE_OPTIONS)[number];

export const RELATION_CATEGORY_OPTIONS = [
  'interaction',
  'membership',
  'modification',
  'state_relation',
  'equivalence_candidate',
  'background',
  'other',
] as const;

export type RelationCategory = (typeof RELATION_CATEGORY_OPTIONS)[number];

export const ASSERTION_STATUS_OPTIONS = [
  'explicit',
  'inferred',
  'unresolved',
] as const;

export type AssertionStatus = (typeof ASSERTION_STATUS_OPTIONS)[number];

export const SUPPORT_CLASS_OPTIONS = [
  'current_paper_direct',
  'current_paper_indirect',
  'author_interpretation',
  'background_claim',
  'speculative',
  'conflicting',
] as const;

export type SupportClass = (typeof SUPPORT_CLASS_OPTIONS)[number];

export const MECHANISTIC_STATUS_OPTIONS = [
  'direct',
  'indirect',
  'associative',
  'interpretive',
  'speculative',
  'conflicting',
] as const;

export type MechanisticStatus = (typeof MECHANISTIC_STATUS_OPTIONS)[number];

export const EVIDENCE_MODALITY_OPTIONS = [
  'in_vitro',
  'in_vivo',
  'human',
  'ex_vivo',
  'computational',
  'review',
  'unknown',
] as const;

export type EvidenceModality = (typeof EVIDENCE_MODALITY_OPTIONS)[number];

export const EVIDENCE_STRENGTH_OPTIONS = [
  'strong',
  'moderate',
  'weak',
] as const;

export type EvidenceStrength = (typeof EVIDENCE_STRENGTH_OPTIONS)[number];

export const PATHWAY_SOURCE_TYPE_OPTIONS = [
  'pubmed_url',
  'pmc_url',
  'pmcid',
  'raw_text',
] as const;

export type PathwaySourceType = (typeof PATHWAY_SOURCE_TYPE_OPTIONS)[number];

export const PATHWAY_FETCH_STATUS_OPTIONS = [
  'pending',
  'fetched',
  'failed',
] as const;

export type PathwayFetchStatus = (typeof PATHWAY_FETCH_STATUS_OPTIONS)[number];

export type PathwayPaperSource = {
  sourceId: string;
  label?: string;
  sourceType: PathwaySourceType;
  sourceValue: string;
  title?: string | null;
  pubmedId?: string | null;
  pmcid?: string | null;
  fetchStatus?: PathwayFetchStatus;
  fetchError?: string | null;
};

export type EntityMention = {
  mention_id: string;
  paper_source_id?: string | null;
  paper_title?: string | null;
  chunk_id: string;
  section: string;
  raw_text: string;
  canonical_name_candidate: string | null;
  entity_type: EntityType;
  entity_kind: EntityKind;
  normalization_status: NormalizationStatus;
  base_entity_candidate: string | null;
  candidate_components: string[];
  aliases: string[];
  confidence: number;
  short_rationale: string;
};

export type EvidenceItem = {
  evidence_id: string;
  paper_source_id?: string | null;
  paper_title?: string | null;
  chunk_id: string;
  section: string;
  source_mention_id: string;
  target_mention_id: string;
  source_entity_name: string;
  target_entity_name: string;
  relation_type: RelationType;
  relation_category: RelationCategory;
  assertion_status: AssertionStatus;
  direction: 'source_to_target' | 'undirected' | 'unknown';
  support_class: SupportClass;
  mechanistic_status: MechanisticStatus;
  evidence_modality: EvidenceModality;
  species_or_system: string | null;
  experiment_context: string | null;
  intervention: string | null;
  measured_endpoint: string | null;
  effect_direction:
    | 'increase'
    | 'decrease'
    | 'activate'
    | 'inhibit'
    | 'bind'
    | 'associate'
    | 'unknown';
  supporting_snippet: string;
  is_from_current_paper: boolean;
  is_primary_result: boolean;
  figure_or_table_ref: string | null;
  cited_reference_numbers: string[];
  confidence: number;
  short_rationale: string;
};

export type NormalizedEntity = {
  entity_id: string;
  canonical_name: string;
  entity_type: EntityType;
  entity_kind: EntityKind;
  aliases: string[];
  source_mention_ids: string[];
  normalization_status: NormalizationStatus;
  base_entity_id: string | null;
  component_entity_ids: string[];
  notes: string;
};

export type AggregatedRelation = {
  relation_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: RelationType;
  relation_category: RelationCategory;
  assertion_status: AssertionStatus;
  direction: 'source_to_target' | 'undirected' | 'unknown';
  support_class: SupportClass | null;
  mechanistic_status: MechanisticStatus | null;
  evidence_strength: EvidenceStrength | null;
  confidence: number;
  evidence_ids: string[];
  summary: string;
  notes: string;
};

export type NormalizationDecision = {
  decision_id: string;
  decision_type:
    | 'merge'
    | 'keep_separate'
    | 'complex_assembly'
    | 'modified_form_link'
    | 'family_member_separation'
    | 'pathway_entity_separation';
  input_mention_ids: string[];
  output_entity_ids: string[];
  confidence: number;
  rationale: string;
};

export type UnresolvedIssue = {
  issue_id: string;
  issue_type:
    | 'entity_merge_uncertain'
    | 'relation_conflict'
    | 'direction_uncertain'
    | 'complex_identity_uncertain'
    | 'modified_form_base_uncertain'
    | 'family_vs_member_uncertain'
    | 'pathway_vs_entity_uncertain'
    | 'other';
  description: string;
  related_entity_ids: string[];
  related_evidence_ids: string[];
  recommended_handling: 'keep separate' | 'hide by default' | 'manual review' | 'other';
};

export type PathwayGraph = {
  paper_metadata: {
    title: string;
    pubmed_id: string | null;
    pmcid: string | null;
    doi: string | null;
  };
  entity_mentions: EntityMention[];
  evidence_items: EvidenceItem[];
  normalized_entities: NormalizedEntity[];
  default_relations: AggregatedRelation[];
  structural_relations: AggregatedRelation[];
  nondefault_relations: AggregatedRelation[];
  normalization_decisions: NormalizationDecision[];
  unresolved_issues: UnresolvedIssue[];
};

export type PathwaySanityFinding = {
  finding_id: string;
  severity: 'low' | 'medium' | 'high';
  finding_type:
    | 'near_duplicate_entities'
    | 'family_member_confusion'
    | 'pathway_entity_confusion'
    | 'complex_missing_membership'
    | 'modified_form_disconnected'
    | 'suspicious_merge'
    | 'relation_conflict'
    | 'missing_structural_link'
    | 'singleton_alias_fragment'
    | 'weak_default_edge'
    | 'other';
  description: string;
  related_entity_ids: string[];
  related_relation_ids: string[];
  recommended_action:
    | 'keep separate'
    | 'add membership relation'
    | 'add modified-form relation'
    | 'downgrade to nondefault'
    | 'split merged entity'
    | 'mark ambiguous'
    | 'manual review'
    | 'other';
  confidence: number;
};

export type PathwaySanityReport = {
  sanity_findings: PathwaySanityFinding[];
  summary: {
    overall_graph_quality: 'good' | 'acceptable_with_warnings' | 'needs_review';
    high_priority_issue_count: number;
    notes: string;
  };
};

export type PathwayQueryHistoryItem = {
  id: string;
  query: string;
  askedAt: string;
  answerSummary: string;
  status: PathwayQueryResponse['query_status'];
};

export type PathwayBuildResponse = {
  status: 'ready' | 'error';
  parsedSources: Array<{
    sourceId: string;
    label: string;
    fetchStatus: 'fetched' | 'failed';
    title: string | null;
    pubmedId: string | null;
    pmcid: string | null;
    warnings: string[];
  }>;
  pathwayGraph: PathwayGraph | null;
  sanityReport: PathwaySanityReport | null;
  buildSummary: string;
  warnings: string[];
  errors: string[];
};

export type PathwayQueryPlan = {
  query_intent:
    | 'path_between'
    | 'direct_relation'
    | 'neighbors'
    | 'evidence_for_relation'
    | 'highlight_entities'
    | 'highlight_relations'
    | 'support_gap'
    | 'summarize_subgraph';
  source_entity_text: string | null;
  target_entity_text: string | null;
  entity_texts: string[];
  search_mode: 'direct_only' | 'indirect_path' | 'neighborhood';
  max_hops: number;
  path_validation_mode:
    | 'all_edges_must_match'
    | 'at_least_one_edge_matches'
    | 'rank_by_match_density';
  allowed_relation_types: string[];
  allowed_entity_types: string[];
  include_structural_relations: boolean;
  include_nondefault_relations: boolean;
  evidence_filter: {
    modalities: string[];
    support_classes: string[];
    min_confidence: number;
    require_all_edges_meet_filter: boolean;
    include_background: boolean;
  };
  render_instructions: {
    show_only_subgraph: boolean;
    highlight_entity_types: string[];
    highlight_relation_types: string[];
  };
  answer_mode: 'yes_no_with_subgraph' | 'subgraph_and_summary' | 'evidence_table';
};

export type PathwayQueryResponse = {
  query_status:
    | 'ok'
    | 'no_match'
    | 'ambiguous_entity'
    | 'no_supported_path'
    | 'unsupported_query';
  query_plan: {
    query_intent: PathwayQueryPlan['query_intent'];
    search_mode: PathwayQueryPlan['search_mode'];
    max_hops: number;
  };
  resolved_entities: Array<{
    input_text: string;
    matched_entity_id: string | null;
    matched_entity_name: string | null;
    match_confidence: number;
    match_status: 'exact' | 'alias' | 'fuzzy' | 'ambiguous' | 'unresolved';
  }>;
  subgraph_entity_ids: string[];
  subgraph_relation_ids: string[];
  evidence_cards: Array<{
    relation_id: string;
    evidence_id: string;
    paper_title: string;
    section: string;
    support_class: SupportClass;
    evidence_modality: EvidenceModality;
    experiment_context: string | null;
    supporting_snippet: string;
  }>;
  answer_summary: string;
  notes: string[];
};
