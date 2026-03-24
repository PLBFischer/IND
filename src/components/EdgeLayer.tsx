import type { FlowEdge, FlowNode } from '../types/graph';
import { NODE_HEADER_HEIGHT, NODE_MIN_HEIGHT, NODE_WIDTH } from '../utils/constants';

type EdgeLayerProps = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export function EdgeLayer({ nodes, edges }: EdgeLayerProps) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return (
    <svg className="edge-layer" aria-hidden="true">
      <defs>
        <marker
          id="edge-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="7"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3c3f45" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);

        if (!sourceNode || !targetNode) {
          return null;
        }

        const sourceX = sourceNode.x + NODE_WIDTH;
        const sourceY = sourceNode.y + Math.max(NODE_MIN_HEIGHT / 2, NODE_HEADER_HEIGHT + 24);
        const targetX = targetNode.x;
        const targetY = targetNode.y + Math.max(NODE_MIN_HEIGHT / 2, NODE_HEADER_HEIGHT + 24);
        const delta = Math.max(80, (targetX - sourceX) / 2);
        const path = `M ${sourceX} ${sourceY} C ${sourceX + delta} ${sourceY}, ${targetX - delta} ${targetY}, ${targetX} ${targetY}`;

        return (
          <path
            key={edge.id}
            d={path}
            className={`edge-layer__path${
              edge.parallelized ? ' edge-layer__path--parallelized' : ''
            }`}
            markerEnd="url(#edge-arrow)"
          />
        );
      })}
    </svg>
  );
}
