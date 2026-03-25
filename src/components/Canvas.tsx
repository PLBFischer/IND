import type {
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from 'react';
import type {
  FlowEdge,
  FlowNode as FlowNodeType,
  ScheduledNode,
} from '../types/graph';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../utils/constants';
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
  onCanvasWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
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
  onCanvasWheel,
  onNodeClick,
  onNodePointerDown,
}: CanvasProps) {
  return (
    <main className="canvas-shell">
      <div ref={scrollRef} className="canvas-scroll" onWheel={onCanvasWheel}>
        <div
          className="canvas-stage"
          style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}
        >
        <div
          ref={canvasRef}
          className="canvas"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            transform: `scale(${zoom})`,
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
