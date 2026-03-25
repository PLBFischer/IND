export type Personnel = {
  name: string;
  hoursPerWeek: number;
};

export type FlowNode = {
  id: string;
  title: string;
  content: string;
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
  sourceNodeId: string;
  sourceTitle: string;
  targetNodeId: string;
  targetTitle: string;
  multiplier: 1;
  resultingPlannedCost: number;
  resultingPlannedDuration: number;
  deltaCost: number;
  deltaDuration: number;
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

export type EditorMode = 'closed' | 'create' | 'edit';
