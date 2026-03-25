import { useMemo } from 'react';
import type {
  EvidenceQueryResponse,
  FlowNode,
} from '../types/graph';

type EvidencePanelProps = {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  query: string;
  response: EvidenceQueryResponse | null;
  nodes: FlowNode[];
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  onReferenceClick: (nodeId: string) => void;
};

export function EvidencePanel({
  isOpen,
  isLoading,
  error,
  query,
  response,
  nodes,
  onClose,
  onQueryChange,
  onSubmit,
  onReferenceClick,
}: EvidencePanelProps) {
  const nodeTitleById = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, node.title])),
    [nodes],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="evidence-panel" aria-label="Evidence query panel">
      <div className="evidence-panel__header">
        <div>
          <span className="toolbar__eyebrow">Evidence</span>
          <h2>Graph-Grounded Query</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="evidence-panel__composer">
        <textarea
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Which nodes support brain penetration?"
          rows={4}
          spellCheck={false}
        />
        <button
          type="button"
          className="button button--primary"
          onClick={onSubmit}
          disabled={isLoading}
        >
          {isLoading ? 'Searching...' : 'Query Evidence'}
        </button>
      </div>

      {error ? <p className="evidence-panel__error">{error}</p> : null}

      {!response && !isLoading && !error ? (
        <div className="evidence-panel__empty">
          <p>
            Ask which nodes support a claim, what is missing for the IND story, or
            which work matters most to the target Phase 1 design.
          </p>
        </div>
      ) : null}

      {response ? (
        <div className="evidence-panel__content">
          <section className="evidence-panel__section">
            <h3>Answer</h3>
            <p>{response.answer}</p>
          </section>

          <section className="evidence-panel__section">
            <h3>Supporting Evidence</h3>
            {response.supportingEvidence.length > 0 ? (
              <div className="evidence-panel__cards">
                {response.supportingEvidence.map((item, index) => (
                  <article
                    key={`${item.nodeId}-${item.field}-${index}`}
                    className="evidence-panel__card"
                  >
                    <div className="evidence-panel__card-header">
                      <button
                        type="button"
                        className="evidence-panel__reference"
                        onClick={() => onReferenceClick(item.nodeId)}
                        title={item.nodeId}
                      >
                        {nodeTitleById[item.nodeId] ?? item.nodeId}
                      </button>
                      <span>{item.field}</span>
                    </div>
                    <p>{item.snippet}</p>
                    <p>{item.rationale}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="evidence-panel__empty-copy">No supporting evidence snippets were returned.</p>
            )}
          </section>

          <section className="evidence-panel__section">
            <h3>Missing Evidence</h3>
            {response.missingEvidence.length > 0 ? (
              <ul className="evidence-panel__list">
                {response.missingEvidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="evidence-panel__empty-copy">No major evidence gaps were highlighted.</p>
            )}
          </section>
        </div>
      ) : null}
    </aside>
  );
}
