export type FlowNode = {
  id: string;
  title: string;
  content: string;
  cost: number;
  duration: number;
  operators: string[];
  completed: boolean;
  x: number;
  y: number;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
};

export type EditorMode = 'closed' | 'create' | 'edit';
