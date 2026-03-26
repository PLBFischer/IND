type ToolbarProps = {
  totalCostDisplay: string;
  plannedDuration: string;
  isAssigning: boolean;
  canAssign: boolean;
  isAssignedView: boolean;
  isAccelerating: boolean;
  canAccelerate: boolean;
  isEvidenceOpen: boolean;
  isReviewOpen: boolean;
  isReviewing: boolean;
  isTimelineOpen: boolean;
  onAssign: () => void;
  onAccelerate: () => void;
  onToggleEvidence: () => void;
  onToggleReview: () => void;
  onToggleTimeline: () => void;
  onAddExperimentNode: () => void;
  onAddPathwayNode: () => void;
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
  isReviewOpen,
  isReviewing,
  isTimelineOpen,
  onAssign,
  onAccelerate,
  onToggleEvidence,
  onToggleReview,
  onToggleTimeline,
  onAddExperimentNode,
  onAddPathwayNode,
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
          Evidence
        </button>
        <button
          type="button"
          className={isReviewOpen ? 'button button--primary' : 'button'}
          onClick={onToggleReview}
        >
          {isReviewing && isReviewOpen ? 'Reviewing...' : 'Review'}
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
        <button type="button" className="button button--primary" onClick={onAddExperimentNode}>
          Add Experiment
        </button>
      </div>
    </header>
  );
}
