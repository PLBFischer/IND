import type { FlowEdge, FlowNode } from '../types/graph';
import { getEffectiveNodeCost } from './graph';

export const formatMetric = (value: number) => {
  if (Number.isNaN(value)) {
    return 'NaN';
  }

  return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.?0+$/, '');
};

export const getTotalCost = (nodes: FlowNode[], edges: FlowEdge[]) =>
  nodes.reduce(
    (sum, node) => sum + (node.completed ? 0 : getEffectiveNodeCost(node, edges)),
    0,
  );

export const getTotalDuration = (nodes: FlowNode[], edges: FlowEdge[]) => {
  if (nodes.length === 0) {
    return 0;
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      continue;
    }

    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  const longestPath = new Map<string, number>();

  for (const node of nodes) {
    const weight = node.completed ? 0 : node.duration;
    longestPath.set(node.id, weight);

    if ((indegree.get(node.id) ?? 0) === 0) {
      queue.push(node.id);
    }
  }

  let visitedCount = 0;

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    visitedCount += 1;
    const currentDuration = longestPath.get(currentId) ?? 0;

    for (const targetId of adjacency.get(currentId) ?? []) {
      const targetNode = nodeMap.get(targetId);
      if (!targetNode) {
        continue;
      }

      const candidateDuration =
        currentDuration + (targetNode.completed ? 0 : targetNode.duration);

      if (candidateDuration > (longestPath.get(targetId) ?? 0)) {
        longestPath.set(targetId, candidateDuration);
      }

      const nextIndegree = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(targetId);
      }
    }
  }

  if (visitedCount !== nodes.length) {
    return Number.NaN;
  }

  return Math.max(...longestPath.values());
};
