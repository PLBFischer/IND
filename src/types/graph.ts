export type Personnel = {
  name: string;
  hoursPerWeek: number;
};

export type FlowNode = {
  id: string;
  title: string;
  content: string;
  results: string;
  cost: number;
  duration: number;
  workHoursPerWeek: number;
  parallelizationMultiplier: 1 | 2 | 3 | 4;
  operators: string[];
  completed: boolean;
  x: number;
  y: number;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  parallelized: boolean;
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

export type ReviewFinding = {
  id: string;
  severity: 'high' | 'medium' | 'low';
  type:
    | 'contradiction'
    | 'outdated_description'
    | 'redundancy'
    | 'instrumentation_risk'
    | 'dependency_mismatch'
    | 'other';
  summary: string;
  details: string;
  suggestedAction: string;
  nodeIds: string[];
};

export type ReviewResponse = {
  findings: ReviewFinding[];
};

export type EditorMode = 'closed' | 'create' | 'edit';
