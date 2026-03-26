import type {
  BiologicalPathwayNode,
  ExperimentNode,
  FlowNode,
} from '../types/graph';
import type {
  AggregatedRelation,
  EvidenceItem,
  EntityType,
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
  edgeLabel?: string;
};

export type PathwayEntityStyle = {
  shape: 'circle' | 'rect' | 'pill' | 'hexagon';
  width: number;
  height: number;
  fill: string;
  stroke: string;
  radius?: number;
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

export const getBestRelationEvidence = (
  graph: PathwayGraph,
  relation: AggregatedRelation,
) =>
  [...getRelationEvidence(graph, relation)].sort((left, right) => {
    const leftScore =
      (left.is_from_current_paper ? 100 : 0) +
      (left.is_primary_result ? 10 : 0) +
      left.confidence;
    const rightScore =
      (right.is_from_current_paper ? 100 : 0) +
      (right.is_primary_result ? 10 : 0) +
      right.confidence;
    return rightScore - leftScore;
  })[0] ?? null;

export const formatPathwayEvidenceModality = (value: string) => value.replace(/_/g, ' ');

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

export const getPathwayEntityStyle = (entityType: EntityType): PathwayEntityStyle => {
  switch (entityType) {
    case 'protein':
      return {
        shape: 'pill',
        width: 112,
        height: 40,
        fill: '#dbeafe',
        stroke: '#2563eb',
        radius: 16,
      };
    case 'small_molecule':
      return {
        shape: 'circle',
        width: 54,
        height: 54,
        fill: '#dcfce7',
        stroke: '#16a34a',
      };
    case 'gene':
      return {
        shape: 'rect',
        width: 108,
        height: 38,
        fill: '#fef3c7',
        stroke: '#ca8a04',
      };
    case 'cell_state':
      return {
        shape: 'rect',
        width: 148,
        height: 64,
        fill: '#e5e7eb',
        stroke: '#6b7280',
        radius: 12,
      };
    case 'phenotype':
      return {
        shape: 'hexagon',
        width: 126,
        height: 46,
        fill: '#fed7aa',
        stroke: '#ea580c',
      };
    default:
      return {
        shape: 'pill',
        width: 112,
        height: 40,
        fill: '#dbeafe',
        stroke: '#2563eb',
        radius: 16,
      };
  }
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
      return 'pathway-panel__edge--activates';
    case 'inhibits':
      return 'pathway-panel__edge--inhibits';
    case 'phosphorylates':
      return 'pathway-panel__edge--phosphorylates';
    case 'binds':
      return 'pathway-panel__edge--binds';
    case 'catalyzes':
      return 'pathway-panel__edge--catalyzes';
    case 'regulates_expression':
      return 'pathway-panel__edge--regulates-expression';
    case 'modulates':
      return 'pathway-panel__edge--modulates';
    default:
      return 'pathway-panel__edge--activates';
  }
};

export const getPathwayRelationMarkerId = (relationType: RelationType) => {
  switch (relationType) {
    case 'inhibits':
      return 'url(#pathway-edge-bar)';
    case 'activates':
    case 'phosphorylates':
    case 'catalyzes':
    case 'regulates_expression':
    case 'modulates':
      return 'url(#pathway-edge-arrow)';
    case 'binds':
      return undefined;
    default:
      return 'url(#pathway-edge-arrow)';
  }
};

export const getPathwayRelationTypeLabel = (relationType: RelationType) =>
  relationType.replace(/_/g, ' ');

export const getPathwayRelationEdgeLabel = (relationType: RelationType) => {
  switch (relationType) {
    case 'phosphorylates':
      return 'P';
    case 'catalyzes':
      return 'cat';
    case 'regulates_expression':
      return 'expr';
    default:
      return null;
  }
};

export const PATHWAY_INTERACTION_LEGEND: PathwayInteractionLegendItem[] = [
  {
    key: 'activates',
    label: 'Activates',
    detail: 'Solid line with arrowhead',
    className: 'pathway-panel__edge--activates',
    markerId: 'pathway-edge-arrow',
  },
  {
    key: 'inhibits',
    label: 'Inhibits',
    detail: 'Solid line with flat bar',
    className: 'pathway-panel__edge--inhibits',
    markerId: 'pathway-edge-bar',
  },
  {
    key: 'phosphorylates',
    label: 'Phosphorylates',
    detail: 'Solid arrow with P label',
    className: 'pathway-panel__edge--phosphorylates',
    markerId: 'pathway-edge-arrow',
    edgeLabel: 'P',
  },
  {
    key: 'catalyzes',
    label: 'Catalyzes',
    detail: 'Solid arrow with cat label',
    className: 'pathway-panel__edge--catalyzes',
    markerId: 'pathway-edge-arrow',
    edgeLabel: 'cat',
  },
  {
    key: 'binds',
    label: 'Binds',
    detail: 'Undirected solid line',
    className: 'pathway-panel__edge--binds',
    markerId: '',
  },
  {
    key: 'regulates_expression',
    label: 'Regulates expression',
    detail: 'Dashed arrow with expr label',
    className: 'pathway-panel__edge--regulates-expression',
    markerId: 'pathway-edge-arrow',
    edgeLabel: 'expr',
  },
  {
    key: 'modulates',
    label: 'Modulates',
    detail: 'Dashed arrow for indirect influence',
    className: 'pathway-panel__edge--modulates',
    markerId: 'pathway-edge-arrow',
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
