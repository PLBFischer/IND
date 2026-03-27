import { useEffect, useState } from 'react';
import type {
  BiologicalPathwayNode,
  DataFileAttachment,
  DataNode,
  ExperimentNode,
  FlowEdge,
  FlowNode,
  Personnel,
  ProgramContext,
} from '../types/graph';
import {
  BLOCKER_PRIORITY_OPTIONS,
  NODE_STATUS_OPTIONS,
  NODE_TYPE_OPTIONS,
} from '../types/graph';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_WIDTH,
  STORAGE_KEY,
} from '../utils/constants';
import type { PathwayPaperSource } from '../types/pathway';
import { isCompletedNodeStatus, isExperimentNode } from '../utils/graph';

export type GraphState = {
  program: ProgramContext;
  nodes: FlowNode[];
  edges: FlowEdge[];
  personnel: Personnel[];
  budgetUsd: number | null;
};

const defaultProgram: ProgramContext = {
  programTitle: 'CNS Lead Enablement Demo',
  targetPhase1Design:
    'Single ascending dose followed by short multiple ascending dose in healthy volunteers, with PK, food-effect, and CSF-enabled biomarker exploration if exposure supports it.',
  targetIndStrategy:
    'Build an IND package around oral exposure, CNS penetration, early efficacy plausibility, and a coherent nonclinical safety narrative that supports first-in-human dose escalation.',
  currentWeek: 1,
};

const defaultState: GraphState = {
  program: defaultProgram,
  nodes: [
    {
      id: 'node_pk_brain',
      nodeKind: 'experiment',
      title: 'Rodent PK / brain exposure',
      type: 'pk',
      objective:
        'Establish whether the lead reaches brain exposure compatible with the intended oral Phase 1 path.',
      procedureSummary:
        'Single-dose mouse PK with plasma and brain sampling across 8 hours using the intended formulation.',
      successCriteria:
        'Free brain exposure clears the projected efficacious concentration with usable variability and oral tolerability.',
      decisionSupported:
        'Supports brain penetration claim and informs early clinical dose framing.',
      results: '',
      operationalNotes: 'Bioanalysis vendor has a provisional slot hold for next week.',
      cost: 52000,
      duration: 4,
      workHoursPerWeek: 10,
      parallelizationMultiplier: 1,
      operators: ['Avery Chen'],
      owner: 'Avery Chen',
      status: 'planned',
      actualStartWeek: null,
      blockerPriority: 'critical',
      phase1Relevance:
        'The target Phase 1 design assumes oral dosing can achieve CNS-relevant exposure margins.',
      indRelevance:
        'Feeds the clinical pharmacology narrative and exposure-driven rationale for dose escalation.',
      evidenceRefs: [],
      linkedPathwayNodeIds: [],
      x: 160,
      y: 140,
    },
    {
      id: 'node_formulation_ready',
      nodeKind: 'experiment',
      title: 'Suspension formulation and analytics',
      type: 'formulation_cmc',
      objective:
        'Lock a formulation and analytical setup that can support tox and first-in-human-enabling studies.',
      procedureSummary:
        'Finalize the suspension composition, release test panel, and bridging analytical method package.',
      successCriteria:
        'Formulation is reproducible, stable over the study window, and analytically trackable for planned studies.',
      decisionSupported:
        'Supports nonclinical execution readiness and reduces reformulation churn before IND-enabling work.',
      results: '',
      operationalNotes: 'Analytical standard availability is the current pacing item.',
      cost: 36000,
      duration: 3,
      workHoursPerWeek: 8,
      parallelizationMultiplier: 1,
      operators: ['Morgan Patel'],
      owner: 'Morgan Patel',
      status: 'planned',
      actualStartWeek: null,
      blockerPriority: 'supporting',
      phase1Relevance:
        'Helps ensure formulation used in tox and early clinical supply tells a coherent story.',
      indRelevance:
        'Reduces the risk that exposure or safety data must be reinterpreted because of formulation drift.',
      evidenceRefs: [],
      linkedPathwayNodeIds: [],
      x: 180,
      y: 360,
    },
    {
      id: 'node_efficacy_bridge',
      nodeKind: 'experiment',
      title: 'In vivo efficacy bridge',
      type: 'other',
      objective:
        'Confirm that the clinical candidate maintains a credible efficacy signal at exposures achievable in vivo.',
      procedureSummary:
        'Run the lead in the disease model with PK sampling aligned to the efficacy readout.',
      successCriteria:
        'Observed efficacy is directionally consistent with the program hypothesis and linked to measured exposure.',
      decisionSupported:
        'Supports translational plausibility and prioritization of the clinic-bound mechanism story.',
      results: '',
      operationalNotes: 'Model availability is stable, but cohort randomization has little slack.',
      cost: 88000,
      duration: 6,
      workHoursPerWeek: 14,
      parallelizationMultiplier: 1,
      operators: ['Sam Rivera'],
      owner: 'Sam Rivera',
      status: 'planned',
      actualStartWeek: null,
      blockerPriority: 'critical',
      phase1Relevance:
        'Anchors the intended biomarker and exposure interpretation for the early clinical design.',
      indRelevance:
        'Provides part of the efficacy plausibility narrative for why the asset is ready for Phase 1.',
      evidenceRefs: [],
      linkedPathwayNodeIds: [],
      x: 540,
      y: 140,
    },
    {
      id: 'node_tox_drf',
      nodeKind: 'experiment',
      title: '14-day dose-range finding tox',
      type: 'tox',
      objective:
        'Bound the near-term safety envelope and surface liabilities that could undermine the IND story.',
      procedureSummary:
        'Conduct a short repeat-dose tox study with safety observations and exposure coverage at planned dose levels.',
      successCriteria:
        'Safety findings are interpretable, dose-related where relevant, and leave a credible path into IND-enabling studies.',
      decisionSupported:
        'De-risks the safety narrative and informs dose selection for later studies.',
      results: '',
      operationalNotes: 'CRO slot is available now but will slip by a month if missed.',
      cost: 110000,
      duration: 7,
      workHoursPerWeek: 12,
      parallelizationMultiplier: 1,
      operators: ['Avery Chen', 'Morgan Patel'],
      owner: 'Avery Chen',
      status: 'planned',
      actualStartWeek: null,
      blockerPriority: 'critical',
      phase1Relevance:
        'Directly shapes whether the intended escalation strategy remains credible.',
      indRelevance:
        'Core support for the safety narrative in the IND package.',
      evidenceRefs: [],
      linkedPathwayNodeIds: [],
      x: 920,
      y: 220,
    },
  ],
  edges: [
    {
      id: 'edge_pk_efficacy',
      source: 'node_pk_brain',
      target: 'node_efficacy_bridge',
      parallelized: false,
    },
    {
      id: 'edge_pk_tox',
      source: 'node_pk_brain',
      target: 'node_tox_drf',
      parallelized: false,
    },
    {
      id: 'edge_formulation_tox',
      source: 'node_formulation_ready',
      target: 'node_tox_drf',
      parallelized: false,
    },
  ],
  personnel: [
    { name: 'Avery Chen', hoursPerWeek: 40 },
    { name: 'Morgan Patel', hoursPerWeek: 40 },
    { name: 'Sam Rivera', hoursPerWeek: 40 },
  ],
  budgetUsd: 380000,
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isValidNodeType = (value: unknown): value is ExperimentNode['type'] =>
  typeof value === 'string' &&
  (NODE_TYPE_OPTIONS as readonly string[]).includes(value);

const isValidNodeStatus = (value: unknown): value is ExperimentNode['status'] =>
  typeof value === 'string' &&
  (NODE_STATUS_OPTIONS as readonly string[]).includes(value);

const isValidBlockerPriority = (
  value: unknown,
): value is ExperimentNode['blockerPriority'] =>
  typeof value === 'string' &&
  (BLOCKER_PRIORITY_OPTIONS as readonly string[]).includes(value);

const normalizeNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const normalizeEvidenceRefs = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) =>
      typeof entry === 'string' && entry.trim() ? [entry.trim()] : [],
    );
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) =>
      typeof entry === 'string' && entry.trim() ? [entry.trim()] : [],
    );
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizePathwaySources = (value: unknown): PathwayPaperSource[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isObject(entry) || typeof entry.sourceValue !== 'string') {
      return [];
    }

    const sourceType =
      entry.sourceType === 'pubmed_url' ||
      entry.sourceType === 'pmc_url' ||
      entry.sourceType === 'pmcid' ||
      entry.sourceType === 'raw_text'
        ? entry.sourceType
        : 'raw_text';
    const fetchStatus =
      entry.fetchStatus === 'pending' ||
      entry.fetchStatus === 'fetched' ||
      entry.fetchStatus === 'failed'
        ? entry.fetchStatus
        : undefined;

    return [
      {
        sourceId:
          typeof entry.sourceId === 'string' && entry.sourceId.trim()
            ? entry.sourceId
            : `source_${index + 1}`,
        label: typeof entry.label === 'string' ? entry.label : undefined,
        sourceType,
        sourceValue: entry.sourceValue,
        title: typeof entry.title === 'string' ? entry.title : null,
        pubmedId: typeof entry.pubmedId === 'string' ? entry.pubmedId : null,
        pmcid: typeof entry.pmcid === 'string' ? entry.pmcid : null,
        fetchStatus,
        fetchError: typeof entry.fetchError === 'string' ? entry.fetchError : null,
      },
    ];
  });
};

const normalizeDataFiles = (value: unknown): DataFileAttachment[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isObject(entry) || typeof entry.name !== 'string') {
      return [];
    }

    return [
      {
        id:
          typeof entry.id === 'string' && entry.id.trim()
            ? entry.id
            : `data_file_${index + 1}`,
        name: entry.name,
        sizeBytes: normalizeNumber(entry.sizeBytes, 0),
        mimeType:
          typeof entry.mimeType === 'string' ? entry.mimeType : 'application/octet-stream',
        uploadedAt:
          typeof entry.uploadedAt === 'string' && entry.uploadedAt.trim()
            ? entry.uploadedAt
            : new Date(0).toISOString(),
      },
    ];
  });
};

const normalizeProgramContext = (value: unknown): ProgramContext => {
  if (!isObject(value)) {
    return defaultProgram;
  }

  const programTitle =
    typeof value.programTitle === 'string' && value.programTitle.trim()
      ? value.programTitle
      : undefined;

  return {
    programTitle,
    targetPhase1Design:
      typeof value.targetPhase1Design === 'string'
        ? value.targetPhase1Design
        : '',
    targetIndStrategy:
      typeof value.targetIndStrategy === 'string' ? value.targetIndStrategy : '',
    currentWeek: Math.max(1, normalizeNumber(value.currentWeek, 1)),
  };
};

const normalizeExperimentNode = (node: Record<string, unknown>): ExperimentNode => {
  const legacyProcedureSummary =
    typeof node.content === 'string' ? node.content : '';
  const status = isValidNodeStatus(node.status)
    ? node.status
    : typeof node.completed === 'boolean'
      ? node.completed
        ? 'completed'
        : 'planned'
      : 'planned';

  return {
    id: node.id as string,
    nodeKind: 'experiment',
    title: node.title as string,
    type: isValidNodeType(node.type) ? node.type : 'other',
    objective: typeof node.objective === 'string' ? node.objective : '',
    procedureSummary:
      typeof node.procedureSummary === 'string'
        ? node.procedureSummary
        : legacyProcedureSummary,
    successCriteria:
      typeof node.successCriteria === 'string' ? node.successCriteria : '',
    decisionSupported:
      typeof node.decisionSupported === 'string' ? node.decisionSupported : '',
    results: typeof node.results === 'string' ? node.results : '',
    operationalNotes:
      typeof node.operationalNotes === 'string' ? node.operationalNotes : '',
    cost: normalizeNumber(node.cost, 0),
    duration: normalizeNumber(node.duration, 0),
    workHoursPerWeek: normalizeNumber(node.workHoursPerWeek, 40),
    parallelizationMultiplier:
      node.parallelizationMultiplier === 2 ||
      node.parallelizationMultiplier === 3 ||
      node.parallelizationMultiplier === 4
        ? node.parallelizationMultiplier
        : 1,
    operators: Array.isArray(node.operators)
      ? node.operators.filter(
          (operator): operator is string => typeof operator === 'string',
        )
      : [],
    owner: typeof node.owner === 'string' ? node.owner : undefined,
    status,
    actualStartWeek:
      typeof node.actualStartWeek === 'number' && Number.isFinite(node.actualStartWeek)
        ? Math.max(1, node.actualStartWeek)
        : null,
    blockerPriority: isValidBlockerPriority(node.blockerPriority)
      ? node.blockerPriority
      : 'supporting',
    phase1Relevance:
      typeof node.phase1Relevance === 'string' ? node.phase1Relevance : '',
    indRelevance: typeof node.indRelevance === 'string' ? node.indRelevance : '',
    evidenceRefs: normalizeEvidenceRefs(node.evidenceRefs),
    linkedPathwayNodeIds: normalizeStringList(node.linkedPathwayNodeIds),
    x: normalizeNumber(node.x, 120),
    y: normalizeNumber(node.y, 120),
  };
};

const normalizePathwayNode = (node: Record<string, unknown>): BiologicalPathwayNode => ({
  id: node.id as string,
  nodeKind: 'biological_pathway',
  title: node.title as string,
  x: normalizeNumber(node.x, 120),
  y: normalizeNumber(node.y, 120),
  summary: typeof node.summary === 'string' ? node.summary : '',
  focusTerms: normalizeStringList(node.focusTerms),
  paperSources: normalizePathwaySources(node.paperSources),
  extractionStatus:
    node.extractionStatus === 'building' ||
    node.extractionStatus === 'ready' ||
    node.extractionStatus === 'error'
      ? node.extractionStatus
      : 'empty',
  extractionError: typeof node.extractionError === 'string' ? node.extractionError : null,
  pathwayGraph:
    typeof node.pathwayGraph === 'object' && node.pathwayGraph !== null
      ? (node.pathwayGraph as BiologicalPathwayNode['pathwayGraph'])
      : null,
  sanityReport:
    typeof node.sanityReport === 'object' && node.sanityReport !== null
      ? (node.sanityReport as BiologicalPathwayNode['sanityReport'])
      : null,
  queryHistory: Array.isArray(node.queryHistory)
    ? (node.queryHistory as BiologicalPathwayNode['queryHistory'])
    : [],
  lastBuiltAt: typeof node.lastBuiltAt === 'string' ? node.lastBuiltAt : null,
  linkedExperimentNodeIds: normalizeStringList(node.linkedExperimentNodeIds),
  lastBuildResponse:
    typeof node.lastBuildResponse === 'object' && node.lastBuildResponse !== null
      ? (node.lastBuildResponse as BiologicalPathwayNode['lastBuildResponse'])
      : null,
  latestQueryResponse:
    typeof node.latestQueryResponse === 'object' && node.latestQueryResponse !== null
      ? (node.latestQueryResponse as BiologicalPathwayNode['latestQueryResponse'])
      : null,
});

const normalizeDataNode = (node: Record<string, unknown>): DataNode => ({
  id: node.id as string,
  nodeKind: 'data',
  title: node.title as string,
  x: normalizeNumber(node.x, 120),
  y: normalizeNumber(node.y, 120),
  description: typeof node.description === 'string' ? node.description : '',
  files: normalizeDataFiles(node.files),
  linkedExperimentNodeIds: normalizeStringList(node.linkedExperimentNodeIds),
});

const normalizeNode = (node: unknown): FlowNode | null => {
  if (!isObject(node) || typeof node.id !== 'string' || typeof node.title !== 'string') {
    return null;
  }

  if (node.nodeKind === 'biological_pathway') {
    return normalizePathwayNode(node);
  }

  if (node.nodeKind === 'data') {
    return normalizeDataNode(node);
  }

  return normalizeExperimentNode(node);
};

const normalizeEdge = (edge: unknown): FlowEdge | null => {
  if (
    !isObject(edge) ||
    typeof edge.id !== 'string' ||
    typeof edge.source !== 'string' ||
    typeof edge.target !== 'string'
  ) {
    return null;
  }

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    parallelized: typeof edge.parallelized === 'boolean' ? edge.parallelized : false,
  };
};

const normalizePersonnel = (personnel: unknown): Personnel[] => {
  if (!Array.isArray(personnel)) {
    return defaultState.personnel;
  }

  return personnel.flatMap((person) => {
    if (typeof person === 'string') {
      return [{ name: person, hoursPerWeek: 40 }];
    }

    if (isObject(person) && typeof person.name === 'string') {
      return [
        {
          name: person.name,
          hoursPerWeek: normalizeNumber(person.hoursPerWeek, 40),
        },
      ];
    }

    return [];
  });
};

export const normalizeGraphState = (value: unknown): GraphState | null => {
  if (!isObject(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return null;
  }

  const nodes = value.nodes
    .map((node) => normalizeNode(node))
    .filter((node): node is FlowNode => node !== null);
  const edges = value.edges
    .map((edge) => normalizeEdge(edge))
    .filter((edge): edge is FlowEdge => edge !== null);

  return {
    program: normalizeProgramContext(value.program),
    nodes,
    edges,
    personnel: normalizePersonnel(value.personnel),
    budgetUsd: typeof value.budgetUsd === 'number' ? value.budgetUsd : null,
  };
};

export const autoLayoutGraphState = (state: GraphState): GraphState => {
  if (state.nodes.length === 0) {
    return state;
  }

  const nodeIds = new Set(state.nodes.map((node) => node.id));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of state.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of state.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }

    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const orderedNodes = [...state.nodes].sort((a, b) => a.title.localeCompare(b.title));
  const queue = orderedNodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const depth = new Map<string, number>();

  for (const node of orderedNodes) {
    depth.set(node.id, 0);
  }

  const topo: string[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    topo.push(currentId);
    const currentDepth = depth.get(currentId) ?? 0;
    for (const nextId of outgoing.get(currentId) ?? []) {
      depth.set(nextId, Math.max(depth.get(nextId) ?? 0, currentDepth + 1));
      indegree.set(nextId, (indegree.get(nextId) ?? 0) - 1);
      if ((indegree.get(nextId) ?? 0) === 0) {
        queue.push(nextId);
      }
    }
  }

  for (const node of orderedNodes) {
    if (!topo.includes(node.id)) {
      topo.push(node.id);
    }
  }

  const layerMap = new Map<number, FlowNode[]>();
  const nodeMap = new Map(state.nodes.map((node) => [node.id, node]));

  for (const nodeId of topo) {
    const node = nodeMap.get(nodeId);
    if (!node) {
      continue;
    }

    const layer = depth.get(nodeId) ?? 0;
    const existing = layerMap.get(layer) ?? [];
    existing.push(node);
    layerMap.set(layer, existing);
  }

  for (const [layer, nodes] of layerMap.entries()) {
    layerMap.set(
      layer,
      [...nodes].sort((left, right) => {
        const leftParents = incoming.get(left.id) ?? [];
        const rightParents = incoming.get(right.id) ?? [];
        const leftParentDepth = leftParents.reduce(
          (sum, parentId) => sum + (depth.get(parentId) ?? 0),
          0,
        );
        const rightParentDepth = rightParents.reduce(
          (sum, parentId) => sum + (depth.get(parentId) ?? 0),
          0,
        );
        if (leftParentDepth !== rightParentDepth) {
          return leftParentDepth - rightParentDepth;
        }

        if (isExperimentNode(left) && isExperimentNode(right)) {
          if (isCompletedNodeStatus(left.status) !== isCompletedNodeStatus(right.status)) {
            return isCompletedNodeStatus(left.status) ? -1 : 1;
          }
        }

        return left.title.localeCompare(right.title);
      }),
    );
  }

  const layers = [...layerMap.keys()].sort((a, b) => a - b);
  const maxLayerSize = Math.max(...layers.map((layer) => layerMap.get(layer)?.length ?? 0));
  const horizontalPadding = 120;
  const verticalPadding = 90;
  const minXStep = NODE_WIDTH + 220;
  const minYStep = NODE_MIN_HEIGHT + 140;
  const requiredWidth =
    horizontalPadding * 2 + NODE_WIDTH + Math.max(0, layers.length - 1) * minXStep;
  const requiredHeight =
    verticalPadding * 2 + NODE_MIN_HEIGHT + Math.max(0, maxLayerSize - 1) * minYStep;
  const effectiveWidth = Math.max(CANVAS_WIDTH, requiredWidth);
  const effectiveHeight = Math.max(CANVAS_HEIGHT, requiredHeight);
  const usableWidth = effectiveWidth - horizontalPadding * 2 - NODE_WIDTH;
  const usableHeight = effectiveHeight - verticalPadding * 2 - NODE_MIN_HEIGHT;
  const xStep = layers.length > 1 ? usableWidth / (layers.length - 1) : 0;
  const baseYStep = maxLayerSize > 1 ? usableHeight / (maxLayerSize - 1) : 0;
  const yStep = Math.max(minYStep, baseYStep);

  const positionedNodes = state.nodes.map((node) => {
    const layer = depth.get(node.id) ?? 0;
    const nodesInLayer = layerMap.get(layer) ?? [];
    const indexInLayer = nodesInLayer.findIndex((entry) => entry.id === node.id);
    const layerHeight = indexInLayer >= 0 ? (nodesInLayer.length - 1) * yStep : 0;
    const startY = Math.max(
      verticalPadding,
      (effectiveHeight - NODE_MIN_HEIGHT - layerHeight) / 2,
    );

    return {
      ...node,
      x: Math.round(horizontalPadding + layer * xStep),
      y: Math.round(startY + Math.max(0, indexInLayer) * yStep),
    };
  });

  return {
    ...state,
    nodes: positionedNodes,
  };
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
    const parsed = JSON.parse(raw) as unknown;
    return normalizeGraphState(parsed) ?? defaultState;
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
    program: state.program,
    nodes: state.nodes,
    edges: state.edges,
    personnel: state.personnel,
    budgetUsd: state.budgetUsd,
    setProgram: (
      updater: ProgramContext | ((current: ProgramContext) => ProgramContext),
    ) => {
      setState((current) => ({
        ...current,
        program:
          typeof updater === 'function' ? updater(current.program) : updater,
      }));
    },
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
    setPersonnel: (
      updater: Personnel[] | ((current: Personnel[]) => Personnel[]),
    ) => {
      setState((current) => ({
        ...current,
        personnel:
          typeof updater === 'function' ? updater(current.personnel) : updater,
      }));
    },
    setBudgetUsd: (
      updater: number | null | ((current: number | null) => number | null),
    ) => {
      setState((current) => ({
        ...current,
        budgetUsd:
          typeof updater === 'function' ? updater(current.budgetUsd) : updater,
      }));
    },
    setGraphState: (
      updater: GraphState | ((current: GraphState) => GraphState),
    ) => {
      setState((current) =>
        typeof updater === 'function' ? updater(current) : updater,
      );
    },
  };
};
