import type { FlowEdge, FlowNode } from '../types/graph';

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
