import { useEffect, useState } from 'react';
import type {
  EditorMode,
  ExperimentNode,
  NodeRiskAssessment,
  Personnel,
} from '../types/graph';
import {
  BLOCKER_PRIORITY_LABELS,
  BLOCKER_PRIORITY_OPTIONS,
  NODE_STATUS_LABELS,
  NODE_STATUS_OPTIONS,
  NODE_TYPE_LABELS,
  NODE_TYPE_OPTIONS,
} from '../types/graph';
import { isActiveNodeStatus } from '../utils/graph';

type NodeEditorProps = {
  mode: EditorMode;
  node: ExperimentNode | null;
  personnel: Personnel[];
  riskAssessment: NodeRiskAssessment | null;
  isRiskLoading: boolean;
  riskError: string | null;
  showParallelizationMultiplier: boolean;
  isConnectMode: boolean;
  isParallelizeMode: boolean;
  onClose: () => void;
  onSave: (values: Omit<ExperimentNode, 'id' | 'x' | 'y'>) => void;
  onDelete: () => void;
  onStartConnect: () => void;
  onStartParallelize: () => void;
  onCancelConnect: () => void;
};

const splitEvidenceRefs = (value: string) =>
  value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);

export function NodeEditor({
  mode,
  node,
  personnel,
  riskAssessment,
  isRiskLoading,
  riskError,
  showParallelizationMultiplier,
  isConnectMode,
  isParallelizeMode,
  onClose,
  onSave,
  onDelete,
  onStartConnect,
  onStartParallelize,
  onCancelConnect,
}: NodeEditorProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ExperimentNode['type']>('other');
  const [objective, setObjective] = useState('');
  const [procedureSummary, setProcedureSummary] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [decisionSupported, setDecisionSupported] = useState('');
  const [results, setResults] = useState('');
  const [operationalNotes, setOperationalNotes] = useState('');
  const [cost, setCost] = useState('0');
  const [duration, setDuration] = useState('0');
  const [workHoursPerWeek, setWorkHoursPerWeek] = useState('40');
  const [parallelizationMultiplier, setParallelizationMultiplier] = useState<1 | 2 | 3 | 4>(1);
  const [operators, setOperators] = useState<string[]>([]);
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState<ExperimentNode['status']>('planned');
  const [actualStartWeek, setActualStartWeek] = useState('');
  const [blockerPriority, setBlockerPriority] = useState<ExperimentNode['blockerPriority']>('supporting');
  const [phase1Relevance, setPhase1Relevance] = useState('');
  const [indRelevance, setIndRelevance] = useState('');
  const [evidenceRefsText, setEvidenceRefsText] = useState('');
  const [isOperatorMenuOpen, setIsOperatorMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'edit' && node) {
      setTitle(node.title);
      setType(node.type);
      setObjective(node.objective);
      setProcedureSummary(node.procedureSummary);
      setSuccessCriteria(node.successCriteria);
      setDecisionSupported(node.decisionSupported);
      setResults(node.results);
      setOperationalNotes(node.operationalNotes);
      setCost(`${node.cost}`);
      setDuration(`${node.duration}`);
      setWorkHoursPerWeek(`${node.workHoursPerWeek}`);
      setParallelizationMultiplier(node.parallelizationMultiplier);
      setOperators(node.operators);
      setOwner(node.owner ?? '');
      setStatus(node.status);
      setActualStartWeek(
        node.actualStartWeek !== null && node.actualStartWeek !== undefined
          ? `${node.actualStartWeek}`
          : '',
      );
      setBlockerPriority(node.blockerPriority);
      setPhase1Relevance(node.phase1Relevance);
      setIndRelevance(node.indRelevance);
      setEvidenceRefsText(node.evidenceRefs.join('\n'));
      setIsOperatorMenuOpen(false);
      setError(null);
      return;
    }

    if (mode === 'create') {
      setTitle('');
      setType('other');
      setObjective('');
      setProcedureSummary('');
      setSuccessCriteria('');
      setDecisionSupported('');
      setResults('');
      setOperationalNotes('');
      setCost('0');
      setDuration('0');
      setWorkHoursPerWeek('40');
      setParallelizationMultiplier(1);
      setOperators([]);
      setOwner('');
      setStatus('planned');
      setActualStartWeek('');
      setBlockerPriority('supporting');
      setPhase1Relevance('');
      setIndRelevance('');
      setEvidenceRefsText('');
      setIsOperatorMenuOpen(false);
      setError(null);
    }
  }, [mode, node]);

  useEffect(() => {
    setOperators((current) =>
      current.filter((operator) => personnel.some((person) => person.name === operator)),
    );
  }, [personnel]);

  useEffect(() => {
    if (!showParallelizationMultiplier) {
      setParallelizationMultiplier(1);
    }
  }, [showParallelizationMultiplier]);

  if (mode === 'closed') {
    return null;
  }

  const isEditing = mode === 'edit' && node;
  const isRiskEligible = Boolean(node && isActiveNodeStatus(node.status));

  return (
    <aside className="editor" aria-label={isEditing ? 'Edit node' : 'Create node'}>
      <div className="editor__header">
        <div>
          <span className="editor__eyebrow">{isEditing ? 'Selected Node' : 'New Node'}</span>
          <h2>{isEditing ? 'Edit Node' : 'Add Node'}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close editor">
          Close
        </button>
      </div>

      {isConnectMode && isEditing ? (
        <div className="editor__notice">
          <p>Select a target node to create a connection.</p>
          <button type="button" className="button" onClick={onCancelConnect}>
            Cancel Connect
          </button>
        </div>
      ) : null}

      {isParallelizeMode && isEditing ? (
        <div className="editor__notice">
          <p>Select an existing predecessor to toggle parallelization on that edge.</p>
          <button type="button" className="button" onClick={onCancelConnect}>
            Cancel Parallelize
          </button>
        </div>
      ) : null}

      <form
        className="editor__form"
        onSubmit={(event) => {
          event.preventDefault();

          const nextTitle = title.trim();
          if (!nextTitle) {
            setError('Title is required.');
            return;
          }

          const nextCost = Number(cost);
          const nextDuration = Number(duration);
          const nextWorkHoursPerWeek = Number(workHoursPerWeek);
          const nextActualStartWeek = actualStartWeek.trim()
            ? Number(actualStartWeek)
            : null;

          if (
            !Number.isFinite(nextCost) ||
            !Number.isFinite(nextDuration) ||
            !Number.isFinite(nextWorkHoursPerWeek)
          ) {
            setError('Cost, duration, and weekly work hours must be valid numbers.');
            return;
          }

          if (nextCost < 0 || nextDuration < 0 || nextWorkHoursPerWeek < 0) {
            setError('Cost, duration, and weekly work hours cannot be negative.');
            return;
          }

          if (
            nextActualStartWeek !== null &&
            (!Number.isFinite(nextActualStartWeek) || nextActualStartWeek < 1)
          ) {
            setError('Actual start week must be a valid week number.');
            return;
          }

          onSave({
            nodeKind: 'experiment',
            title: nextTitle,
            type,
            objective: objective.trim(),
            procedureSummary: procedureSummary.trim(),
            successCriteria: successCriteria.trim(),
            decisionSupported: decisionSupported.trim(),
            results: results.trim(),
            operationalNotes: operationalNotes.trim(),
            cost: nextCost,
            duration: nextDuration,
            workHoursPerWeek: nextWorkHoursPerWeek,
            parallelizationMultiplier,
            operators,
            owner: owner.trim() || undefined,
            status,
            actualStartWeek: nextActualStartWeek,
            blockerPriority,
            phase1Relevance: phase1Relevance.trim(),
            indRelevance: indRelevance.trim(),
            evidenceRefs: splitEvidenceRefs(evidenceRefsText),
          });
        }}
      >
        <section className="editor__section">
          <div className="editor__section-header">
            <h3>Basics</h3>
            <span>Scheduling and node identity</span>
          </div>
          <label className="field">
            <span>Title</span>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              placeholder="14-day dose-range finding tox"
            />
          </label>

          <div className="editor__section-grid editor__section-grid--two">
            <label className="field">
              <span>Type</span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ExperimentNode['type'])}
              >
                {NODE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {NODE_TYPE_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as ExperimentNode['status'])}
              >
                {NODE_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {NODE_STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="editor__section">
          <div className="editor__section-header">
            <h3>Scientific Intent</h3>
            <span>What this work is meant to establish</span>
          </div>
          <label className="field">
            <span>Objective</span>
            <textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              rows={3}
              placeholder="Establish whether oral dosing reaches the intended exposure margin."
            />
          </label>

          <label className="field">
            <span>Procedure Summary</span>
            <textarea
              value={procedureSummary}
              onChange={(event) => setProcedureSummary(event.target.value)}
              rows={4}
              placeholder="Single-dose mouse PK with plasma and brain sampling across 8 hours."
            />
          </label>

          <label className="field">
            <span>Success Criteria</span>
            <textarea
              value={successCriteria}
              onChange={(event) => setSuccessCriteria(event.target.value)}
              rows={3}
              placeholder="Free brain exposure clears the projected efficacious concentration."
            />
          </label>

          <label className="field">
            <span>Decision Supported</span>
            <textarea
              value={decisionSupported}
              onChange={(event) => setDecisionSupported(event.target.value)}
              rows={3}
              placeholder="Supports brain penetration claim and informs starting dose selection."
            />
          </label>
        </section>

        <section className="editor__section">
          <div className="editor__section-header">
            <h3>Operational Planning</h3>
            <span>Execution details and constraints</span>
          </div>
          <label className="field">
            <span>Operational Notes</span>
            <textarea
              value={operationalNotes}
              onChange={(event) => setOperationalNotes(event.target.value)}
              rows={3}
              placeholder="CRO slot may slip if not confirmed this week."
            />
          </label>

          <div className="editor__section-grid editor__section-grid--two">
            <label className="field">
              <span>Cost (USD)</span>
              <input
                type="number"
                step="any"
                min="0"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                placeholder="0"
              />
            </label>

            <label className="field">
              <span>Duration (weeks)</span>
              <input
                type="number"
                step="any"
                min="0"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                placeholder="0"
              />
            </label>
          </div>

          <div className="editor__section-grid editor__section-grid--two">
            <label className="field">
              <span>Work Required Per Week (hours)</span>
              <input
                type="number"
                step="any"
                min="0"
                value={workHoursPerWeek}
                onChange={(event) => setWorkHoursPerWeek(event.target.value)}
                placeholder="40"
              />
            </label>

            <label className="field">
              <span>Blocker Priority</span>
              <select
                value={blockerPriority}
                onChange={(event) =>
                  setBlockerPriority(event.target.value as ExperimentNode['blockerPriority'])
                }
              >
                {BLOCKER_PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {BLOCKER_PRIORITY_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="editor__section-grid editor__section-grid--two">
            <label className="field">
              <span>Owner</span>
              <input
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                placeholder="Current owner or assignee"
              />
            </label>

            <label className="field">
              <span>Actual Start Week</span>
              <input
                type="number"
                step="1"
                min="1"
                value={actualStartWeek}
                onChange={(event) => setActualStartWeek(event.target.value)}
                placeholder="Set when work has started"
              />
            </label>

            {showParallelizationMultiplier ? (
              <label className="field">
                <span>Parallelization Multiplier</span>
                <select
                  value={parallelizationMultiplier}
                  onChange={(event) =>
                    setParallelizationMultiplier(Number(event.target.value) as 1 | 2 | 3 | 4)
                  }
                >
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={3}>3x</option>
                  <option value={4}>4x</option>
                </select>
              </label>
            ) : null}
          </div>

          <div className="field">
            <span>Eligible Operators</span>
            <div className="multi-select">
              <button
                type="button"
                className={`multi-select__trigger ${
                  isOperatorMenuOpen ? 'multi-select__trigger--open' : ''
                }`}
                onClick={() => setIsOperatorMenuOpen((current) => !current)}
              >
                {operators.length > 0 ? operators.join(', ') : 'Select eligible operators'}
              </button>
              {isOperatorMenuOpen ? (
                <div className="multi-select__menu">
                  {personnel.length === 0 ? (
                    <p className="multi-select__empty">Add personnel to assign operators.</p>
                  ) : (
                    personnel.map((person) => (
                      <label key={person.name} className="multi-select__option">
                        <input
                          type="checkbox"
                          checked={operators.includes(person.name)}
                          onChange={(event) => {
                            setOperators((current) =>
                              event.target.checked
                                ? [...current, person.name]
                                : current.filter((operator) => operator !== person.name),
                            );
                          }}
                        />
                        <span>{person.name}</span>
                      </label>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="editor__section">
          <div className="editor__section-header">
            <h3>Results and Evidence</h3>
            <span>Current findings and supporting references</span>
          </div>
          <label className="field">
            <span>Results</span>
            <textarea
              value={results}
              onChange={(event) => setResults(event.target.value)}
              rows={4}
              placeholder="Interim findings, observed liabilities, or final readouts."
            />
          </label>

          <label className="field">
            <span>Evidence References</span>
            <textarea
              value={evidenceRefsText}
              onChange={(event) => setEvidenceRefsText(event.target.value)}
              rows={4}
              placeholder="One citation, dataset, or note per line"
            />
          </label>
        </section>

        <section className="editor__section">
          <div className="editor__section-header">
            <h3>Program Relevance</h3>
            <span>Why this matters for the clinic-bound story</span>
          </div>
          <label className="field">
            <span>Phase 1 Relevance</span>
            <textarea
              value={phase1Relevance}
              onChange={(event) => setPhase1Relevance(event.target.value)}
              rows={3}
              placeholder="How this node supports the intended first-in-human design."
            />
          </label>

          <label className="field">
            <span>IND Relevance</span>
            <textarea
              value={indRelevance}
              onChange={(event) => setIndRelevance(event.target.value)}
              rows={3}
              placeholder="How this node contributes to the IND story or safety narrative."
            />
          </label>
        </section>

        {error ? <p className="field-error">{error}</p> : null}

        <div className="editor__actions">
          <button type="submit" className="button button--primary">
            {isEditing ? 'Update Node' : 'Create Node'}
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>

      {isEditing ? (
        <div className="editor__footer">
          {isRiskEligible ? (
            <div className="editor__risk-summary">
              <div className="editor__risk-header">
                <div>
                  <span className="editor__eyebrow">Risk Snapshot</span>
                  <h3>Scientific and Operational Risk</h3>
                </div>
              </div>
              {isRiskLoading ? <p className="editor__risk-text">Refreshing risk scores.</p> : null}
              {riskError ? <p className="editor__risk-text">{riskError}</p> : null}
              {riskAssessment ? (
                <>
                  <div className="editor__risk-grid">
                    <div>
                      <span>Scientific Risk</span>
                      <strong>{riskAssessment.scientificRisk}</strong>
                    </div>
                    <div>
                      <span>Operational Risk</span>
                      <strong>{riskAssessment.executionRisk}</strong>
                    </div>
                  </div>
                  <p className="editor__risk-text">{riskAssessment.summary}</p>
                  {riskAssessment.keyAssumptions.length > 0 ? (
                    <p className="editor__risk-text">
                      Assumptions: {riskAssessment.keyAssumptions.join(' | ')}
                    </p>
                  ) : null}
                  {riskAssessment.affectedClaims.length > 0 ? (
                    <p className="editor__risk-text">
                      Affected claims: {riskAssessment.affectedClaims.join(' | ')}
                    </p>
                  ) : null}
                  {riskAssessment.changeSummary ? (
                    <p className="editor__risk-change">{riskAssessment.changeSummary}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : (
            <div className="editor__risk-summary">
              <p className="editor__risk-text">
                Risk snapshots are only available for nodes that are still active in the plan.
              </p>
            </div>
          )}
          <div className="editor__footer-actions">
            <button type="button" className="button" onClick={onStartConnect}>
              Connect
            </button>
            <button type="button" className="button" onClick={onStartParallelize}>
              Parallelize
            </button>
            <button type="button" className="button button--danger" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
