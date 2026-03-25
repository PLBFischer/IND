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
  WORKSPACE_MARGIN,
} from '../utils/constants';
import { EdgeLayer } from './EdgeLayer';
import { FlowNode } from './FlowNode';

type CanvasProps = {
  nodes: FlowNodeType[];
  edges: FlowEdge[];
  scheduleByNodeId: Record<string, ScheduledNode>;
  selectedNodeId: string | null;
  highlightedNodeId: string | null;
  interactiveNodeIds: string[];
  activeNodeId: string | null;
  zoom: number;
  canvasRef: RefObject<HTMLDivElement>;
  scrollRef: RefObject<HTMLDivElement>;
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
  selectedNodeId,
  highlightedNodeId,
  interactiveNodeIds,
  activeNodeId,
  zoom,
  canvasRef,
  scrollRef,
  onCanvasClick,
  onStagePointerDown,
  onNodeClick,
  onNodePointerDown,
}: CanvasProps) {
  const maxNodeX = nodes.reduce((max, node) => Math.max(max, node.x), 0);
  const maxNodeY = nodes.reduce((max, node) => Math.max(max, node.y), 0);
  const contentWidth = Math.max(
    CANVAS_WIDTH,
    maxNodeX + NODE_WIDTH + WORKSPACE_MARGIN,
  );
  const contentHeight = Math.max(
    CANVAS_HEIGHT,
    maxNodeY + NODE_MIN_HEIGHT + WORKSPACE_MARGIN,
  );
  const stageWidth = contentWidth + WORKSPACE_MARGIN;
  const stageHeight = contentHeight + WORKSPACE_MARGIN;

  return (
    <main className="canvas-shell">
      <div ref={scrollRef} className="canvas-scroll">
        <div
          className="canvas-stage"
          style={{ width: stageWidth * zoom, height: stageHeight * zoom }}
          onPointerDown={onStagePointerDown}
        >
          <div
            ref={canvasRef}
            className="canvas"
            style={{
              width: contentWidth,
              height: contentHeight,
              left: WORKSPACE_MARGIN,
              top: WORKSPACE_MARGIN,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
            onClick={onCanvasClick}
            onPointerDown={onStagePointerDown}
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
