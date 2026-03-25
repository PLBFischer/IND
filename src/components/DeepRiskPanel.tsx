import type { DeepRiskAnalysis } from '../types/graph';

type DeepRiskPanelProps = {
  analysis: DeepRiskAnalysis | null;
  isLoading: boolean;
  error: string | null;
  nodeTitle: string | null;
  onClose: () => void;
};

const renderList = (items: string[], emptyText: string) =>
  items.length > 0 ? (
    <ul className="deep-risk-panel__list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className="deep-risk-panel__empty">{emptyText}</p>
  );

export function DeepRiskPanel({
  analysis,
  isLoading,
  error,
  nodeTitle,
  onClose,
}: DeepRiskPanelProps) {
  if (!isLoading && !error && !analysis) {
    return null;
  }

  return (
    <aside className="deep-risk-panel" aria-label="Deep risk reasoning panel">
      <div className="deep-risk-panel__header">
        <div>
          <span className="toolbar__eyebrow">Deep Reasoning</span>
          <h2>{nodeTitle ?? 'Risk Assessment'}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose}>
          Close
        </button>
      </div>

      {isLoading ? <p className="deep-risk-panel__text">Evaluating this experiment in depth.</p> : null}
      {error ? <p className="deep-risk-panel__text">{error}</p> : null}

      {analysis ? (
        <div className="deep-risk-panel__content">
          <div className="deep-risk-panel__levels">
            <div>
              <span>Overall Risk</span>
              <strong>{analysis.overallRisk}</strong>
            </div>
            <div>
              <span>Coherence</span>
              <strong>{analysis.coherenceRisk}</strong>
            </div>
            <div>
              <span>Fragility</span>
              <strong>{analysis.fragility}</strong>
            </div>
            <div>
              <span>Scientific</span>
              <strong>{analysis.scientificRisk}</strong>
            </div>
            <div>
              <span>Execution</span>
              <strong>{analysis.executionRisk}</strong>
            </div>
            <div>
              <span>Regulatory</span>
              <strong>{analysis.regulatoryRisk}</strong>
            </div>
          </div>

          <section className="deep-risk-panel__section">
            <h3>Summary</h3>
            <p>{analysis.executiveSummary}</p>
            <p>{analysis.detailedReasoning}</p>
          </section>

          <section className="deep-risk-panel__section">
            <h3>Scientific Breakdown</h3>
            {renderList(analysis.scientificBreakdown, 'No scientific concerns were highlighted.')}
          </section>

          <section className="deep-risk-panel__section">
            <h3>Execution Breakdown</h3>
            {renderList(analysis.executionBreakdown, 'No execution concerns were highlighted.')}
          </section>

          <section className="deep-risk-panel__section">
            <h3>Regulatory Breakdown</h3>
            {renderList(analysis.regulatoryBreakdown, 'No regulatory concerns were highlighted.')}
          </section>

          <section className="deep-risk-panel__section">
            <h3>Phase 1 / IND Coherence</h3>
            {renderList(
              analysis.coherenceBreakdown,
              'No Phase 1 or IND coherence concerns were highlighted.',
            )}
          </section>

          <section className="deep-risk-panel__section">
            <h3>Fragility Breakdown</h3>
            {renderList(analysis.fragilityBreakdown, 'No fragility concerns were highlighted.')}
          </section>

          <section className="deep-risk-panel__section">
            <h3>Key Assumptions Used</h3>
            {renderList(analysis.keyAssumptionsUsed, 'No explicit assumptions were returned.')}
          </section>

          <section className="deep-risk-panel__section">
            <h3>Affected Downstream Claims</h3>
            {renderList(
              analysis.affectedDownstreamClaims,
              'No downstream claims were highlighted.',
            )}
          </section>

          <section className="deep-risk-panel__section">
            <h3>Missing Evidence / Weak Support</h3>
            {renderList(analysis.missingEvidence, 'No obvious evidence gaps were highlighted.')}
          </section>

          <section className="deep-risk-panel__section">
            <h3>Mitigation Strategies</h3>
            {analysis.mitigationStrategies.length > 0 ? (
              <div className="deep-risk-panel__cards">
                {analysis.mitigationStrategies.map((strategy) => (
                  <article key={`${strategy.action}-${strategy.targetRiskDimension}`} className="deep-risk-panel__card">
                    <strong>{strategy.action}</strong>
                    <p>{strategy.expectedEffect}</p>
                    <span>
                      {strategy.targetRiskDimension} | Cost {strategy.costImplication} | {strategy.timelineImpact}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="deep-risk-panel__empty">No mitigation strategies were proposed.</p>
            )}
          </section>

          <section className="deep-risk-panel__section">
            <h3>What Would Resolve Uncertainty</h3>
            {renderList(
              analysis.whatWouldResolveUncertainty,
              'No specific uncertainty-resolution steps were returned.',
            )}
          </section>

          <section className="deep-risk-panel__section">
            <h3>Parallelization Options</h3>
            {analysis.parallelizationOptions.length > 0 ? (
              <div className="deep-risk-panel__cards">
                {analysis.parallelizationOptions.map((option) => (
                  <article key={option.action} className="deep-risk-panel__card">
                    <strong>{option.action}</strong>
                    <p>{option.rationale}</p>
                    <span>Prerequisites: {option.prerequisites}</span>
                    <span>Tradeoffs: {option.tradeoffs}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="deep-risk-panel__empty">No responsible parallelization options were identified.</p>
            )}
          </section>

          <section className="deep-risk-panel__section">
            <h3>Likely Timeline and Spend Impact</h3>
            <div className="deep-risk-panel__cards">
              <article className="deep-risk-panel__card">
                <strong>Timeline</strong>
                <p>{analysis.likelyTimelineImpact}</p>
              </article>
              <article className="deep-risk-panel__card">
                <strong>Spend</strong>
                <p>{analysis.likelySpendImpact}</p>
              </article>
            </div>
          </section>

          <section className="deep-risk-panel__section">
            <h3>Scenarios</h3>
            {analysis.scenarios.length > 0 ? (
              <div className="deep-risk-panel__cards">
                {analysis.scenarios.map((scenario) => (
                  <article key={scenario.label} className="deep-risk-panel__card">
                    <strong>{scenario.label}</strong>
                    <p>{scenario.outlook}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="deep-risk-panel__empty">No scenario analysis was returned.</p>
            )}
          </section>
        </div>
      ) : null}
    </aside>
  );
}
