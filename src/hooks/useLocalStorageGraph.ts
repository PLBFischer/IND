import { useEffect, useState } from 'react';
import type { FlowEdge, FlowNode } from '../types/graph';
import { STORAGE_KEY } from '../utils/constants';

type GraphState = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  personnel: string[];
};

const defaultState: GraphState = {
  nodes: [
    {
      id: 'node_orders',
      title: 'Orders',
      content: 'Description: Joins customer orders',
      cost: 2400,
      duration: 6,
      operators: ['Avery Chen'],
      completed: false,
      x: 180,
      y: 160,
    },
    {
      id: 'node_enrichment',
      title: 'Enrichment',
      content: 'Description: Normalizes customer attributes',
      cost: 1800,
      duration: 4,
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
    },
  ],
  personnel: ['Avery Chen', 'Morgan Patel', 'Sam Rivera'],
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
    const parsed = JSON.parse(raw) as GraphState;
    if (
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges) ||
      ('personnel' in parsed && !Array.isArray(parsed.personnel))
    ) {
      return defaultState;
    }
    return {
      nodes: parsed.nodes.map((node) => ({
        ...node,
        cost: typeof node.cost === 'number' ? node.cost : 0,
        duration: typeof node.duration === 'number' ? node.duration : 0,
        operators: Array.isArray(node.operators)
          ? node.operators.filter((operator): operator is string => typeof operator === 'string')
          : [],
        completed: typeof node.completed === 'boolean' ? node.completed : false,
      })),
      edges: parsed.edges,
      personnel: Array.isArray(parsed.personnel)
        ? parsed.personnel.filter((person): person is string => typeof person === 'string')
        : defaultState.personnel,
    };
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
    setPersonnel: (updater: string[] | ((current: string[]) => string[])) => {
      setState((current) => ({
        ...current,
        personnel:
          typeof updater === 'function' ? updater(current.personnel) : updater,
      }));
    },
  };
};
