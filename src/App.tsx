import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Canvas } from './components/Canvas';
import { NodeEditor } from './components/NodeEditor';
import { Toolbar } from './components/Toolbar';
import { useLocalStorageGraph } from './hooks/useLocalStorageGraph';
import type { EditorMode, FlowNode, ScheduleResult } from './types/graph';
import { createId, edgeExists, getNodeById } from './utils/graph';
import { formatMetric, getTotalCost, getTotalDuration } from './utils/metrics';

type DragState = {
  nodeId: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  scrollLeft: number;
  scrollTop: number;
  canvasLeft: number;
  canvasTop: number;
  startClientX: number;
  startClientY: number;
  hasMoved: boolean;
};

const INITIAL_NODE_POSITION = {
  x: 120,
  y: 120,
};

const DRAG_THRESHOLD_PX = 6;
const SCHEDULER_API_BASE = import.meta.env.VITE_SCHEDULER_API_URL ?? '/api';

function App() {
  const { nodes, edges, personnel, setNodes, setEdges, setPersonnel } =
    useLocalStorageGraph();
  const [editorMode, setEditorMode] = useState<EditorMode>('closed');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleResult | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isAssignedView, setIsAssignedView] = useState(false);
  const [suppressedClickNodeId, setSuppressedClickNodeId] = useState<string | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scheduleRequestIdRef = useRef(0);

  const selectedNode = getNodeById(nodes, selectedNodeId);
  const totalCost = formatMetric(getTotalCost(nodes));
  const totalDuration = formatMetric(getTotalDuration(nodes, edges));
  const schedulingInput = {
    personnel,
    nodes: nodes.map((node) => ({
      id: node.id,
      title: node.title,
      duration: node.duration,
      operators: node.operators,
      completed: node.completed,
    })),
    edges,
  };
  const schedulingSignature = JSON.stringify(schedulingInput);
  const plannedDuration = isAssignedView && schedule
    ? `${formatMetric(schedule.makespan)} days`
    : 'Not run';
  const scheduleByNodeId = Object.fromEntries(
    (isAssignedView ? schedule?.nodes ?? [] : []).map((node) => [node.nodeId, node]),
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragState.startClientX;
      const deltaY = event.clientY - dragState.startClientY;
      if (!dragState.hasMoved) {
        dragState.hasMoved =
          Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX;
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
        if (dragStateRef.current.hasMoved) {
          setSuppressedClickNodeId(dragStateRef.current.nodeId);
        }
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
    setSuppressedClickNodeId(null);
    setConnectSourceId(null);
    setSelectedNodeId(null);
    setEditorMode('closed');
  };

  const handleNodeClick = (id: string) => {
    if (suppressedClickNodeId === id) {
      setSuppressedClickNodeId(null);
      return;
    }

    if (suppressedClickNodeId) {
      setSuppressedClickNodeId(null);
    }

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

  const handleSaveNode = (values: {
    title: string;
    content: string;
    cost: number;
    duration: number;
    operators: string[];
    completed: boolean;
  }) => {
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

  const handleAddPerson = (name: string) => {
    setPersonnel((current) => {
      if (current.some((person) => person.toLowerCase() === name.toLowerCase())) {
        return current;
      }

      return [...current, name];
    });
  };

  const handleRemovePerson = (name: string) => {
    setPersonnel((current) => current.filter((person) => person !== name));
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        operators: node.operators.filter((operator) => operator !== name),
      })),
    );
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

  const runSchedule = async () => {
    const requestId = scheduleRequestIdRef.current + 1;
    scheduleRequestIdRef.current = requestId;
    setIsAssigning(true);
    setScheduleError(null);

    try {
      const response = await fetch(`${SCHEDULER_API_BASE}/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(schedulingInput),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(payload?.detail ?? 'The scheduler could not produce a plan.');
      }

      const payload = (await response.json()) as ScheduleResult;
      if (scheduleRequestIdRef.current === requestId) {
        setSchedule(payload);
      }
    } catch (error) {
      if (scheduleRequestIdRef.current === requestId) {
        setSchedule(null);
        setScheduleError(
          error instanceof Error ? error.message : 'The scheduler could not produce a plan.',
        );
      }
    } finally {
      if (scheduleRequestIdRef.current === requestId) {
        setIsAssigning(false);
      }
    }
  };

  useEffect(() => {
    if (!isAssignedView) {
      return;
    }

    void runSchedule();
  }, [isAssignedView, schedulingSignature]);

  const handleAssign = () => {
    if (isAssignedView) {
      setIsAssignedView(false);
      setScheduleError(null);
      return;
    }

    setIsAssignedView(true);
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
      startClientX: event.clientX,
      startClientY: event.clientY,
      hasMoved: false,
    };
  };

  return (
    <div className="app-shell">
      <Toolbar
        plannedCost={`$${totalCost}`}
        plannedDuration={plannedDuration}
        personnel={personnel}
        isAssigning={isAssigning}
        canAssign={nodes.length > 0}
        isAssignedView={isAssignedView}
        onAddPerson={handleAddPerson}
        onRemovePerson={handleRemovePerson}
        onAssign={handleAssign}
        onAddNode={openCreateEditor}
      />
      {scheduleError || schedule?.diagnostics.length ? (
        <section className="schedule-banner" aria-label="Scheduling status">
          {scheduleError ? <p>{scheduleError}</p> : null}
          {schedule?.diagnostics.map((diagnostic) => (
            <p key={diagnostic}>{diagnostic}</p>
          ))}
        </section>
      ) : null}
      <div className="workspace">
        <Canvas
          nodes={nodes}
          edges={edges}
          scheduleByNodeId={scheduleByNodeId}
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
          personnel={personnel}
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
