import type {
  BiologicalPathwayNode,
  ExperimentNode,
  FlowEdge,
  FlowNode,
  NodeStatus,
  NodeType,
} from '../types/graph';
import {
  BLOCKER_PRIORITY_LABELS,
  NODE_STATUS_LABELS,
  NODE_TYPE_LABELS,
} from '../types/graph';

const TERMINAL_STATUSES = new Set<NodeStatus>(['completed', 'failed', 'canceled']);

export const createId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export const isExperimentNode = (node: FlowNode): node is ExperimentNode =>
  node.nodeKind === 'experiment';

export const isPathwayNode = (node: FlowNode): node is BiologicalPathwayNode =>
  node.nodeKind === 'biological_pathway';

export const getNodeById = (nodes: FlowNode[], id: string | null) =>
  id ? nodes.find((node) => node.id === id) ?? null : null;

export const getExperimentNodes = (nodes: FlowNode[]) => nodes.filter(isExperimentNode);

export const getExperimentEdges = (nodes: FlowNode[], edges: FlowEdge[]) => {
  const experimentNodeIds = new Set(getExperimentNodes(nodes).map((node) => node.id));

  return edges.filter(
    (edge) => experimentNodeIds.has(edge.source) && experimentNodeIds.has(edge.target),
  );
};

export const edgeExists = (
  edges: FlowEdge[],
  source: string,
  target: string,
) => edges.some((edge) => edge.source === source && edge.target === target);

export const hasIncomingParallelizedEdge = (
  edges: FlowEdge[],
  target: string,
) => edges.some((edge) => edge.target === target && edge.parallelized);

export const getEffectiveParallelizationMultiplier = (
  node: ExperimentNode,
  edges: FlowEdge[],
) => (hasIncomingParallelizedEdge(edges, node.id) ? node.parallelizationMultiplier : 1);

export const getEffectiveNodeCost = (node: ExperimentNode, edges: FlowEdge[]) =>
  node.cost * getEffectiveParallelizationMultiplier(node, edges);

export const getEffectiveNodeWorkHoursPerWeek = (
  node: ExperimentNode,
  edges: FlowEdge[],
) => node.workHoursPerWeek * getEffectiveParallelizationMultiplier(node, edges);

export const isTerminalNodeStatus = (status: NodeStatus) =>
  TERMINAL_STATUSES.has(status);

export const isActiveNodeStatus = (status: NodeStatus) =>
  !isTerminalNodeStatus(status);

export const isCompletedNodeStatus = (status: NodeStatus) =>
  status === 'completed';

export const getNodeTypeLabel = (type: NodeType) => NODE_TYPE_LABELS[type];

export const getNodeStatusLabel = (status: NodeStatus) => NODE_STATUS_LABELS[status];

export const getBlockerPriorityLabel = (priority: ExperimentNode['blockerPriority']) =>
  BLOCKER_PRIORITY_LABELS[priority];

export const getNodeCardSummary = (node: FlowNode) => {
  if (isPathwayNode(node)) {
    return (
      node.summary?.trim() ||
      (node.focusTerms ?? []).slice(0, 3).join(', ') ||
      'Mechanistic evidence node.'
    );
  }

  return (
    node.objective.trim() ||
    node.procedureSummary.trim() ||
    node.decisionSupported.trim() ||
    node.results.trim() ||
    'No summary yet.'
  );
};
