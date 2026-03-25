import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { AcceleratePanel } from './components/AcceleratePanel';
import { Canvas } from './components/Canvas';
import { NodeEditor } from './components/NodeEditor';
import { Toolbar } from './components/Toolbar';
import { useLocalStorageGraph } from './hooks/useLocalStorageGraph';
import type {
  AccelerateResponse,
  AccelerationProposal,
  EditorMode,
  FlowNode,
  ScheduleResult,
} from './types/graph';
import {
  createId,
  edgeExists,
  getNodeById,
  hasIncomingParallelizedEdge,
} from './utils/graph';
import { formatMetric, getTotalCost } from './utils/metrics';
import { STORAGE_KEY } from './utils/constants';

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
type InteractionMode =
  | { type: 'connect'; nodeId: string }
  | { type: 'parallelize'; nodeId: string }
  | null;

function App() {
  const {
    nodes,
    edges,
    personnel,
    budgetUsd,
    setNodes,
    setEdges,
    setPersonnel,
    setBudgetUsd,
  } =
    useLocalStorageGraph();
  const [editorMode, setEditorMode] = useState<EditorMode>('closed');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(null);
  const [schedule, setSchedule] = useState<ScheduleResult | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isAssignedView, setIsAssignedView] = useState(false);
  const [isAccelerating, setIsAccelerating] = useState(false);
  const [accelerateProposal, setAccelerateProposal] = useState<AccelerationProposal | null>(
    null,
  );
  const [accelerateError, setAccelerateError] = useState<string | null>(null);
  const [accelerateStopReason, setAccelerateStopReason] = useState<string | null>(null);
  const [rejectedProposalIds, setRejectedProposalIds] = useState<string[]>([]);
  const [suppressedClickNodeId, setSuppressedClickNodeId] = useState<string | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scheduleRequestIdRef = useRef(0);
  const accelerateAbortRef = useRef<AbortController | null>(null);

  const selectedNode = getNodeById(nodes, selectedNodeId);
  const totalCost = formatMetric(getTotalCost(nodes, edges));
  const showParallelizationMultiplier = selectedNode
    ? hasIncomingParallelizedEdge(edges, selectedNode.id)
    : false;
  const schedulingInput = {
    personnel: personnel.map((person) => ({
      name: person.name,
      hoursPerWeek: person.hoursPerWeek,
    })),
    nodes: nodes.map((node) => ({
      id: node.id,
      title: node.title,
      content: node.content,
      cost: node.cost,
      duration: node.duration,
      workHoursPerWeek: node.workHoursPerWeek,
      parallelizationMultiplier: hasIncomingParallelizedEdge(edges, node.id)
        ? node.parallelizationMultiplier
        : 1,
      operators: node.operators,
      completed: node.completed,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      parallelized: edge.parallelized,
    })),
  };
  const canAccelerate = nodes.length > 0 && budgetUsd !== null;
  const schedulingSignature = JSON.stringify(schedulingInput);
  const plannedDuration = isAssignedView && schedule
    ? `${formatMetric(schedule.makespan)} weeks`
    : 'Not run';
  const scheduleByNodeId = Object.fromEntries(
    (isAssignedView ? schedule?.nodes ?? [] : []).map((node) => [node.nodeId, node]),
  );
  const interactiveNodeIds =
    interactionMode?.type === 'connect'
      ? nodes
          .filter((node) => node.id !== interactionMode.nodeId)
          .map((node) => node.id)
      : interactionMode?.type === 'parallelize'
        ? edges
            .filter((edge) => edge.target === interactionMode.nodeId)
            .map((edge) => edge.source)
        : [];

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

      if (interactionMode) {
        setInteractionMode(null);
        return;
      }

      if (editorMode !== 'closed') {
        setEditorMode('closed');
        setSelectedNodeId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [interactionMode, editorMode]);

  const openCreateEditor = () => {
    setInteractionMode(null);
    setSelectedNodeId(null);
    setEditorMode('create');
  };

  const closeEditor = () => {
    setInteractionMode(null);
    setEditorMode('closed');
    setSelectedNodeId(null);
  };

  const handleCanvasClick = () => {
    setSuppressedClickNodeId(null);
    setInteractionMode(null);
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

    if (interactionMode?.type === 'connect') {
      if (interactionMode.nodeId === id) {
        return;
      }

      if (!edgeExists(edges, interactionMode.nodeId, id)) {
        setEdges((current) => [
          ...current,
          {
            id: createId('edge'),
            source: interactionMode.nodeId,
            target: id,
            parallelized: false,
          },
        ]);
      }

      setSelectedNodeId(interactionMode.nodeId);
      setInteractionMode(null);
      setEditorMode('edit');
      return;
    }

    if (interactionMode?.type === 'parallelize') {
      const matchingEdge = edges.find(
        (edge) => edge.source === id && edge.target === interactionMode.nodeId,
      );

      if (!matchingEdge) {
        return;
      }

      setEdges((current) =>
        current.map((edge) =>
          edge.id === matchingEdge.id
            ? {
                ...edge,
                parallelized: !edge.parallelized,
              }
            : edge,
        ),
      );

      setSelectedNodeId(interactionMode.nodeId);
      setInteractionMode(null);
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
    workHoursPerWeek: number;
    parallelizationMultiplier: 1 | 2 | 3 | 4;
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

  const handleAddPerson = (name: string, hoursPerWeek: number) => {
    setPersonnel((current) => {
      if (current.some((person) => person.name.toLowerCase() === name.toLowerCase())) {
        return current;
      }

      return [...current, { name, hoursPerWeek }];
    });
  };

  const handleUpdatePersonHours = (name: string, hoursPerWeek: number) => {
    setPersonnel((current) =>
      current.map((person) =>
        person.name === name
          ? {
              ...person,
              hoursPerWeek,
            }
          : person,
      ),
    );
  };

  const handleRemovePerson = (name: string) => {
    setPersonnel((current) => current.filter((person) => person.name !== name));
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
    setInteractionMode(null);
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

  const requestAccelerationProposal = async (
    nextRejectedProposalIds: string[],
    nextNodes = nodes,
    nextEdges = edges,
  ) => {
    if (budgetUsd === null) {
      setAccelerateError('Set a budget before running Accelerate.');
      setAccelerateProposal(null);
      setAccelerateStopReason(null);
      return;
    }

    accelerateAbortRef.current?.abort();
    const controller = new AbortController();
    accelerateAbortRef.current = controller;
    setIsAccelerating(true);
    setAccelerateError(null);
    setAccelerateStopReason(null);
    setAccelerateProposal(null);
    setIsAssignedView(true);

    try {
      const response = await fetch(`${SCHEDULER_API_BASE}/accelerate/propose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          budgetUsd,
          rejectedCandidateIds: nextRejectedProposalIds,
          personnel: personnel.map((person) => ({
            name: person.name,
            hoursPerWeek: person.hoursPerWeek,
          })),
          nodes: nextNodes.map((node) => ({
            id: node.id,
            title: node.title,
            content: node.content,
            cost: node.cost,
            duration: node.duration,
            workHoursPerWeek: node.workHoursPerWeek,
            parallelizationMultiplier: hasIncomingParallelizedEdge(nextEdges, node.id)
              ? node.parallelizationMultiplier
              : 1,
            operators: node.operators,
            completed: node.completed,
          })),
          edges: nextEdges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            parallelized: edge.parallelized,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(payload?.detail ?? 'Accelerate could not produce a proposal.');
      }

      const payload = (await response.json()) as AccelerateResponse;
      setAccelerateProposal(payload.proposal);
      setAccelerateStopReason(payload.stopReason);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setAccelerateProposal(null);
      setAccelerateStopReason(null);
      setAccelerateError(
        error instanceof Error ? error.message : 'Accelerate could not produce a proposal.',
      );
    } finally {
      if (accelerateAbortRef.current === controller) {
        accelerateAbortRef.current = null;
      }
      setIsAccelerating(false);
    }
  };

  const handleAccelerate = () => {
    if (isAccelerating || accelerateProposal || accelerateError || accelerateStopReason) {
      accelerateAbortRef.current?.abort();
      accelerateAbortRef.current = null;
      setIsAccelerating(false);
      setAccelerateProposal(null);
      setAccelerateError(null);
      setAccelerateStopReason(null);
      setRejectedProposalIds([]);
      return;
    }

    setRejectedProposalIds([]);
    void requestAccelerationProposal([]);
  };

  const handleAcceptAcceleration = () => {
    if (!accelerateProposal) {
      return;
    }

    const nextEdges = edges.map((edge) =>
      edge.id === accelerateProposal.candidateId
        ? {
            ...edge,
            parallelized: true,
          }
        : edge,
    );
    const nextNodes = nodes.map((node) =>
      node.id === accelerateProposal.targetNodeId
        ? {
            ...node,
            parallelizationMultiplier: 1 as const,
          }
        : node,
    );

    setEdges(nextEdges);
    setNodes(nextNodes);
    setRejectedProposalIds([]);
    void requestAccelerationProposal([], nextNodes, nextEdges);
  };

  const handleRejectAcceleration = () => {
    if (!accelerateProposal) {
      return;
    }

    const nextRejectedProposalIds = [...rejectedProposalIds, accelerateProposal.candidateId];
    setRejectedProposalIds(nextRejectedProposalIds);
    void requestAccelerationProposal(nextRejectedProposalIds);
  };

  const handleBudgetChange = (value: string) => {
    if (!value.trim()) {
      setBudgetUsd(null);
      return;
    }

    const nextBudgetUsd = Number(value);
    if (!Number.isFinite(nextBudgetUsd)) {
      return;
    }

    setBudgetUsd(nextBudgetUsd);
  };

  const handleExport = () => {
    const payload = {
      storageKey: STORAGE_KEY,
      exportedAt: new Date().toISOString(),
      graph: {
        nodes,
        edges,
        personnel,
        budgetUsd,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `pipeline-graph-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleNodePointerDown = (
    id: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (interactionMode) {
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
        budgetUsd={budgetUsd}
        plannedCost={`$${totalCost}`}
        plannedDuration={plannedDuration}
        personnel={personnel}
        isAssigning={isAssigning}
        canAssign={nodes.length > 0}
        isAssignedView={isAssignedView}
        isAccelerating={isAccelerating || Boolean(accelerateProposal || accelerateError || accelerateStopReason)}
        canAccelerate={canAccelerate}
        onAddPerson={handleAddPerson}
        onUpdatePersonHours={handleUpdatePersonHours}
        onRemovePerson={handleRemovePerson}
        onBudgetChange={handleBudgetChange}
        onAssign={handleAssign}
        onAccelerate={handleAccelerate}
        onExport={handleExport}
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
          interactiveNodeIds={interactiveNodeIds}
          activeNodeId={interactionMode?.nodeId ?? null}
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
          showParallelizationMultiplier={showParallelizationMultiplier}
          isConnectMode={interactionMode?.type === 'connect'}
          isParallelizeMode={interactionMode?.type === 'parallelize'}
          onClose={closeEditor}
          onSave={handleSaveNode}
          onDelete={handleDeleteNode}
          onStartConnect={() => {
            if (selectedNodeId) {
              setInteractionMode({ type: 'connect', nodeId: selectedNodeId });
            }
          }}
          onStartParallelize={() => {
            if (selectedNodeId) {
              setInteractionMode({ type: 'parallelize', nodeId: selectedNodeId });
            }
          }}
          onCancelConnect={() => setInteractionMode(null)}
        />
        <AcceleratePanel
          proposal={accelerateProposal}
          isLoading={isAccelerating}
          error={accelerateError}
          stopReason={accelerateStopReason}
          onAccept={handleAcceptAcceleration}
          onReject={handleRejectAcceleration}
          onStop={handleAccelerate}
        />
      </div>
    </div>
  );
}

export default App;
