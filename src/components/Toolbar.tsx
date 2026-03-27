type ToolbarProps = {
  totalCostDisplay: string;
  plannedDuration: string;
  isAssigning: boolean;
  canAssign: boolean;
  isAssignedView: boolean;
  isAccelerating: boolean;
  canAccelerate: boolean;
  isEvidenceOpen: boolean;
  isTimelineOpen: boolean;
  onAssign: () => void;
  onAccelerate: () => void;
  onToggleEvidence: () => void;
  onToggleTimeline: () => void;
  onAddExperimentNode: () => void;
  onAddPathwayNode: () => void;
  onAddDataNode: () => void;
};

export function Toolbar({
  totalCostDisplay,
  plannedDuration,
  isAssigning,
  canAssign,
  isAssignedView,
  isAccelerating,
  canAccelerate,
  isEvidenceOpen,
  isTimelineOpen,
  onAssign,
  onAccelerate,
  onToggleEvidence,
  onToggleTimeline,
  onAddExperimentNode,
  onAddPathwayNode,
  onAddDataNode,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__eyebrow">Translational Program Cockpit</span>
        <h1>Fastest Credible Path to Phase 1</h1>
      </div>
      <div className="toolbar__actions">
        <div className="toolbar__metrics" aria-label="Flow metrics">
          <div className="toolbar__metric">
            <span>Total Cost / Budget</span>
            <strong>{totalCostDisplay}</strong>
          </div>
          <div className="toolbar__metric">
            <span>Planned Duration</span>
            <strong>{plannedDuration}</strong>
          </div>
        </div>
        <button
          type="button"
          className={isAssignedView ? 'button button--primary' : 'button'}
          onClick={onAssign}
          disabled={!canAssign || isAssigning}
        >
          {isAssigning ? 'Assigning...' : 'Assign'}
        </button>
        <button
          type="button"
          className={isAccelerating ? 'button button--primary' : 'button'}
          onClick={onAccelerate}
          disabled={!canAccelerate && !isAccelerating}
        >
          {isAccelerating ? 'Stop' : 'Accelerate'}
        </button>
        <button
          type="button"
          className={isEvidenceOpen ? 'button button--primary' : 'button'}
          onClick={onToggleEvidence}
        >
          Query
        </button>
        <button
          type="button"
          className={isTimelineOpen ? 'button button--primary' : 'button'}
          onClick={onToggleTimeline}
        >
          Timeline
        </button>
        <button type="button" className="button" onClick={onAddPathwayNode}>
          Add Pathway
        </button>
        <button type="button" className="button" onClick={onAddDataNode}>
          Add Data
        </button>
        <button type="button" className="button button--primary" onClick={onAddExperimentNode}>
          Add Experiment
        </button>
      </div>
    </header>
  );
}
