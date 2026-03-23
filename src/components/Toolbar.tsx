type ToolbarProps = {
  onAddNode: () => void;
};

export function Toolbar({ onAddNode }: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__eyebrow">Flow Editor</span>
        <h1>Pipeline Canvas</h1>
      </div>
      <button type="button" className="button button--primary" onClick={onAddNode}>
        Add Node
      </button>
    </header>
  );
}
