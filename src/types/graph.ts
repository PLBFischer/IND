import type {
  PathwayBuildResponse,
  PathwayGraph,
  PathwayPaperSource,
  PathwayQueryHistoryItem,
  PathwayQueryResponse,
  PathwaySanityReport,
} from './pathway';

export const NODE_KIND_OPTIONS = [
  'experiment',
  'biological_pathway',
] as const;

export type NodeKind = (typeof NODE_KIND_OPTIONS)[number];

export const NODE_TYPE_OPTIONS = [
  'in_vitro',
  'in_vivo',
  'pk',
  'tox',
  'safety_pharmacology',
  'efficacy',
  'formulation_cmc',
  'bioanalysis',
  'regulatory',
  'other',
] as const;

export type NodeType = (typeof NODE_TYPE_OPTIONS)[number];

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  in_vitro: 'In vitro',
  in_vivo: 'In vivo',
  pk: 'PK',
  tox: 'Tox',
  safety_pharmacology: 'Safety pharmacology',
  efficacy: 'Efficacy',
  formulation_cmc: 'Formulation / CMC',
  bioanalysis: 'Bioanalysis',
  regulatory: 'Regulatory',
  other: 'Other',
};

export const NODE_STATUS_OPTIONS = [
  'planned',
  'in_progress',
  'blocked',
  'completed',
  'failed',
  'canceled',
] as const;

export type NodeStatus = (typeof NODE_STATUS_OPTIONS)[number];

export const NODE_STATUS_LABELS: Record<NodeStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  blocked: 'Blocked',
  completed: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
};

export const BLOCKER_PRIORITY_OPTIONS = [
  'critical',
  'supporting',
  'exploratory',
] as const;

export type BlockerPriority = (typeof BLOCKER_PRIORITY_OPTIONS)[number];

export const BLOCKER_PRIORITY_LABELS: Record<BlockerPriority, string> = {
  critical: 'Critical',
  supporting: 'Supporting',
  exploratory: 'Exploratory',
};

export type ProgramContext = {
  programTitle?: string;
  targetPhase1Design: string;
  targetIndStrategy: string;
  currentWeek: number;
};

export type Personnel = {
  name: string;
  hoursPerWeek: number;
};

export type BaseNode = {
  id: string;
  title: string;
  x: number;
  y: number;
  nodeKind: NodeKind;
};

export type ExperimentNode = BaseNode & {
  nodeKind: 'experiment';
  type: NodeType;
  objective: string;
  procedureSummary: string;
  successCriteria: string;
  decisionSupported: string;
  results: string;
  operationalNotes: string;
  cost: number;
  duration: number;
  workHoursPerWeek: number;
  parallelizationMultiplier: 1 | 2 | 3 | 4;
  operators: string[];
  owner?: string;
  status: NodeStatus;
  actualStartWeek?: number | null;
  blockerPriority: BlockerPriority;
  phase1Relevance: string;
  indRelevance: string;
  evidenceRefs: string[];
  linkedPathwayNodeIds?: string[];
};

export type BiologicalPathwayNode = BaseNode & {
  nodeKind: 'biological_pathway';
  summary?: string;
  focusTerms?: string[];
  paperSources: PathwayPaperSource[];
  extractionStatus: 'empty' | 'building' | 'ready' | 'error';
  extractionError?: string | null;
  pathwayGraph?: PathwayGraph | null;
  sanityReport?: PathwaySanityReport | null;
  queryHistory?: PathwayQueryHistoryItem[];
  lastBuiltAt?: string | null;
  linkedExperimentNodeIds?: string[];
  lastBuildResponse?: PathwayBuildResponse | null;
  latestQueryResponse?: PathwayQueryResponse | null;
};

export type FlowNode = ExperimentNode | BiologicalPathwayNode;

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  parallelized: boolean;
};

export type GraphPayload = {
  program: ProgramContext;
  personnel: Personnel[];
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type ScheduledNode = {
  nodeId: string;
  assignedOperator: string | null;
  usesPersonnel: boolean;
  start: number;
  finish: number;
};

export type ScheduleResult = {
  makespan: number;
  nodes: ScheduledNode[];
  diagnostics: string[];
};

export type AccelerationProposal = {
  candidateId: string;
  edgeId: string;
  sourceNodeId: string;
  sourceTitle: string;
  targetNodeId: string;
  targetTitle: string;
  multiplier: 1 | 2 | 3 | 4;
  resultingPlannedCost: number;
  resultingPlannedDuration: number;
  deltaCost: number;
  deltaDuration: number;
  estimatedSuccessProbability: number;
  expectedPlannedDuration: number;
  summary: string;
  rationale: string;
  confidence: 'low' | 'medium' | 'high';
  fallbackUsed: boolean;
};

export type RiskLevel = 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';

export type RiskRecommendation = {
  action: string;
  targetRiskDimension:
    | 'scientific'
    | 'execution'
    | 'regulatory'
    | 'coherence'
    | 'fragility'
    | 'cross_cutting';
  expectedEffect: string;
  costImplication: 'Low' | 'Medium' | 'High';
  timelineImpact: 'reduces delay' | 'prevents rework' | 'neutral';
};

export type NodeRiskAssessment = {
  nodeId: string;
  scientificRisk: RiskLevel;
  executionRisk: RiskLevel;
  regulatoryRisk: RiskLevel;
  coherenceRisk: RiskLevel;
  overallRisk: RiskLevel;
  fragility: RiskLevel;
  summary: string;
  scientificDrivers: string[];
  executionDrivers: string[];
  regulatoryDrivers: string[];
  coherenceDrivers: string[];
  fragilityDrivers: string[];
  recommendations: RiskRecommendation[];
  keyAssumptions: string[];
  affectedClaims: string[];
  changeSummary: string;
};

export type RiskScanResponse = {
  assessments: NodeRiskAssessment[];
};

export type ParallelizationOption = {
  action: string;
  rationale: string;
  prerequisites: string;
  tradeoffs: string;
};

export type ScenarioAssessment = {
  label: 'conservative' | 'base' | 'optimistic';
  outlook: string;
};

export type DeepRiskAnalysis = {
  nodeId: string;
  scientificRisk: RiskLevel;
  executionRisk: RiskLevel;
  regulatoryRisk: RiskLevel;
  coherenceRisk: RiskLevel;
  overallRisk: RiskLevel;
  fragility: RiskLevel;
  executiveSummary: string;
  detailedReasoning: string;
  scientificBreakdown: string[];
  executionBreakdown: string[];
  regulatoryBreakdown: string[];
  coherenceBreakdown: string[];
  fragilityBreakdown: string[];
  keyAssumptionsUsed: string[];
  affectedDownstreamClaims: string[];
  missingEvidence: string[];
  mitigationStrategies: RiskRecommendation[];
  parallelizationOptions: ParallelizationOption[];
  whatWouldResolveUncertainty: string[];
  likelyTimelineImpact: string;
  likelySpendImpact: string;
  scenarios: ScenarioAssessment[];
};

export type DeepRiskResponse = {
  analysis: DeepRiskAnalysis;
};

export type AccelerateResponse = {
  proposal: AccelerationProposal | null;
  stopReason: string | null;
  baselinePlannedCost: number;
  baselinePlannedDuration: number;
  candidateCount: number;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  referencedNodeIds: string[];
};

export type ChatResponse = {
  message: ChatMessage;
};

export type EvidenceReference = {
  nodeId: string;
  field: string;
  snippet: string;
  rationale: string;
};

export type EvidenceQueryResponse = {
  answer: string;
  supportingEvidence: EvidenceReference[];
  missingEvidence: string[];
  referencedNodeIds: string[];
};

export type EditorMode = 'closed' | 'create' | 'edit';
