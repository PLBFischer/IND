import { useEffect, useState } from 'react';
import type { FlowEdge, FlowNode } from '../types/graph';
import { STORAGE_KEY } from '../utils/constants';

type GraphState = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

const defaultState: GraphState = {
  nodes: [
    {
      id: 'node_orders',
      title: 'Orders',
      content: 'Description: Joins customer orders',
      x: 180,
      y: 160,
    },
    {
      id: 'node_enrichment',
      title: 'Enrichment',
      content: 'Description: Normalizes customer attributes',
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
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return defaultState;
    }
    return parsed;
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
  };
};
