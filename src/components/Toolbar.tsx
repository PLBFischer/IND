import { PersonnelPanel } from './PersonnelPanel';

type ToolbarProps = {
  plannedCost: string;
  plannedDuration: string;
  personnel: string[];
  isAssigning: boolean;
  canAssign: boolean;
  isAssignedView: boolean;
  onAddPerson: (name: string) => void;
  onRemovePerson: (name: string) => void;
  onAssign: () => void;
  onAddNode: () => void;
};

export function Toolbar({
  plannedCost,
  plannedDuration,
  personnel,
  isAssigning,
  canAssign,
  isAssignedView,
  onAddPerson,
  onRemovePerson,
  onAssign,
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
            <span>Planned Cost</span>
            <strong>{plannedCost}</strong>
          </div>
          <div className="toolbar__metric">
            <span>Planned Duration</span>
            <strong>{plannedDuration}</strong>
          </div>
        </div>
        <PersonnelPanel
          personnel={personnel}
          onAddPerson={onAddPerson}
          onRemovePerson={onRemovePerson}
        />
        <button
          type="button"
          className={isAssignedView ? 'button button--primary' : 'button'}
          onClick={onAssign}
          disabled={!canAssign || isAssigning}
        >
          {isAssigning ? 'Assigning...' : 'Assign'}
        </button>
        <button type="button" className="button button--primary" onClick={onAddNode}>
          Add Node
        </button>
      </div>
    </header>
  );
}
