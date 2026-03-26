import type { FlowEdge, FlowNode } from '../types/graph';
import { getEffectiveNodeCost } from './graph';
import {
  countsTowardTotalCost,
  getExperimentEdges,
  getExperimentNodes,
  isActiveNodeStatus,
} from './graph';

export const formatMetric = (value: number) => {
  if (Number.isNaN(value)) {
    return 'NaN';
  }

  return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.?0+$/, '');
};

export const formatCurrencyMetric = (value: number) => {
  if (Number.isNaN(value)) {
    return 'NaN';
  }

  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(2));
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export const getTotalCost = (nodes: FlowNode[], edges: FlowEdge[]) =>
  getExperimentNodes(nodes).reduce(
    (sum, node) =>
      sum + (countsTowardTotalCost(node.status) ? getEffectiveNodeCost(node, edges) : 0),
    0,
  );

export const getTotalDuration = (nodes: FlowNode[], edges: FlowEdge[]) => {
  const experimentNodes = getExperimentNodes(nodes);
  const experimentEdges = getExperimentEdges(nodes, edges);

  if (experimentNodes.length === 0) {
    return 0;
  }

  const nodeMap = new Map(experimentNodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of experimentNodes) {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of experimentEdges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      continue;
    }

    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  const longestPath = new Map<string, number>();

  for (const node of experimentNodes) {
    const weight = isActiveNodeStatus(node.status) ? node.duration : 0;
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
        currentDuration + (isActiveNodeStatus(targetNode.status) ? targetNode.duration : 0);

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

  if (visitedCount !== experimentNodes.length) {
    return Number.NaN;
  }

  return Math.max(...longestPath.values());
};
