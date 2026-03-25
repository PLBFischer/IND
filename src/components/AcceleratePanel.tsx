import { formatMetric } from '../utils/metrics';
import type { AccelerationProposal } from '../types/graph';

type AcceleratePanelProps = {
  proposal: AccelerationProposal | null;
  isLoading: boolean;
  error: string | null;
  stopReason: string | null;
  onAccept: () => void;
  onReject: () => void;
  onStop: () => void;
};

export function AcceleratePanel({
  proposal,
  isLoading,
  error,
  stopReason,
  onAccept,
  onReject,
  onStop,
}: AcceleratePanelProps) {
  if (!isLoading && !proposal && !error && !stopReason) {
    return null;
  }

  return (
    <aside className="accelerate-panel" aria-label="Accelerate agent">
      <div className="accelerate-panel__header">
        <div>
          <span className="toolbar__eyebrow">Accelerate</span>
          <h2>Parallelization Proposal</h2>
        </div>
        <button type="button" className="icon-button" onClick={onStop}>
          Stop
        </button>
      </div>

      {isLoading ? <p className="accelerate-panel__text">Evaluating the next best acceleration step.</p> : null}
      {error ? <p className="accelerate-panel__text">{error}</p> : null}
      {stopReason ? <p className="accelerate-panel__text">{stopReason}</p> : null}

      {proposal ? (
        <>
          <div className="accelerate-panel__summary">
            <strong>{proposal.summary}</strong>
            <span>
              {proposal.sourceTitle} → {proposal.targetTitle}
            </span>
          </div>
          <div className="accelerate-panel__metrics">
            <div>
              <span>Duration Change</span>
              <strong>-{formatMetric(proposal.deltaDuration)} weeks</strong>
            </div>
            <div>
              <span>Cost Change</span>
              <strong>+${formatMetric(proposal.deltaCost)}</strong>
            </div>
            <div>
              <span>Resulting Cost</span>
              <strong>${formatMetric(proposal.resultingPlannedCost)}</strong>
            </div>
            <div>
              <span>Resulting Duration</span>
              <strong>{formatMetric(proposal.resultingPlannedDuration)} weeks</strong>
            </div>
          </div>
          <p className="accelerate-panel__text">{proposal.rationale}</p>
          <div className="accelerate-panel__footer">
            <button type="button" className="button button--primary" onClick={onAccept}>
              Accept
            </button>
            <button type="button" className="button" onClick={onReject}>
              Reject
            </button>
          </div>
        </>
      ) : null}
    </aside>
  );
}
