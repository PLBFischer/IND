import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { FlowEdge, FlowNode as FlowNodeType } from '../types/graph';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../utils/constants';
import { EdgeLayer } from './EdgeLayer';
import { FlowNode } from './FlowNode';

type CanvasProps = {
  nodes: FlowNodeType[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  connectSourceId: string | null;
  canvasRef: RefObject<HTMLDivElement>;
  scrollRef: RefObject<HTMLDivElement>;
  onCanvasClick: () => void;
  onNodeClick: (id: string) => void;
  onNodePointerDown: (
    id: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

export function Canvas({
  nodes,
  edges,
  selectedNodeId,
  connectSourceId,
  canvasRef,
  scrollRef,
  onCanvasClick,
  onNodeClick,
  onNodePointerDown,
}: CanvasProps) {
  return (
    <main className="canvas-shell">
      <div ref={scrollRef} className="canvas-scroll">
        <div
          ref={canvasRef}
          className="canvas"
          style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
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
              selected={selectedNodeId === node.id}
              connectable={Boolean(connectSourceId && connectSourceId !== node.id)}
              connectingFrom={connectSourceId === node.id}
              onSelect={onNodeClick}
              onPointerDown={onNodePointerDown}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
