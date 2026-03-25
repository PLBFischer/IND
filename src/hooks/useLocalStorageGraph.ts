import { useEffect, useState } from 'react';
import type { FlowEdge, FlowNode, Personnel } from '../types/graph';
import { CANVAS_HEIGHT, CANVAS_WIDTH, NODE_MIN_HEIGHT, NODE_WIDTH, STORAGE_KEY } from '../utils/constants';

export type GraphState = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  personnel: Personnel[];
  budgetUsd: number | null;
};

const defaultState: GraphState = {
  nodes: [
    {
      id: 'node_orders',
      title: 'Orders',
      content: 'Description: Joins customer orders',
      results: '',
      cost: 2400,
      duration: 6,
      workHoursPerWeek: 16,
      parallelizationMultiplier: 1,
      operators: ['Avery Chen'],
      completed: false,
      x: 180,
      y: 160,
    },
    {
      id: 'node_enrichment',
      title: 'Enrichment',
      content: 'Description: Normalizes customer attributes',
      results: '',
      cost: 1800,
      duration: 4,
      workHoursPerWeek: 20,
      parallelizationMultiplier: 1,
      operators: ['Morgan Patel', 'Sam Rivera'],
      completed: false,
      x: 540,
      y: 320,
    },
  ],
  edges: [
    {
      id: 'edge_orders_enrichment',
      source: 'node_orders',
      target: 'node_enrichment',
      parallelized: false,
    },
  ],
  personnel: [
    { name: 'Avery Chen', hoursPerWeek: 40 },
    { name: 'Morgan Patel', hoursPerWeek: 40 },
    { name: 'Sam Rivera', hoursPerWeek: 40 },
  ],
  budgetUsd: null,
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeNode = (node: unknown): FlowNode | null => {
  if (!isObject(node) || typeof node.id !== 'string' || typeof node.title !== 'string') {
    return null;
  }

  return {
    id: node.id,
    title: node.title,
    content: typeof node.content === 'string' ? node.content : '',
    results: typeof node.results === 'string' ? node.results : '',
    cost: typeof node.cost === 'number' ? node.cost : 0,
    duration: typeof node.duration === 'number' ? node.duration : 0,
    workHoursPerWeek: typeof node.workHoursPerWeek === 'number' ? node.workHoursPerWeek : 40,
    parallelizationMultiplier:
      node.parallelizationMultiplier === 2 ||
      node.parallelizationMultiplier === 3 ||
      node.parallelizationMultiplier === 4
        ? node.parallelizationMultiplier
        : 1,
    operators: Array.isArray(node.operators)
      ? node.operators.filter((operator): operator is string => typeof operator === "string")
      : [],
    completed: typeof node.completed === 'boolean' ? node.completed : false,
    x: typeof node.x === 'number' ? node.x : 120,
    y: typeof node.y === 'number' ? node.y : 120,
  };
};

const normalizeEdge = (edge: unknown): FlowEdge | null => {
  if (
    !isObject(edge) ||
    typeof edge.id !== 'string' ||
    typeof edge.source !== 'string' ||
    typeof edge.target !== 'string'
  ) {
    return null;
  }

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    parallelized: typeof edge.parallelized === 'boolean' ? edge.parallelized : false,
  };
};

const normalizePersonnel = (personnel: unknown): Personnel[] => {
  if (!Array.isArray(personnel)) {
    return defaultState.personnel;
  }

  return personnel.flatMap((person) => {
    if (typeof person === 'string') {
      return [{ name: person, hoursPerWeek: 40 }];
    }

    if (isObject(person) && typeof person.name === 'string') {
      return [
        {
          name: person.name,
          hoursPerWeek: typeof person.hoursPerWeek === 'number' ? person.hoursPerWeek : 40,
        },
      ];
    }

    return [];
  });
};

export const normalizeGraphState = (value: unknown): GraphState | null => {
  if (!isObject(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return null;
  }

  const nodes = value.nodes
    .map((node) => normalizeNode(node))
    .filter((node): node is FlowNode => node !== null);
  const edges = value.edges
    .map((edge) => normalizeEdge(edge))
    .filter((edge): edge is FlowEdge => edge !== null);

  return {
    nodes,
    edges,
    personnel: normalizePersonnel(value.personnel),
    budgetUsd: typeof value.budgetUsd === 'number' ? value.budgetUsd : null,
  };
};

export const autoLayoutGraphState = (state: GraphState): GraphState => {
  if (state.nodes.length === 0) {
    return state;
  }

  const nodeIds = new Set(state.nodes.map((node) => node.id));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of state.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of state.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }

    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const orderedNodes = [...state.nodes].sort((a, b) => a.title.localeCompare(b.title));
  const queue = orderedNodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const depth = new Map<string, number>();
  for (const node of orderedNodes) {
    depth.set(node.id, 0);
  }

  const topo: string[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    topo.push(currentId);
    const currentDepth = depth.get(currentId) ?? 0;
    for (const nextId of outgoing.get(currentId) ?? []) {
      depth.set(nextId, Math.max(depth.get(nextId) ?? 0, currentDepth + 1));
      indegree.set(nextId, (indegree.get(nextId) ?? 0) - 1);
      if ((indegree.get(nextId) ?? 0) === 0) {
        queue.push(nextId);
      }
    }
  }

  for (const node of orderedNodes) {
    if (!topo.includes(node.id)) {
      topo.push(node.id);
    }
  }

  const layerMap = new Map<number, FlowNode[]>();
  const nodeMap = new Map(state.nodes.map((node) => [node.id, node]));

  for (const nodeId of topo) {
    const node = nodeMap.get(nodeId);
    if (!node) {
      continue;
    }

    const layer = depth.get(nodeId) ?? 0;
    const existing = layerMap.get(layer) ?? [];
    existing.push(node);
    layerMap.set(layer, existing);
  }

  for (const [layer, nodes] of layerMap.entries()) {
    layerMap.set(
      layer,
      [...nodes].sort((left, right) => {
        const leftParents = incoming.get(left.id) ?? [];
        const rightParents = incoming.get(right.id) ?? [];
        const leftParentDepth = leftParents.reduce((sum, parentId) => sum + (depth.get(parentId) ?? 0), 0);
        const rightParentDepth = rightParents.reduce((sum, parentId) => sum + (depth.get(parentId) ?? 0), 0);
        if (leftParentDepth !== rightParentDepth) {
          return leftParentDepth - rightParentDepth;
        }

        if (left.completed !== right.completed) {
          return left.completed ? -1 : 1;
        }

        return left.title.localeCompare(right.title);
      }),
    );
  }

  const layers = [...layerMap.keys()].sort((a, b) => a - b);
  const maxLayerSize = Math.max(...layers.map((layer) => layerMap.get(layer)?.length ?? 0));
  const horizontalPadding = 120;
  const verticalPadding = 90;
  const minXStep = NODE_WIDTH + 220;
  const minYStep = NODE_MIN_HEIGHT + 140;
  const requiredWidth =
    horizontalPadding * 2 + NODE_WIDTH + Math.max(0, layers.length - 1) * minXStep;
  const requiredHeight =
    verticalPadding * 2 + NODE_MIN_HEIGHT + Math.max(0, maxLayerSize - 1) * minYStep;
  const effectiveWidth = Math.max(CANVAS_WIDTH, requiredWidth);
  const effectiveHeight = Math.max(CANVAS_HEIGHT, requiredHeight);
  const usableWidth = effectiveWidth - horizontalPadding * 2 - NODE_WIDTH;
  const usableHeight = effectiveHeight - verticalPadding * 2 - NODE_MIN_HEIGHT;
  const xStep = layers.length > 1 ? usableWidth / (layers.length - 1) : 0;
  const baseYStep = maxLayerSize > 1 ? usableHeight / (maxLayerSize - 1) : 0;
  const yStep = Math.max(minYStep, baseYStep);

  const positionedNodes = state.nodes.map((node) => {
    const layer = depth.get(node.id) ?? 0;
    const nodesInLayer = layerMap.get(layer) ?? [];
    const indexInLayer = nodesInLayer.findIndex((entry) => entry.id === node.id);
    const layerHeight = indexInLayer >= 0 ? (nodesInLayer.length - 1) * yStep : 0;
    const startY = Math.max(
      verticalPadding,
      (effectiveHeight - NODE_MIN_HEIGHT - layerHeight) / 2,
    );

    return {
      ...node,
      x: Math.round(horizontalPadding + layer * xStep),
      y: Math.round(startY + Math.max(0, indexInLayer) * yStep),
    };
  });

  return {
    ...state,
    nodes: positionedNodes,
  };
};

const readState = (): GraphState => {
  if (typeof window === 'undefined') {
    return defaultState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeGraphState(parsed) ?? defaultState;
  } catch {
    return defaultState;
  }
};

export const useLocalStorageGraph = () => {
  const [state, setState] = useState<GraphState>(readState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return {
    nodes: state.nodes,
    edges: state.edges,
    personnel: state.personnel,
    budgetUsd: state.budgetUsd,
    setNodes: (updater: FlowNode[] | ((current: FlowNode[]) => FlowNode[])) => {
      setState((current) => ({
        ...current,
        nodes: typeof updater === 'function' ? updater(current.nodes) : updater,
      }));
    },
    setEdges: (updater: FlowEdge[] | ((current: FlowEdge[]) => FlowEdge[])) => {
      setState((current) => ({
        ...current,
        edges: typeof updater === 'function' ? updater(current.edges) : updater,
      }));
    },
    setPersonnel: (
      updater: Personnel[] | ((current: Personnel[]) => Personnel[]),
    ) => {
      setState((current) => ({
        ...current,
        personnel:
          typeof updater === 'function' ? updater(current.personnel) : updater,
      }));
    },
    setBudgetUsd: (
      updater: number | null | ((current: number | null) => number | null),
    ) => {
      setState((current) => ({
        ...current,
        budgetUsd:
          typeof updater === 'function' ? updater(current.budgetUsd) : updater,
      }));
    },
    setGraphState: (
      updater: GraphState | ((current: GraphState) => GraphState),
    ) => {
      setState((current) =>
        typeof updater === 'function' ? updater(current) : updater,
      );
    },
  };
};
