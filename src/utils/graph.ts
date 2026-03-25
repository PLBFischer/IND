import type {
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

export const getNodeById = (nodes: FlowNode[], id: string | null) =>
  id ? nodes.find((node) => node.id === id) ?? null : null;

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
  node: FlowNode,
  edges: FlowEdge[],
) => (hasIncomingParallelizedEdge(edges, node.id) ? node.parallelizationMultiplier : 1);

export const getEffectiveNodeCost = (node: FlowNode, edges: FlowEdge[]) =>
  node.cost * getEffectiveParallelizationMultiplier(node, edges);

export const getEffectiveNodeWorkHoursPerWeek = (node: FlowNode, edges: FlowEdge[]) =>
  node.workHoursPerWeek * getEffectiveParallelizationMultiplier(node, edges);

export const isTerminalNodeStatus = (status: NodeStatus) =>
  TERMINAL_STATUSES.has(status);

export const isActiveNodeStatus = (status: NodeStatus) =>
  !isTerminalNodeStatus(status);

export const isCompletedNodeStatus = (status: NodeStatus) =>
  status === 'completed';

export const getNodeTypeLabel = (type: NodeType) => NODE_TYPE_LABELS[type];

export const getNodeStatusLabel = (status: NodeStatus) => NODE_STATUS_LABELS[status];

export const getBlockerPriorityLabel = (priority: FlowNode['blockerPriority']) =>
  BLOCKER_PRIORITY_LABELS[priority];

export const getNodeCardSummary = (node: FlowNode) =>
  node.objective.trim() ||
  node.procedureSummary.trim() ||
  node.decisionSupported.trim() ||
  node.results.trim() ||
  'No summary yet.';
