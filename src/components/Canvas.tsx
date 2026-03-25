import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type {
  FlowEdge,
  FlowNode as FlowNodeType,
  ScheduledNode,
} from '../types/graph';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_WIDTH,
} from '../utils/constants';
import { EdgeLayer } from './EdgeLayer';
import { FlowNode } from './FlowNode';

type CanvasProps = {
  nodes: FlowNodeType[];
  edges: FlowEdge[];
  scheduleByNodeId: Record<string, ScheduledNode>;
  warningByNodeId: Record<string, { level: 'warning' | 'critical'; label: string }>;
  selectedNodeId: string | null;
  highlightedNodeId: string | null;
  interactiveNodeIds: string[];
  activeNodeId: string | null;
  zoom: number;
  viewport: { x: number; y: number };
  canvasRef: RefObject<HTMLDivElement>;
  viewportRef: RefObject<HTMLDivElement>;
  onCanvasClick: () => void;
  onStagePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onNodeClick: (id: string) => void;
  onNodePointerDown: (
    id: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

export function Canvas({
  nodes,
  edges,
  scheduleByNodeId,
  warningByNodeId,
  selectedNodeId,
  highlightedNodeId,
  interactiveNodeIds,
  activeNodeId,
  zoom,
  viewport,
  canvasRef,
  viewportRef,
  onCanvasClick,
  onStagePointerDown,
  onNodeClick,
  onNodePointerDown,
}: CanvasProps) {
  const maxNodeX = nodes.reduce((max, node) => Math.max(max, node.x), 0);
  const maxNodeY = nodes.reduce((max, node) => Math.max(max, node.y), 0);
  const contentWidth = Math.max(CANVAS_WIDTH, maxNodeX + NODE_WIDTH + 1200);
  const contentHeight = Math.max(CANVAS_HEIGHT, maxNodeY + NODE_MIN_HEIGHT + 1200);

  return (
    <main className="canvas-shell">
      <div ref={viewportRef} className="canvas-scroll">
        <div
          className="canvas-stage"
          onPointerDown={onStagePointerDown}
        >
          <div
            ref={canvasRef}
            className="canvas"
            style={{
              width: contentWidth,
              height: contentHeight,
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${zoom})`,
              transformOrigin: 'top left',
            }}
            onClick={onCanvasClick}
          >
            <EdgeLayer nodes={nodes} edges={edges} />
            {nodes.length === 0 ? (
              <div className="canvas__empty">
                <p>No nodes yet</p>
                <span>Create a node to start building the flow.</span>
              </div>
            ) : null}
            {nodes.map((node) => (
              <FlowNode
                key={node.id}
                node={node}
                edges={edges}
                scheduleNode={scheduleByNodeId[node.id] ?? null}
                warningLevel={warningByNodeId[node.id]?.level ?? null}
                warningLabel={warningByNodeId[node.id]?.label ?? null}
                selected={selectedNodeId === node.id}
                highlighted={highlightedNodeId === node.id}
                connectable={interactiveNodeIds.includes(node.id)}
                connectingFrom={activeNodeId === node.id}
                onSelect={onNodeClick}
                onPointerDown={onNodePointerDown}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
