import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Canvas } from './components/Canvas';
import { NodeEditor } from './components/NodeEditor';
import { Toolbar } from './components/Toolbar';
import { useLocalStorageGraph } from './hooks/useLocalStorageGraph';
import type { EditorMode, FlowNode } from './types/graph';
import { createId, edgeExists, getNodeById } from './utils/graph';

type DragState = {
  nodeId: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  scrollLeft: number;
  scrollTop: number;
  canvasLeft: number;
  canvasTop: number;
};

const INITIAL_NODE_POSITION = {
  x: 120,
  y: 120,
};

function App() {
  const { nodes, edges, setNodes, setEdges } = useLocalStorageGraph();
  const [editorMode, setEditorMode] = useState<EditorMode>('closed');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const selectedNode = getNodeById(nodes, selectedNodeId);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      setNodes((current) =>
        current.map((node) =>
          node.id === dragState.nodeId
            ? {
                ...node,
                x: Math.max(
                  24,
                  event.clientX -
                    dragState.canvasLeft +
                    dragState.scrollLeft -
                    dragState.offsetX,
                ),
                y: Math.max(
                  24,
                  event.clientY -
                    dragState.canvasTop +
                    dragState.scrollTop -
                    dragState.offsetY,
                ),
              }
            : node,
        ),
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId === event.pointerId) {
        dragStateRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [setNodes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (connectSourceId) {
        setConnectSourceId(null);
        return;
      }

      if (editorMode !== 'closed') {
        setEditorMode('closed');
        setSelectedNodeId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectSourceId, editorMode]);

  const openCreateEditor = () => {
    setConnectSourceId(null);
    setSelectedNodeId(null);
    setEditorMode('create');
  };

  const closeEditor = () => {
    setConnectSourceId(null);
    setEditorMode('closed');
    setSelectedNodeId(null);
  };

  const handleCanvasClick = () => {
    setConnectSourceId(null);
    setSelectedNodeId(null);
    setEditorMode('closed');
  };

  const handleNodeClick = (id: string) => {
    if (connectSourceId) {
      if (connectSourceId === id) {
        return;
      }

      if (!edgeExists(edges, connectSourceId, id)) {
        setEdges((current) => [
          ...current,
          {
            id: createId('edge'),
            source: connectSourceId,
            target: id,
          },
        ]);
      }

      setSelectedNodeId(connectSourceId);
      setConnectSourceId(null);
      setEditorMode('edit');
      return;
    }

    setSelectedNodeId(id);
    setEditorMode('edit');
  };

  const handleSaveNode = (values: { title: string; content: string }) => {
    if (editorMode === 'create') {
      const createdNode: FlowNode = {
        id: createId('node'),
        x: INITIAL_NODE_POSITION.x + nodes.length * 28,
        y: INITIAL_NODE_POSITION.y + nodes.length * 28,
        ...values,
      };

      setNodes((current) => [...current, createdNode]);
      setSelectedNodeId(createdNode.id);
      setEditorMode('edit');
      return;
    }

    if (editorMode === 'edit' && selectedNodeId) {
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                ...values,
              }
            : node,
        ),
      );
    }
  };

  const handleDeleteNode = () => {
    if (!selectedNodeId) {
      return;
    }

    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
    setEdges((current) =>
      current.filter(
        (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
      ),
    );
    setConnectSourceId(null);
    setSelectedNodeId(null);
    setEditorMode('closed');
  };

  const handleNodePointerDown = (
    id: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (connectSourceId) {
      return;
    }

    const node = getNodeById(nodes, id);
    const canvasElement = canvasRef.current;
    const scrollElement = scrollRef.current;
    if (!node || !canvasElement || !scrollElement) {
      return;
    }

    const canvasBounds = canvasElement.getBoundingClientRect();

    dragStateRef.current = {
      nodeId: id,
      pointerId: event.pointerId,
      offsetX: event.clientX - canvasBounds.left + scrollElement.scrollLeft - node.x,
      offsetY: event.clientY - canvasBounds.top + scrollElement.scrollTop - node.y,
      scrollLeft: scrollElement.scrollLeft,
      scrollTop: scrollElement.scrollTop,
      canvasLeft: canvasBounds.left,
      canvasTop: canvasBounds.top,
    };
  };

  return (
    <div className="app-shell">
      <Toolbar onAddNode={openCreateEditor} />
      <div className="workspace">
        <Canvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          connectSourceId={connectSourceId}
          canvasRef={canvasRef}
          scrollRef={scrollRef}
          onCanvasClick={handleCanvasClick}
          onNodeClick={handleNodeClick}
          onNodePointerDown={handleNodePointerDown}
        />
        <NodeEditor
          mode={editorMode}
          node={selectedNode}
          isConnectMode={Boolean(connectSourceId)}
          onClose={closeEditor}
          onSave={handleSaveNode}
          onDelete={handleDeleteNode}
          onStartConnect={() => {
            if (selectedNodeId) {
              setConnectSourceId(selectedNodeId);
            }
          }}
          onCancelConnect={() => setConnectSourceId(null)}
        />
      </div>
    </div>
  );
}

export default App;
