export type FlowNode = {
  id: string;
  title: string;
  content: string;
  x: number;
  y: number;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
};

export type EditorMode = 'closed' | 'create' | 'edit';
