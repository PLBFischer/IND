import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { AcceleratePanel } from './components/AcceleratePanel';
import { Canvas } from './components/Canvas';
import { DeepRiskPanel } from './components/DeepRiskPanel';
import { EvidencePanel } from './components/EvidencePanel';
import { NodeEditor } from './components/NodeEditor';
import { PathwayNodeEditor } from './components/PathwayNodeEditor';
import { PathwayPanel } from './components/PathwayPanel';
import { ProgramContextPanel } from './components/ProgramContextPanel';
import { ReviewPanel } from './components/ReviewPanel';
import { Toolbar } from './components/Toolbar';
import {
  autoLayoutGraphState,
  normalizeGraphState,
  useLocalStorageGraph,
} from './hooks/useLocalStorageGraph';
import type {
  AccelerateResponse,
  AccelerationProposal,
  BiologicalPathwayNode,
  DeepRiskAnalysis,
  DeepRiskResponse,
  EvidenceQueryResponse,
  EditorMode,
  ExperimentNode,
  FlowEdge,
  FlowNode,
  NodeKind,
  NodeRiskAssessment,
  Personnel,
  ProgramContext,
  RiskScanResponse,
  ReviewFinding,
  ReviewResponse,
  ScheduleResult,
} from './types/graph';
import {
  createId,
  edgeExists,
  getExperimentEdges,
  getExperimentNodes,
  getNodeById,
  hasIncomingParallelizedEdge,
  isExperimentNode,
  isPathwayNode,
  isActiveNodeStatus,
} from './utils/graph';
import { formatMetric, getTotalCost } from './utils/metrics';
import { createEmptyPathwayNode, getExperimentNodeOptions } from './utils/pathway';
import { getWarningLevel } from './utils/risk';
import { STORAGE_KEY } from './utils/constants';
import type { PathwayBuildResponse, PathwayQueryResponse } from './types/pathway';

type DragState = {
  nodeId: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  viewportLeft: number;
  viewportTop: number;
  startClientX: number;
  startClientY: number;
  hasMoved: boolean;
  zoom: number;
  viewportX: number;
  viewportY: number;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  viewportX: number;
  viewportY: number;
  hasMoved: boolean;
};

const INITIAL_NODE_POSITION = {
  x: 120,
  y: 120,
};

const DRAG_THRESHOLD_PX = 6;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.25;
const SCHEDULER_API_BASE = import.meta.env.VITE_SCHEDULER_API_URL ?? '/api';
type InteractionMode =
  | { type: 'connect'; nodeId: string }
  | { type: 'parallelize'; nodeId: string }
  | null;

const buildScheduleRequestGraph = (
  personnel: Personnel[],
  nodes: FlowNode[],
  edges: FlowEdge[],
) => {
  const experimentNodes = getExperimentNodes(nodes);
  const experimentEdges = getExperimentEdges(nodes, edges);
  return {
    personnel: personnel.map((person) => ({
      name: person.name,
      hoursPerWeek: person.hoursPerWeek,
    })),
    nodes: experimentNodes.map((node) => ({
      id: node.id,
      nodeKind: node.nodeKind,
      title: node.title,
      type: node.type,
      objective: node.objective,
      procedureSummary: node.procedureSummary,
      successCriteria: node.successCriteria,
      decisionSupported: node.decisionSupported,
      results: node.results,
      operationalNotes: node.operationalNotes,
      cost: node.cost,
      duration: node.duration,
      workHoursPerWeek: node.workHoursPerWeek,
      parallelizationMultiplier: node.parallelizationMultiplier,
      operators: node.operators,
      owner: node.owner,
      status: node.status,
      blockerPriority: node.blockerPriority,
      phase1Relevance: node.phase1Relevance,
      indRelevance: node.indRelevance,
      evidenceRefs: node.evidenceRefs,
      linkedPathwayNodeIds: node.linkedPathwayNodeIds ?? [],
    })),
    edges: experimentEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      parallelized: edge.parallelized,
    })),
  };
};

const buildAnalysisGraph = (
  program: ProgramContext,
  personnel: Personnel[],
  nodes: FlowNode[],
  edges: FlowEdge[],
) => ({
  program: {
    programTitle: program.programTitle,
    targetPhase1Design: program.targetPhase1Design,
    targetIndStrategy: program.targetIndStrategy,
  },
  personnel: personnel.map((person) => ({
    name: person.name,
    hoursPerWeek: person.hoursPerWeek,
  })),
  nodes: nodes.map((node) =>
    isExperimentNode(node)
      ? {
          id: node.id,
          nodeKind: node.nodeKind,
          title: node.title,
          type: node.type,
          objective: node.objective,
          procedureSummary: node.procedureSummary,
          successCriteria: node.successCriteria,
          decisionSupported: node.decisionSupported,
          results: node.results,
          operationalNotes: node.operationalNotes,
          cost: node.cost,
          duration: node.duration,
          workHoursPerWeek: node.workHoursPerWeek,
          parallelizationMultiplier: node.parallelizationMultiplier,
          operators: node.operators,
          owner: node.owner,
          status: node.status,
          blockerPriority: node.blockerPriority,
          phase1Relevance: node.phase1Relevance,
          indRelevance: node.indRelevance,
          evidenceRefs: node.evidenceRefs,
          linkedPathwayNodeIds: node.linkedPathwayNodeIds ?? [],
        }
      : {
          id: node.id,
          nodeKind: node.nodeKind,
          title: node.title,
          summary: node.summary,
          focusTerms: node.focusTerms ?? [],
          paperSources: [],
          extractionStatus: node.extractionStatus,
          extractionError: node.extractionError ?? null,
          pathwayGraph: null,
          sanityReport: null,
          queryHistory: [],
          lastBuiltAt: node.lastBuiltAt ?? null,
          linkedExperimentNodeIds: node.linkedExperimentNodeIds ?? [],
        },
  ),
  edges: edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    parallelized: edge.parallelized,
  })),
});

function App() {
  const {
    program,
    nodes,
    edges,
    personnel,
    budgetUsd,
    setProgram,
    setNodes,
    setEdges,
    setPersonnel,
    setBudgetUsd,
    setGraphState,
  } =
    useLocalStorageGraph();
  const [editorMode, setEditorMode] = useState<EditorMode>('closed');
  const [createNodeKind, setCreateNodeKind] = useState<NodeKind>('experiment');
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
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [evidenceQuery, setEvidenceQuery] = useState('');
  const [evidenceResponse, setEvidenceResponse] = useState<EvidenceQueryResponse | null>(
    null,
  );
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewFindings, setReviewFindings] = useState<ReviewFinding[]>([]);
  const [riskAssessments, setRiskAssessments] = useState<NodeRiskAssessment[]>([]);
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [deepRiskAnalysis, setDeepRiskAnalysis] = useState<DeepRiskAnalysis | null>(null);
  const [deepRiskError, setDeepRiskError] = useState<string | null>(null);
  const [isDeepRiskLoading, setIsDeepRiskLoading] = useState(false);
  const [isPathwayExplorerOpen, setIsPathwayExplorerOpen] = useState(false);
  const [isPathwayBuildLoading, setIsPathwayBuildLoading] = useState(false);
  const [pathwayBuildError, setPathwayBuildError] = useState<string | null>(null);
  const [isPathwayQueryLoading, setIsPathwayQueryLoading] = useState(false);
  const [pathwayQueryError, setPathwayQueryError] = useState<string | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [suppressedCanvasClick, setSuppressedCanvasClick] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<DragState | null>(null);
  const panStateRef = useRef<PanState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scheduleRequestIdRef = useRef(0);
  const accelerateAbortRef = useRef<AbortController | null>(null);
  const evidenceAbortRef = useRef<AbortController | null>(null);
  const reviewAbortRef = useRef<AbortController | null>(null);
  const riskAbortRef = useRef<AbortController | null>(null);
  const deepRiskAbortRef = useRef<AbortController | null>(null);
  const zoomRef = useRef(1);
  const viewportRefState = useRef({ x: 0, y: 0 });
  const shouldAutoCenterRef = useRef(true);
  const previousRiskAssessmentsRef = useRef<NodeRiskAssessment[]>([]);

  const selectedNode = getNodeById(nodes, selectedNodeId);
  const selectedExperimentNode =
    selectedNode && isExperimentNode(selectedNode) ? selectedNode : null;
  const selectedPathwayNode =
    selectedNode && isPathwayNode(selectedNode) ? selectedNode : null;
  const experimentNodes = getExperimentNodes(nodes);
  const totalCost = formatMetric(getTotalCost(nodes, edges));
  const showParallelizationMultiplier = selectedExperimentNode
    ? hasIncomingParallelizedEdge(edges, selectedExperimentNode.id)
    : false;
  const scheduleGraphInput = buildScheduleRequestGraph(personnel, nodes, edges);
  const analysisGraph = buildAnalysisGraph(program, personnel, nodes, edges);
  const canAccelerate = experimentNodes.length > 0 && budgetUsd !== null;
  const schedulingSignature = JSON.stringify(scheduleGraphInput);
  const analysisSignature = JSON.stringify(analysisGraph);
  const plannedCostDisplay = `${`$${totalCost}`} / ${
    budgetUsd !== null ? `$${formatMetric(budgetUsd)}` : 'No budget'
  }`;
  const plannedDuration = isAssignedView && schedule
    ? `${formatMetric(schedule.makespan)} weeks`
    : 'Not run';
  const scheduleByNodeId = Object.fromEntries(
    (isAssignedView ? schedule?.nodes ?? [] : []).map((node) => [node.nodeId, node]),
  );
  const interactiveNodeIds =
    interactionMode?.type === 'connect'
      ? experimentNodes
          .filter((node) => node.id !== interactionMode.nodeId)
          .map((node) => node.id)
      : interactionMode?.type === 'parallelize'
        ? edges
            .filter((edge) => edge.target === interactionMode.nodeId)
            .map((edge) => edge.source)
        : [];
  const riskByNodeId = Object.fromEntries(
    riskAssessments.map((assessment) => [assessment.nodeId, assessment]),
  );
  const warningByNodeId = Object.fromEntries(
    riskAssessments.flatMap((assessment) => {
      const warningLevel = getWarningLevel(assessment);
      if (!warningLevel) {
        return [];
      }

      return [[
        assessment.nodeId,
        {
          level: warningLevel,
          label: `Overall risk ${assessment.overallRisk}; coherence ${assessment.coherenceRisk}; fragility ${assessment.fragility}`,
        },
      ]];
    }),
  ) as Record<string, { level: 'warning' | 'critical'; label: string }>;
  const selectedNodeRiskAssessment =
    selectedExperimentNode && selectedNodeId ? riskByNodeId[selectedNodeId] ?? null : null;

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    viewportRefState.current = viewport;
  }, [viewport]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (dragState && dragState.pointerId === event.pointerId) {
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
                    (event.clientX - dragState.viewportLeft - dragState.viewportX) /
                      dragState.zoom -
                      dragState.offsetX,
                  ),
                  y: Math.max(
                    24,
                    (event.clientY - dragState.viewportTop - dragState.viewportY) /
                      dragState.zoom -
                      dragState.offsetY,
                  ),
                }
              : node,
          ),
        );
        return;
      }

      const panState = panStateRef.current;
      if (panState && panState.pointerId === event.pointerId) {
        const deltaX = event.clientX - panState.startX;
        const deltaY = event.clientY - panState.startY;
        if (!panState.hasMoved) {
          panState.hasMoved = Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX;
        }
        setViewport({
          x: panState.viewportX + deltaX,
          y: panState.viewportY + deltaY,
        });
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId === event.pointerId) {
        if (dragStateRef.current.hasMoved) {
          setSuppressedClickNodeId(dragStateRef.current.nodeId);
        }
        dragStateRef.current = null;
      }
      if (panStateRef.current?.pointerId === event.pointerId) {
        if (panStateRef.current.hasMoved) {
          setSuppressedCanvasClick(true);
        }
        panStateRef.current = null;
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

  useEffect(() => {
    if (!highlightedNodeId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedNodeId(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedNodeId]);

  useEffect(() => {
    previousRiskAssessmentsRef.current = riskAssessments;
  }, [riskAssessments]);

  useEffect(() => {
    deepRiskAbortRef.current?.abort();
    deepRiskAbortRef.current = null;
    setIsDeepRiskLoading(false);
    setDeepRiskAnalysis(null);
    setDeepRiskError(null);
  }, [selectedNodeId]);

  useLayoutEffect(() => {
    if (!shouldAutoCenterRef.current) {
      return;
    }

    const viewportElement = viewportRef.current;
    if (!viewportElement || nodes.length === 0) {
      return;
    }

    const minX = Math.min(...nodes.map((node) => node.x));
    const maxX = Math.max(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxY = Math.max(...nodes.map((node) => node.y));

    const centerX = (minX + maxX + 256) / 2;
    const centerY = (minY + maxY + 148) / 2;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setViewport({
          x: viewportElement.clientWidth / 2 - centerX * zoomRef.current,
          y: viewportElement.clientHeight / 2 - centerY * zoomRef.current,
        });
        shouldAutoCenterRef.current = false;
      });
    });
  }, [nodes]);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      const bounds = viewportElement.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;
      const currentZoom = zoomRef.current;
      const currentViewport = viewportRefState.current;
      const worldX = (pointerX - currentViewport.x) / currentZoom;
      const worldY = (pointerY - currentViewport.y) / currentZoom;
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, currentZoom * Math.exp(-event.deltaY * 0.005)),
      );

      setZoom(nextZoom);
      setViewport({
        x: pointerX - worldX * nextZoom,
        y: pointerY - worldY * nextZoom,
      });
    };

    viewportElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewportElement.removeEventListener('wheel', handleWheel);
  }, []);

  const openCreateEditor = (nodeKind: NodeKind) => {
    setInteractionMode(null);
    setSelectedNodeId(null);
    setCreateNodeKind(nodeKind);
    setEditorMode('create');
  };

  const closeEditor = () => {
    setInteractionMode(null);
    setEditorMode('closed');
    setSelectedNodeId(null);
  };

  const handleCanvasClick = () => {
    if (suppressedCanvasClick) {
      setSuppressedCanvasClick(false);
      return;
    }

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
      const targetNode = getNodeById(nodes, id);
      if (!targetNode || !isExperimentNode(targetNode)) {
        return;
      }
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
      const targetNode = getNodeById(nodes, interactionMode.nodeId);
      if (!targetNode || !isExperimentNode(targetNode)) {
        return;
      }
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

  const handleSaveNode = (
    values:
      | Omit<ExperimentNode, 'id' | 'x' | 'y'>
      | Omit<BiologicalPathwayNode, 'id' | 'x' | 'y'>,
  ) => {
    if (editorMode === 'create') {
      const createdNode: FlowNode =
        values.nodeKind === 'biological_pathway'
          ? {
              ...createEmptyPathwayNode(
                createId('node'),
                values.title,
                INITIAL_NODE_POSITION.x + nodes.length * 28,
                INITIAL_NODE_POSITION.y + nodes.length * 28,
              ),
              ...values,
            }
          : {
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
        ...(isExperimentNode(node)
          ? {
              operators: node.operators.filter((operator) => operator !== name),
            }
          : {}),
      })),
    );
  };

  const handleDeleteNode = () => {
    if (!selectedNodeId) {
      return;
    }

    setNodes((current) =>
      current
        .filter((node) => node.id !== selectedNodeId)
        .map((node) =>
          isExperimentNode(node)
            ? {
                ...node,
                linkedPathwayNodeIds: (node.linkedPathwayNodeIds ?? []).filter(
                  (id) => id !== selectedNodeId,
                ),
              }
            : {
                ...node,
                linkedExperimentNodeIds: (node.linkedExperimentNodeIds ?? []).filter(
                  (id) => id !== selectedNodeId,
                ),
              },
        ),
    );
    setEdges((current) =>
      current.filter(
        (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
      ),
    );
    setInteractionMode(null);
    setSelectedNodeId(null);
    setEditorMode('closed');
    setIsPathwayExplorerOpen(false);
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
        body: JSON.stringify(scheduleGraphInput),
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
          program,
          personnel,
          nodes: nextNodes,
          edges: nextEdges,
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
      edge.id === accelerateProposal.edgeId
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
            parallelizationMultiplier: accelerateProposal.multiplier,
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

  const handleProgramChange = (
    updates: Partial<typeof program>,
  ) => {
    setProgram((current) => ({
      ...current,
      ...updates,
    }));
  };

  const handleExport = () => {
    const payload = {
      storageKey: STORAGE_KEY,
      exportedAt: new Date().toISOString(),
      graph: {
        program,
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

  const centerNodeInView = (nodeId: string) => {
    const node = getNodeById(nodes, nodeId);
    const viewportElement = viewportRef.current;
    if (!node || !viewportElement) {
      return;
    }
    const centerX = node.x + 128;
    const centerY = node.y + 74;
    setViewport({
      x: viewportElement.clientWidth / 2 - centerX * zoomRef.current,
      y: viewportElement.clientHeight / 2 - centerY * zoomRef.current,
    });
  };

  const handleChatReferenceClick = (nodeId: string) => {
    setInteractionMode(null);
    setSelectedNodeId(nodeId);
    setEditorMode('edit');
    setHighlightedNodeId(nodeId);
    centerNodeInView(nodeId);
  };

  const requestEvidenceQuery = async () => {
    const nextQuery = evidenceQuery.trim();
    if (!nextQuery) {
      setEvidenceError('Enter an evidence question before querying the graph.');
      setEvidenceResponse(null);
      setIsEvidenceOpen(true);
      return;
    }

    evidenceAbortRef.current?.abort();
    const controller = new AbortController();
    evidenceAbortRef.current = controller;
    setIsEvidenceLoading(true);
    setEvidenceError(null);
    setIsEvidenceOpen(true);

    try {
      const response = await fetch(`${SCHEDULER_API_BASE}/evidence/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: nextQuery,
          graph: analysisGraph,
          schedule,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(payload?.detail ?? 'Evidence query could not analyze the graph.');
      }

      const payload = (await response.json()) as EvidenceQueryResponse;
      setEvidenceResponse(payload);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setEvidenceResponse(null);
      setEvidenceError(
        error instanceof Error ? error.message : 'Evidence query could not analyze the graph.',
      );
    } finally {
      if (evidenceAbortRef.current === controller) {
        evidenceAbortRef.current = null;
      }
      setIsEvidenceLoading(false);
    }
  };

  const requestReview = async () => {
    reviewAbortRef.current?.abort();
    const controller = new AbortController();
    reviewAbortRef.current = controller;
    setIsReviewLoading(true);
    setReviewError(null);
    setIsReviewOpen(true);

    try {
      const response = await fetch(`${SCHEDULER_API_BASE}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          graph: analysisGraph,
          schedule,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(payload?.detail ?? 'Review could not analyze the graph.');
      }

      const payload = (await response.json()) as ReviewResponse;
      setReviewFindings(payload.findings);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setReviewFindings([]);
      setReviewError(
        error instanceof Error ? error.message : 'Review could not analyze the graph.',
      );
    } finally {
      if (reviewAbortRef.current === controller) {
        reviewAbortRef.current = null;
      }
      setIsReviewLoading(false);
    }
  };

  const requestRiskScan = async (
    previousAssessments: NodeRiskAssessment[] = previousRiskAssessmentsRef.current,
  ) => {
    riskAbortRef.current?.abort();
    const controller = new AbortController();
    riskAbortRef.current = controller;
    setIsRiskLoading(true);
    setRiskError(null);

    try {
      const response = await fetch(`${SCHEDULER_API_BASE}/risk/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          graph: analysisGraph,
          previousAssessments,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(payload?.detail ?? 'Risk scoring could not analyze the graph.');
      }

      const payload = (await response.json()) as RiskScanResponse;
      setRiskAssessments(payload.assessments);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setRiskAssessments([]);
      setRiskError(
        error instanceof Error ? error.message : 'Risk scoring could not analyze the graph.',
      );
    } finally {
      if (riskAbortRef.current === controller) {
        riskAbortRef.current = null;
      }
      setIsRiskLoading(false);
    }
  };

  const requestDeepRiskReasoning = async () => {
    if (!selectedNodeId) {
      return;
    }

    const node = getNodeById(nodes, selectedNodeId);
    if (!node || !isExperimentNode(node) || !isActiveNodeStatus(node.status)) {
      return;
    }

    deepRiskAbortRef.current?.abort();
    const controller = new AbortController();
    deepRiskAbortRef.current = controller;
    setIsDeepRiskLoading(true);
    setDeepRiskError(null);
    setDeepRiskAnalysis(null);

    try {
      const response = await fetch(`${SCHEDULER_API_BASE}/risk/deep`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          graph: analysisGraph,
          nodeId: selectedNodeId,
          previousAssessment: selectedNodeRiskAssessment,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(payload?.detail ?? 'Deep reasoning could not analyze this node.');
      }

      const payload = (await response.json()) as DeepRiskResponse;
      setDeepRiskAnalysis(payload.analysis);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setDeepRiskError(
        error instanceof Error ? error.message : 'Deep reasoning could not analyze this node.',
      );
    } finally {
      if (deepRiskAbortRef.current === controller) {
        deepRiskAbortRef.current = null;
      }
      setIsDeepRiskLoading(false);
    }
  };

  const savePathwayNodeAndGetId = (
    values: Omit<BiologicalPathwayNode, 'id' | 'x' | 'y'>,
  ) => {
    if (editorMode === 'create') {
      const createdNode: BiologicalPathwayNode = {
        ...createEmptyPathwayNode(
          createId('node'),
          values.title,
          INITIAL_NODE_POSITION.x + nodes.length * 28,
          INITIAL_NODE_POSITION.y + nodes.length * 28,
        ),
        ...values,
      };
      setNodes((current) => [...current, createdNode]);
      setSelectedNodeId(createdNode.id);
      setEditorMode('edit');
      return createdNode.id;
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
      return selectedNodeId;
    }

    return null;
  };

  const handleBuildPathway = async (
    values: Omit<BiologicalPathwayNode, 'id' | 'x' | 'y'>,
  ) => {
    const nodeId = savePathwayNodeAndGetId({
      ...values,
      extractionStatus: 'building',
      extractionError: null,
    });
    if (!nodeId) {
      return;
    }

    setPathwayBuildError(null);
    setIsPathwayBuildLoading(true);

    try {
      const response = await fetch(`${SCHEDULER_API_BASE}/pathway/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: values.title,
          focusTerms: values.focusTerms ?? [],
          paperSources: values.paperSources,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(payload?.detail ?? 'Pathway build failed.');
      }

      const payload = (await response.json()) as PathwayBuildResponse;
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId && isPathwayNode(node)
            ? {
                ...node,
                ...values,
                extractionStatus: payload.status === 'ready' ? 'ready' : 'error',
                extractionError: payload.errors.join('\n') || null,
                pathwayGraph: payload.pathwayGraph,
                sanityReport: payload.sanityReport,
                summary: values.summary?.trim() || payload.buildSummary,
                lastBuiltAt: new Date().toISOString(),
                lastBuildResponse: payload,
              }
            : node,
        ),
      );
      setIsPathwayExplorerOpen(payload.status === 'ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pathway build failed.';
      setPathwayBuildError(message);
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId && isPathwayNode(node)
            ? {
                ...node,
                ...values,
                extractionStatus: 'error',
                extractionError: message,
              }
            : node,
        ),
      );
    } finally {
      setIsPathwayBuildLoading(false);
    }
  };

  const requestPathwayQuery = async (query: string) => {
    if (!selectedPathwayNode?.pathwayGraph) {
      return;
    }

    setIsPathwayQueryLoading(true);
    setPathwayQueryError(null);

    try {
      const response = await fetch(`${SCHEDULER_API_BASE}/pathway/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pathwayGraph: selectedPathwayNode.pathwayGraph,
          query,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(payload?.detail ?? 'Pathway query failed.');
      }

      const payload = (await response.json()) as PathwayQueryResponse;
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedPathwayNode.id && isPathwayNode(node)
            ? {
                ...node,
                latestQueryResponse: payload,
                queryHistory: [
                  {
                    id: createId('pathway_query'),
                    query,
                    askedAt: new Date().toISOString(),
                    answerSummary: payload.answer_summary,
                    status: payload.query_status,
                  },
                  ...(node.queryHistory ?? []),
                ].slice(0, 12),
              }
            : node,
        ),
      );
    } catch (error) {
      setPathwayQueryError(error instanceof Error ? error.message : 'Pathway query failed.');
    } finally {
      setIsPathwayQueryLoading(false);
    }
  };

  const clearPathwayQuery = () => {
    setPathwayQueryError(null);
    if (!selectedPathwayNode) {
      return;
    }

    setNodes((current) =>
      current.map((node) =>
        node.id === selectedPathwayNode.id && isPathwayNode(node)
          ? {
              ...node,
              latestQueryResponse: null,
            }
          : node,
      ),
    );
  };

  useEffect(() => {
    if (nodes.length === 0) {
      riskAbortRef.current?.abort();
      riskAbortRef.current = null;
      setRiskAssessments([]);
      previousRiskAssessmentsRef.current = [];
      setRiskError(null);
      setIsRiskLoading(false);
      return;
    }

    void requestRiskScan();
  }, [analysisSignature]);

  const handleImport = (value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return 'Paste a graph JSON payload before applying.';
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmedValue) as unknown;
    } catch {
      return 'The pasted text is not valid JSON.';
    }

    const root = typeof parsed === 'object' && parsed !== null ? parsed : null;
    const nextState = normalizeGraphState(
      root && 'graph' in root ? (root as { graph: unknown }).graph : parsed,
    );
    if (!nextState) {
      return 'The JSON does not match the exported graph format.';
    }

    const layoutedState = autoLayoutGraphState(nextState);

    accelerateAbortRef.current?.abort();
    accelerateAbortRef.current = null;
    setGraphState(layoutedState);
    setInteractionMode(null);
    setSelectedNodeId(null);
    setEditorMode('closed');
    setSchedule(null);
    setScheduleError(null);
    setIsAssignedView(false);
    setIsAssigning(false);
    setIsAccelerating(false);
    setAccelerateProposal(null);
    setAccelerateError(null);
    setAccelerateStopReason(null);
    setRejectedProposalIds([]);
    setSuppressedClickNodeId(null);
    evidenceAbortRef.current?.abort();
    evidenceAbortRef.current = null;
    setIsEvidenceOpen(false);
    setEvidenceQuery('');
    setEvidenceResponse(null);
    setIsEvidenceLoading(false);
    setEvidenceError(null);
    reviewAbortRef.current?.abort();
    reviewAbortRef.current = null;
    setIsReviewOpen(false);
    setIsReviewLoading(false);
    setReviewError(null);
    setReviewFindings([]);
    riskAbortRef.current?.abort();
    riskAbortRef.current = null;
    setRiskAssessments([]);
    previousRiskAssessmentsRef.current = [];
    setIsRiskLoading(false);
    setRiskError(null);
    deepRiskAbortRef.current?.abort();
    deepRiskAbortRef.current = null;
    setDeepRiskAnalysis(null);
    setDeepRiskError(null);
    setIsDeepRiskLoading(false);
    setHighlightedNodeId(null);
    shouldAutoCenterRef.current = true;
    setZoom(1);
    setViewport({ x: 0, y: 0 });
    return null;
  };

  const handleNodePointerDown = (
    id: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (interactionMode) {
      return;
    }

    const node = getNodeById(nodes, id);
    const viewportElement = viewportRef.current;
    if (!node || !viewportElement) {
      return;
    }

    const viewportBounds = viewportElement.getBoundingClientRect();

    dragStateRef.current = {
      nodeId: id,
      pointerId: event.pointerId,
      offsetX:
        (event.clientX - viewportBounds.left - viewportRefState.current.x) / zoom -
        node.x,
      offsetY:
        (event.clientY - viewportBounds.top - viewportRefState.current.y) / zoom -
        node.y,
      viewportLeft: viewportBounds.left,
      viewportTop: viewportBounds.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      hasMoved: false,
      zoom,
      viewportX: viewportRefState.current.x,
      viewportY: viewportRefState.current.y,
    };
  };

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionMode) {
      return;
    }

    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewportX: viewportRefState.current.x,
      viewportY: viewportRefState.current.y,
      hasMoved: false,
    };
  };

  return (
    <div className="app-shell">
      <Toolbar
        plannedCostDisplay={plannedCostDisplay}
        plannedDuration={plannedDuration}
        isAssigning={isAssigning}
        canAssign={experimentNodes.length > 0}
        isAssignedView={isAssignedView}
        isAccelerating={isAccelerating || Boolean(accelerateProposal || accelerateError || accelerateStopReason)}
        canAccelerate={canAccelerate}
        isEvidenceOpen={isEvidenceOpen}
        isReviewOpen={isReviewOpen}
        isReviewing={isReviewLoading}
        onAssign={handleAssign}
        onAccelerate={handleAccelerate}
        onToggleEvidence={() => {
          if (isEvidenceOpen) {
            evidenceAbortRef.current?.abort();
            evidenceAbortRef.current = null;
            setIsEvidenceLoading(false);
            setEvidenceError(null);
            setIsEvidenceOpen(false);
            return;
          }

          setEvidenceError(null);
          setIsEvidenceOpen(true);
        }}
        onToggleReview={() => {
          if (isReviewOpen) {
            reviewAbortRef.current?.abort();
            reviewAbortRef.current = null;
            setIsReviewLoading(false);
            setReviewError(null);
            setIsReviewOpen(false);
            return;
          }

          void requestReview();
        }}
        onExport={handleExport}
        onImport={handleImport}
        onAddExperimentNode={() => openCreateEditor('experiment')}
        onAddPathwayNode={() => openCreateEditor('biological_pathway')}
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
        <ProgramContextPanel
          program={program}
          budgetUsd={budgetUsd}
          personnel={personnel}
          onProgramChange={handleProgramChange}
          onBudgetChange={handleBudgetChange}
          onAddPerson={handleAddPerson}
          onUpdatePersonHours={handleUpdatePersonHours}
          onRemovePerson={handleRemovePerson}
        />
        <Canvas
          nodes={nodes}
          edges={edges}
          scheduleByNodeId={scheduleByNodeId}
          warningByNodeId={warningByNodeId}
          selectedNodeId={selectedNodeId}
          highlightedNodeId={highlightedNodeId}
          interactiveNodeIds={interactiveNodeIds}
          activeNodeId={interactionMode?.nodeId ?? null}
          zoom={zoom}
          viewport={viewport}
          canvasRef={canvasRef}
          viewportRef={viewportRef}
          onCanvasClick={handleCanvasClick}
          onStagePointerDown={handleStagePointerDown}
          onNodeClick={handleNodeClick}
          onNodePointerDown={handleNodePointerDown}
        />
        {(createNodeKind === 'experiment' && editorMode === 'create') || selectedExperimentNode ? (
          <NodeEditor
            mode={editorMode}
            node={selectedExperimentNode}
            personnel={personnel}
            riskAssessment={selectedNodeRiskAssessment}
            isRiskLoading={isRiskLoading}
            riskError={riskError}
            isDeepReasoningLoading={isDeepRiskLoading}
            showParallelizationMultiplier={showParallelizationMultiplier}
            isConnectMode={interactionMode?.type === 'connect'}
            isParallelizeMode={interactionMode?.type === 'parallelize'}
            onClose={closeEditor}
            onSave={handleSaveNode}
            onDelete={handleDeleteNode}
            onStartConnect={() => {
              if (selectedExperimentNode) {
                setInteractionMode({ type: 'connect', nodeId: selectedExperimentNode.id });
              }
            }}
            onStartParallelize={() => {
              if (selectedExperimentNode) {
                setInteractionMode({ type: 'parallelize', nodeId: selectedExperimentNode.id });
              }
            }}
            onCancelConnect={() => setInteractionMode(null)}
            onDeepReasoning={() => {
              void requestDeepRiskReasoning();
            }}
          />
        ) : null}
        {(createNodeKind === 'biological_pathway' && editorMode === 'create') || selectedPathwayNode ? (
          <PathwayNodeEditor
            mode={editorMode}
            node={selectedPathwayNode}
            experimentNodes={getExperimentNodeOptions(nodes)}
            isBuilding={isPathwayBuildLoading}
            buildError={pathwayBuildError}
            onClose={closeEditor}
            onSave={handleSaveNode}
            onDelete={handleDeleteNode}
            onBuild={handleBuildPathway}
            onOpenExplorer={() => setIsPathwayExplorerOpen(true)}
          />
        ) : null}
        <DeepRiskPanel
          analysis={deepRiskAnalysis}
          isLoading={isDeepRiskLoading}
          error={deepRiskError}
          nodeTitle={selectedExperimentNode?.title ?? null}
          onClose={() => {
            deepRiskAbortRef.current?.abort();
            deepRiskAbortRef.current = null;
            setIsDeepRiskLoading(false);
            setDeepRiskError(null);
            setDeepRiskAnalysis(null);
          }}
        />
        <EvidencePanel
          isOpen={isEvidenceOpen}
          isLoading={isEvidenceLoading}
          error={evidenceError}
          query={evidenceQuery}
          response={evidenceResponse}
          nodes={nodes}
          onClose={() => {
            evidenceAbortRef.current?.abort();
            evidenceAbortRef.current = null;
            setIsEvidenceLoading(false);
            setEvidenceError(null);
            setIsEvidenceOpen(false);
          }}
          onQueryChange={setEvidenceQuery}
          onSubmit={() => {
            void requestEvidenceQuery();
          }}
          onReferenceClick={handleChatReferenceClick}
        />
        <ReviewPanel
          isOpen={isReviewOpen}
          isLoading={isReviewLoading}
          error={reviewError}
          findings={reviewFindings}
          nodes={nodes}
          onClose={() => {
            reviewAbortRef.current?.abort();
            reviewAbortRef.current = null;
            setIsReviewLoading(false);
            setReviewError(null);
            setIsReviewOpen(false);
          }}
          onRefresh={() => {
            void requestReview();
          }}
          onReferenceClick={handleChatReferenceClick}
        />
        <PathwayPanel
          node={selectedPathwayNode}
          isOpen={isPathwayExplorerOpen}
          isQuerying={isPathwayQueryLoading}
          queryError={pathwayQueryError}
          queryResponse={selectedPathwayNode?.latestQueryResponse ?? null}
          onClose={() => {
            setIsPathwayExplorerOpen(false);
            setPathwayQueryError(null);
          }}
          onQuery={(query) => {
            void requestPathwayQuery(query);
          }}
          onClearQuery={clearPathwayQuery}
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
