import { PersonnelPanel } from './PersonnelPanel';

type ToolbarProps = {
  totalCost: string;
  totalDuration: string;
  personnel: string[];
  onAddPerson: (name: string) => void;
  onRemovePerson: (name: string) => void;
  onAddNode: () => void;
};

export function Toolbar({
  totalCost,
  totalDuration,
  personnel,
  onAddPerson,
  onRemovePerson,
  onAddNode,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__eyebrow">Flow Editor</span>
        <h1>Pipeline Canvas</h1>
      </div>
      <div className="toolbar__actions">
        <div className="toolbar__metrics" aria-label="Flow metrics">
          <div className="toolbar__metric">
            <span>Total Cost</span>
            <strong>{totalCost}</strong>
          </div>
          <div className="toolbar__metric">
            <span>Total Duration</span>
            <strong>{totalDuration}</strong>
          </div>
        </div>
        <PersonnelPanel
          personnel={personnel}
          onAddPerson={onAddPerson}
          onRemovePerson={onRemovePerson}
        />
        <button type="button" className="button button--primary" onClick={onAddNode}>
          Add Node
        </button>
      </div>
    </header>
  );
}
