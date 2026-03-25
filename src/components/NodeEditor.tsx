import { useEffect, useState } from 'react';
import type { EditorMode, FlowNode, NodeRiskAssessment, Personnel } from '../types/graph';

type NodeEditorProps = {
  mode: EditorMode;
  node: FlowNode | null;
  personnel: Personnel[];
  riskAssessment: NodeRiskAssessment | null;
  isRiskLoading: boolean;
  riskError: string | null;
  isDeepReasoningLoading: boolean;
  showParallelizationMultiplier: boolean;
  isConnectMode: boolean;
  isParallelizeMode: boolean;
  onClose: () => void;
  onSave: (values: {
    title: string;
    content: string;
    results: string;
    cost: number;
    duration: number;
    workHoursPerWeek: number;
    parallelizationMultiplier: 1 | 2 | 3 | 4;
    operators: string[];
    completed: boolean;
  }) => void;
  onDelete: () => void;
  onStartConnect: () => void;
  onStartParallelize: () => void;
  onCancelConnect: () => void;
  onDeepReasoning: () => void;
};

export function NodeEditor({
  mode,
  node,
  personnel,
  riskAssessment,
  isRiskLoading,
  riskError,
  isDeepReasoningLoading,
  showParallelizationMultiplier,
  isConnectMode,
  isParallelizeMode,
  onClose,
  onSave,
  onDelete,
  onStartConnect,
  onStartParallelize,
  onCancelConnect,
  onDeepReasoning,
}: NodeEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [results, setResults] = useState('');
  const [cost, setCost] = useState('0');
  const [duration, setDuration] = useState('0');
  const [workHoursPerWeek, setWorkHoursPerWeek] = useState('40');
  const [parallelizationMultiplier, setParallelizationMultiplier] = useState<1 | 2 | 3 | 4>(1);
  const [operators, setOperators] = useState<string[]>([]);
  const [isOperatorMenuOpen, setIsOperatorMenuOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'edit' && node) {
      setTitle(node.title);
      setContent(node.content);
      setResults(node.results);
      setCost(`${node.cost}`);
      setDuration(`${node.duration}`);
      setWorkHoursPerWeek(`${node.workHoursPerWeek}`);
      setParallelizationMultiplier(node.parallelizationMultiplier);
      setOperators(node.operators);
      setIsOperatorMenuOpen(false);
      setCompleted(node.completed);
      setError(null);
      return;
    }

    if (mode === 'create') {
      setTitle('');
      setContent('');
      setResults('');
      setCost('0');
      setDuration('0');
      setWorkHoursPerWeek('40');
      setParallelizationMultiplier(1);
      setOperators([]);
      setIsOperatorMenuOpen(false);
      setCompleted(false);
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

          if (
            !Number.isFinite(nextCost) ||
            !Number.isFinite(nextDuration) ||
            !Number.isFinite(nextWorkHoursPerWeek)
          ) {
            setError('Cost, duration, and weekly work hours must be valid numbers.');
            return;
          }

          onSave({
            title: nextTitle,
            content: content.trim(),
            results: results.trim(),
            cost: nextCost,
            duration: nextDuration,
            workHoursPerWeek: nextWorkHoursPerWeek,
            parallelizationMultiplier,
            operators,
            completed,
          });
        }}
      >
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
            placeholder="Transformation"
          />
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            placeholder="Description: Joins customer orders"
          />
        </label>

        <label className="field">
          <span>Results</span>
          <textarea
            value={results}
            onChange={(event) => setResults(event.target.value)}
            rows={6}
            placeholder="Interim or final findings from this experiment"
          />
        </label>

        <label className="field">
          <span>Cost (in USD)</span>
          <input
            type="number"
            step="any"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            placeholder="0"
          />
        </label>

        <label className="field">
          <span>Duration (in weeks)</span>
          <input
            type="number"
            step="any"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            placeholder="0"
          />
        </label>

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
              {operators.length > 0
                ? operators.join(', ')
                : 'Select eligible operators'}
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

        {isEditing ? (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={completed}
              onChange={(event) => setCompleted(event.target.checked)}
            />
            <span>Completed</span>
          </label>
        ) : null}

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
          {!node.completed ? (
            <div className="editor__risk-summary">
              <div className="editor__risk-header">
                <div>
                  <span className="editor__eyebrow">Risk Snapshot</span>
                  <h3>Risk and Fragility</h3>
                </div>
                <button
                  type="button"
                  className="button"
                  onClick={onDeepReasoning}
                  disabled={isDeepReasoningLoading}
                >
                  {isDeepReasoningLoading ? 'Reasoning...' : 'Deep Reasoning'}
                </button>
              </div>
              {isRiskLoading ? <p className="editor__risk-text">Refreshing risk scores.</p> : null}
              {riskError ? <p className="editor__risk-text">{riskError}</p> : null}
              {riskAssessment ? (
                <>
                  <div className="editor__risk-grid">
                    <div>
                      <span>Overall Risk</span>
                      <strong>{riskAssessment.overallRisk}</strong>
                    </div>
                    <div>
                      <span>Fragility</span>
                      <strong>{riskAssessment.fragility}</strong>
                    </div>
                    <div>
                      <span>Scientific</span>
                      <strong>{riskAssessment.scientificRisk}</strong>
                    </div>
                    <div>
                      <span>Execution</span>
                      <strong>{riskAssessment.executionRisk}</strong>
                    </div>
                    <div>
                      <span>Regulatory</span>
                      <strong>{riskAssessment.regulatoryRisk}</strong>
                    </div>
                  </div>
                  <p className="editor__risk-text">{riskAssessment.summary}</p>
                  {riskAssessment.changeSummary ? (
                    <p className="editor__risk-change">{riskAssessment.changeSummary}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
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
