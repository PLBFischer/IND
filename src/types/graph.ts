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

export type RiskLevel = 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';

export type RiskRecommendation = {
  action: string;
  targetRiskDimension:
    | 'scientific'
    | 'execution'
    | 'regulatory'
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
  overallRisk: RiskLevel;
  fragility: RiskLevel;
  summary: string;
  scientificDrivers: string[];
  executionDrivers: string[];
  regulatoryDrivers: string[];
  fragilityDrivers: string[];
  recommendations: RiskRecommendation[];
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
  overallRisk: RiskLevel;
  fragility: RiskLevel;
  executiveSummary: string;
  detailedReasoning: string;
  scientificBreakdown: string[];
  executionBreakdown: string[];
  regulatoryBreakdown: string[];
  fragilityBreakdown: string[];
  mitigationStrategies: RiskRecommendation[];
  parallelizationOptions: ParallelizationOption[];
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
