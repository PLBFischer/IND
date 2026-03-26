import type {
  BiologicalPathwayNode,
  ExperimentNode,
  FlowNode,
} from '../types/graph';
import type {
  AggregatedRelation,
  EvidenceItem,
  PathwayGraph,
  PathwayQueryResponse,
  RelationType,
  PathwaySanityReport,
  SupportClass,
} from '../types/pathway';
import { isExperimentNode, isPathwayNode } from './graph';

type Point = { x: number; y: number };

export type PathwayVisibilityFilters = {
  strongEvidenceOnly: boolean;
  includeNondefaultRelations: boolean;
  includeStructuralRelations: boolean;
  modality: string;
  minConfidence: number;
};

export type PathwayInteractionLegendItem = {
  key: string;
  label: string;
  detail: string;
  className: string;
  markerId: string;
};

export const createEmptyPathwayNode = (
  id: string,
  title: string,
  x: number,
  y: number,
): BiologicalPathwayNode => ({
  id,
  title,
  x,
  y,
  nodeKind: 'biological_pathway',
  summary: '',
  focusTerms: [],
  paperSources: [],
  extractionStatus: 'empty',
  extractionError: null,
  pathwayGraph: null,
  sanityReport: null,
  queryHistory: [],
  lastBuiltAt: null,
  linkedExperimentNodeIds: [],
  lastBuildResponse: null,
  latestQueryResponse: null,
});

export const getPathwayNodes = (nodes: FlowNode[]) => nodes.filter(isPathwayNode);

export const getExperimentNodeOptions = (nodes: FlowNode[]) => nodes.filter(isExperimentNode);

export const getPathwayBuildSummary = (node: BiologicalPathwayNode) => {
  if (!node.pathwayGraph) {
    return 'No pathway graph built yet.';
  }

  const strongEdgeCount = node.pathwayGraph.default_relations.length;
  const issueCount = node.sanityReport?.summary.high_priority_issue_count ?? 0;

  return `${strongEdgeCount} default relation${
    strongEdgeCount === 1 ? '' : 's'
  }; ${issueCount} high-priority issue${issueCount === 1 ? '' : 's'}.`;
};

export const getPathwaySummaryText = (node: BiologicalPathwayNode) =>
  node.summary?.trim() || getPathwayBuildSummary(node);

export const getLinkedPathwaySummaries = (
  experimentNode: ExperimentNode,
  nodes: FlowNode[],
) =>
  (experimentNode.linkedPathwayNodeIds ?? [])
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is BiologicalPathwayNode => Boolean(node && isPathwayNode(node)))
    .map((node) => ({
      id: node.id,
      title: node.title,
      summary: getPathwaySummaryText(node),
      extractionStatus: node.extractionStatus,
      unresolvedIssues:
        node.pathwayGraph?.unresolved_issues
          .slice(0, 3)
          .map((issue) => issue.description) ?? [],
    }));

export const getEntityNameById = (graph: PathwayGraph, entityId: string) =>
  graph.normalized_entities.find((entity) => entity.entity_id === entityId)?.canonical_name ??
  entityId;

export const getRelationEvidence = (
  graph: PathwayGraph,
  relation: AggregatedRelation,
): EvidenceItem[] => {
  const evidenceIds = new Set(relation.evidence_ids);
  return graph.evidence_items.filter((item) => evidenceIds.has(item.evidence_id));
};

const STRONG_SUPPORT_CLASSES = new Set<SupportClass>([
  'current_paper_direct',
  'current_paper_indirect',
]);

const relationMatchesFilters = (
  graph: PathwayGraph,
  relation: AggregatedRelation,
  filters: PathwayVisibilityFilters,
) => {
  if (relation.confidence < filters.minConfidence) {
    return false;
  }

  const evidence = getRelationEvidence(graph, relation);
  if (filters.modality !== 'all') {
    if (!evidence.some((item) => item.evidence_modality === filters.modality)) {
      return false;
    }
  }

  if (filters.strongEvidenceOnly) {
    if (!evidence.some((item) => STRONG_SUPPORT_CLASSES.has(item.support_class))) {
      return false;
    }
  }

  return true;
};

export const getVisiblePathwayRelations = (
  graph: PathwayGraph,
  filters: PathwayVisibilityFilters,
) => {
  const relations = [...graph.default_relations];
  if (filters.includeStructuralRelations) {
    relations.push(...graph.structural_relations);
  }
  if (filters.includeNondefaultRelations) {
    relations.push(...graph.nondefault_relations);
  }

  return relations.filter((relation) => relationMatchesFilters(graph, relation, filters));
};

export const getVisiblePathwayEntityIds = (
  graph: PathwayGraph,
  filters: PathwayVisibilityFilters,
  queryResponse: PathwayQueryResponse | null,
) => {
  const visibleRelations = getVisiblePathwayRelations(graph, filters);
  const entityIds = new Set<string>();

  for (const relation of visibleRelations) {
    entityIds.add(relation.source_entity_id);
    entityIds.add(relation.target_entity_id);
  }

  if (queryResponse?.subgraph_entity_ids.length) {
    return new Set(queryResponse.subgraph_entity_ids);
  }

  return entityIds;
};

export const computePathwayLayout = (
  graph: PathwayGraph,
  entityIds: Set<string>,
): Record<string, Point> => {
  const entities = graph.normalized_entities.filter((entity) => entityIds.has(entity.entity_id));
  if (entities.length === 0) {
    return {};
  }

  const radius = Math.max(140, entities.length * 20);
  const centerX = 280;
  const centerY = 220;

  return Object.fromEntries(
    entities.map((entity, index) => {
      const angle = (Math.PI * 2 * index) / entities.length - Math.PI / 2;
      return [
        entity.entity_id,
        {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        },
      ];
    }),
  );
};

export const getRelationStyleClass = (
  graph: PathwayGraph,
  relationId: string,
) => {
  if (graph.structural_relations.some((relation) => relation.relation_id === relationId)) {
    return 'pathway-panel__edge pathway-panel__edge--structural';
  }

  if (graph.nondefault_relations.some((relation) => relation.relation_id === relationId)) {
    return 'pathway-panel__edge pathway-panel__edge--nondefault';
  }

  return 'pathway-panel__edge pathway-panel__edge--default';
};

export const getPathwayRelationInteractionClass = (relationType: RelationType) => {
  switch (relationType) {
    case 'activates':
    case 'increases':
      return 'pathway-panel__edge--positive';
    case 'inhibits':
    case 'decreases':
      return 'pathway-panel__edge--negative';
    case 'phosphorylates':
    case 'dephosphorylates':
      return 'pathway-panel__edge--modification';
    case 'binds':
    case 'associated_with':
      return 'pathway-panel__edge--association';
    case 'component_of':
    case 'has_component':
    case 'modified_form_of':
    case 'active_state_of':
    case 'inactive_state_of':
    case 'same_as_candidate':
      return 'pathway-panel__edge--structural-interaction';
    default:
      return 'pathway-panel__edge--context';
  }
};

export const getPathwayRelationMarkerId = (relationType: RelationType) => {
  switch (relationType) {
    case 'inhibits':
    case 'decreases':
      return 'url(#pathway-edge-bar-red)';
    case 'activates':
    case 'increases':
      return 'url(#pathway-edge-arrow-green)';
    case 'phosphorylates':
    case 'dephosphorylates':
      return 'url(#pathway-edge-arrow-blue)';
    case 'binds':
    case 'associated_with':
      return 'url(#pathway-edge-arrow-gray)';
    case 'component_of':
    case 'has_component':
    case 'modified_form_of':
    case 'active_state_of':
    case 'inactive_state_of':
    case 'same_as_candidate':
      return 'url(#pathway-edge-diamond-slate)';
    default:
      return 'url(#pathway-edge-arrow-dark)';
  }
};

export const getPathwayRelationTypeLabel = (relationType: RelationType) =>
  relationType.replace(/_/g, ' ');

export const PATHWAY_INTERACTION_LEGEND: PathwayInteractionLegendItem[] = [
  {
    key: 'positive',
    label: 'Activates / increases',
    detail: 'Arrow head',
    className: 'pathway-panel__edge--positive',
    markerId: 'pathway-edge-arrow-green',
  },
  {
    key: 'negative',
    label: 'Inhibits / decreases',
    detail: 'Flat bar',
    className: 'pathway-panel__edge--negative',
    markerId: 'pathway-edge-bar-red',
  },
  {
    key: 'modification',
    label: 'Phosphorylation state',
    detail: 'Blue arrow',
    className: 'pathway-panel__edge--modification',
    markerId: 'pathway-edge-arrow-blue',
  },
  {
    key: 'association',
    label: 'Binding / association',
    detail: 'Dashed arrow',
    className: 'pathway-panel__edge--association',
    markerId: 'pathway-edge-arrow-gray',
  },
  {
    key: 'structural',
    label: 'Component / state relation',
    detail: 'Diamond head',
    className: 'pathway-panel__edge--structural-interaction',
    markerId: 'pathway-edge-diamond-slate',
  },
  {
    key: 'context',
    label: 'Context / ordering',
    detail: 'Dashed arrow',
    className: 'pathway-panel__edge--context',
    markerId: 'pathway-edge-arrow-dark',
  },
];

export const getRelationById = (graph: PathwayGraph, relationId: string) =>
  [
    ...graph.default_relations,
    ...graph.structural_relations,
    ...graph.nondefault_relations,
  ].find((relation) => relation.relation_id === relationId) ?? null;

export const getSanityNoteSummary = (sanityReport: PathwaySanityReport | null | undefined) => {
  if (!sanityReport) {
    return 'No sanity audit available.';
  }

  return `${sanityReport.summary.overall_graph_quality.replace(/_/g, ' ')}; ${
    sanityReport.summary.high_priority_issue_count
  } high-priority issue${sanityReport.summary.high_priority_issue_count === 1 ? '' : 's'}.`;
};
