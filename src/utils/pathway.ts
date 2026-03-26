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

export const PATHWAY_LAYOUT_WIDTH = 760;
export const PATHWAY_LAYOUT_HEIGHT = 560;

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

const getPathwayHexagonPoints = (width: number, height: number): Point[] => {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const shoulder = Math.min(20, width * 0.18);
  return [
    { x: -halfWidth + shoulder, y: -halfHeight },
    { x: halfWidth - shoulder, y: -halfHeight },
    { x: halfWidth, y: 0 },
    { x: halfWidth - shoulder, y: halfHeight },
    { x: -halfWidth + shoulder, y: halfHeight },
    { x: -halfWidth, y: 0 },
  ];
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

  const visibleEntityIdSet = new Set(entities.map((entity) => entity.entity_id));
  const relations = [
    ...graph.default_relations,
    ...graph.structural_relations,
    ...graph.nondefault_relations,
  ].filter(
    (relation) =>
      visibleEntityIdSet.has(relation.source_entity_id) &&
      visibleEntityIdSet.has(relation.target_entity_id),
  );

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const entity of entities) {
    outgoing.set(entity.entity_id, []);
    incoming.set(entity.entity_id, []);
    indegree.set(entity.entity_id, 0);
  }

  for (const relation of relations) {
    outgoing.get(relation.source_entity_id)?.push(relation.target_entity_id);
    incoming.get(relation.target_entity_id)?.push(relation.source_entity_id);
    indegree.set(
      relation.target_entity_id,
      (indegree.get(relation.target_entity_id) ?? 0) + 1,
    );
  }

  const seedBase = `${graph.paper_metadata.title}|${entities.map((entity) => entity.entity_id).join('|')}`;
  const getSeededScore = (value: string) => {
    let hash = 2166136261;
    const input = `${seedBase}|${value}`;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const sortSeeded = (values: string[]) =>
    [...values].sort((left, right) => {
      const delta = getSeededScore(left) - getSeededScore(right);
      return delta !== 0 ? delta : left.localeCompare(right);
    });

  const queue = sortSeeded(
    entities
      .filter((entity) => (indegree.get(entity.entity_id) ?? 0) === 0)
      .map((entity) => entity.entity_id),
  );
  const ranks = new Map<string, number>();
  const visited = new Set<string>();

  while (queue.length > 0) {
    const entityId = queue.shift();
    if (!entityId || visited.has(entityId)) {
      continue;
    }

    visited.add(entityId);
    const parentRank = Math.max(
      -1,
      ...(incoming.get(entityId) ?? [])
        .filter((parentId) => ranks.has(parentId))
        .map((parentId) => ranks.get(parentId) ?? 0),
    );
    ranks.set(entityId, parentRank + 1);

    for (const childId of sortSeeded(outgoing.get(entityId) ?? [])) {
      indegree.set(childId, Math.max(0, (indegree.get(childId) ?? 0) - 1));
      if ((indegree.get(childId) ?? 0) === 0) {
        queue.push(childId);
      }
    }
  }

  for (const entityId of sortSeeded(entities.map((entity) => entity.entity_id))) {
    if (ranks.has(entityId)) {
      continue;
    }

    const parentRank = Math.max(
      -1,
      ...(incoming.get(entityId) ?? []).map((parentId) => ranks.get(parentId) ?? 0),
    );
    ranks.set(entityId, parentRank + 1);
  }

  const layers = new Map<number, string[]>();
  for (const entity of entities) {
    const rank = ranks.get(entity.entity_id) ?? 0;
    layers.set(rank, [...(layers.get(rank) ?? []), entity.entity_id]);
  }

  const positionedY = new Map<string, number>();
  const orderedLayers = [...layers.entries()].sort(([left], [right]) => left - right);
  const maxLayerSize = Math.max(...orderedLayers.map(([, ids]) => ids.length), 1);
  const topPadding = 56;
  const bottomPadding = 56;
  const leftPadding = 72;
  const rightPadding = 72;
  const usableHeight = PATHWAY_LAYOUT_HEIGHT - topPadding - bottomPadding;
  const usableWidth = PATHWAY_LAYOUT_WIDTH - leftPadding - rightPadding;

  for (const [rank, entityList] of orderedLayers) {
    const orderedEntityIds = [...entityList].sort((left, right) => {
      const leftParents = incoming.get(left) ?? [];
      const rightParents = incoming.get(right) ?? [];
      const leftBarycenter =
        leftParents.length > 0
          ? leftParents.reduce((sum, parentId) => sum + (positionedY.get(parentId) ?? usableHeight / 2), 0) /
            leftParents.length
          : usableHeight / 2;
      const rightBarycenter =
        rightParents.length > 0
          ? rightParents.reduce((sum, parentId) => sum + (positionedY.get(parentId) ?? usableHeight / 2), 0) /
            rightParents.length
          : usableHeight / 2;

      if (Math.abs(leftBarycenter - rightBarycenter) > 1) {
        return leftBarycenter - rightBarycenter;
      }

      return getSeededScore(left) - getSeededScore(right);
    });

    const verticalStep = usableHeight / Math.max(orderedEntityIds.length - 1, 1);
    orderedEntityIds.forEach((entityId, index) => {
      const y =
        orderedEntityIds.length === 1
          ? topPadding + usableHeight / 2
          : topPadding + index * verticalStep;
      positionedY.set(entityId, y);
    });

    layers.set(rank, orderedEntityIds);
  }

  const maxRank = Math.max(...orderedLayers.map(([rank]) => rank), 0);

  return Object.fromEntries(
    entities.map((entity) => {
      const rank = ranks.get(entity.entity_id) ?? 0;
      const x =
        maxRank === 0
          ? PATHWAY_LAYOUT_WIDTH / 2
          : leftPadding + (rank / maxRank) * usableWidth;
      return [
        entity.entity_id,
        {
          x,
          y: positionedY.get(entity.entity_id) ?? PATHWAY_LAYOUT_HEIGHT / 2,
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

export const getPathwayEntityBoundaryOffset = (
  style: PathwayEntityStyle,
  deltaX: number,
  deltaY: number,
) => {
  const length = Math.hypot(deltaX, deltaY);
  if (length <= 0.0001) {
    return 0;
  }

  const dirX = deltaX / length;
  const dirY = deltaY / length;
  const halfWidth = style.width / 2;
  const halfHeight = style.height / 2;

  if (style.shape === 'circle') {
    return halfWidth;
  }

  if (style.shape === 'rect' || style.shape === 'pill') {
    const scaleX = Math.abs(dirX) > 0.0001 ? halfWidth / Math.abs(dirX) : Number.POSITIVE_INFINITY;
    const scaleY = Math.abs(dirY) > 0.0001 ? halfHeight / Math.abs(dirY) : Number.POSITIVE_INFINITY;
    return Math.min(scaleX, scaleY);
  }

  if (style.shape === 'hexagon') {
    const points = getPathwayHexagonPoints(style.width, style.height);
    let closest = Number.POSITIVE_INFINITY;

    for (let index = 0; index < points.length; index += 1) {
      const first = points[index];
      const second = points[(index + 1) % points.length];
      const edgeX = second.x - first.x;
      const edgeY = second.y - first.y;
      const determinant = dirX * edgeY - dirY * edgeX;
      if (Math.abs(determinant) < 0.0001) {
        continue;
      }

      const t = (first.x * edgeY - first.y * edgeX) / determinant;
      const u = (first.x * dirY - first.y * dirX) / determinant;
      if (t >= 0 && u >= 0 && u <= 1) {
        closest = Math.min(closest, t);
      }
    }

    return Number.isFinite(closest) ? closest : Math.max(halfWidth, halfHeight);
  }

  return Math.max(halfWidth, halfHeight);
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
