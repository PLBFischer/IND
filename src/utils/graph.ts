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
