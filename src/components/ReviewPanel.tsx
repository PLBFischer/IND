import { useMemo } from 'react';
import type { FlowNode, ReviewFinding } from '../types/graph';

type ReviewPanelProps = {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  findings: ReviewFinding[];
  nodes: FlowNode[];
  onClose: () => void;
  onRefresh: () => void;
  onReferenceClick: (nodeId: string) => void;
};

export function ReviewPanel({
  isOpen,
  isLoading,
  error,
  findings,
  nodes,
  onClose,
  onRefresh,
  onReferenceClick,
}: ReviewPanelProps) {
  const nodeTitleById = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, node.title])),
    [nodes],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="review-panel" aria-label="Graph review panel">
      <div className="review-panel__header">
        <div>
          <span className="toolbar__eyebrow">Review</span>
          <h2>Contradictions and Redundancies</h2>
        </div>
        <div className="review-panel__actions">
          <button type="button" className="button" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Reviewing...' : 'Refresh'}
          </button>
          <button type="button" className="icon-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {error ? <p className="review-panel__error">{error}</p> : null}

      <div className="review-panel__findings">
        {isLoading && findings.length === 0 ? (
          <p className="review-panel__empty">Reviewing the graph for contradictions and redundancies.</p>
        ) : null}
        {!isLoading && findings.length === 0 && !error ? (
          <p className="review-panel__empty">No issues flagged yet.</p>
        ) : null}

        {findings.map((finding) => (
          <article key={finding.id} className="review-panel__finding">
            <div className="review-panel__finding-header">
              <span className={`review-panel__severity review-panel__severity--${finding.severity}`}>
                {finding.severity}
              </span>
              <span className="review-panel__type">{finding.type.replace(/_/g, ' ')}</span>
            </div>
            <strong>{finding.summary}</strong>
            <p>{finding.details}</p>
            {finding.suggestedAction ? (
              <p className="review-panel__action">
                <span>Suggested action</span>
                {finding.suggestedAction}
              </p>
            ) : null}
            {finding.nodeIds.length > 0 ? (
              <div className="review-panel__references">
                {finding.nodeIds.map((nodeId) => (
                  <button
                    key={nodeId}
                    type="button"
                    className="review-panel__reference"
                    onClick={() => onReferenceClick(nodeId)}
                    title={nodeId}
                  >
                    {nodeTitleById[nodeId] ?? nodeId}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </aside>
  );
}
