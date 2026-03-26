import { useState } from 'react';
import { ImportPanel } from './ImportPanel';
import type { Personnel, ProgramContext } from '../types/graph';

type ProgramContextPanelProps = {
  program: ProgramContext;
  budgetUsd: number | null;
  personnel: Personnel[];
  onExport: () => void;
  onImport: (value: string) => string | null;
  onProgramChange: (updates: Partial<ProgramContext>) => void;
  onBudgetChange: (value: string) => void;
  onAddPerson: (name: string, hoursPerWeek: number) => void;
  onUpdatePersonHours: (name: string, hoursPerWeek: number) => void;
  onRemovePerson: (name: string) => void;
};

const getSummaryLine = (value: string, emptyText: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return emptyText;
  }

  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
};

export function ProgramContextPanel({
  program,
  budgetUsd,
  personnel,
  onExport,
  onImport,
  onProgramChange,
  onBudgetChange,
  onAddPerson,
  onUpdatePersonHours,
  onRemovePerson,
}: ProgramContextPanelProps) {
  const [isOpen, setIsOpen] = useState(
    !program.targetPhase1Design.trim() && !program.targetIndStrategy.trim(),
  );
  const [name, setName] = useState('');
  const [hoursPerWeek, setHoursPerWeek] = useState('40');

  return (
    <aside className="program-context-panel" aria-label="Program setup">
      <div className="program-context-panel__header">
        <div>
          <span className="toolbar__eyebrow">Program Setup</span>
          <h2>{program.programTitle?.trim() || 'Company Context'}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? 'Collapse' : 'Open'}
        </button>
      </div>

      <div className="program-context-panel__summary">
        <p>
          <span>Budget</span>
          {budgetUsd !== null ? `$${budgetUsd.toLocaleString()}` : 'No budget set'}
        </p>
        <p>
          <span>Current Week</span>
          {program.currentWeek}
        </p>
        <p>
          <span>Personnel</span>
          {personnel.length > 0
            ? `${personnel.length} active team member${personnel.length === 1 ? '' : 's'}`
            : 'No personnel added'}
        </p>
        <p>
          <span>Phase 1</span>
          {getSummaryLine(
            program.targetPhase1Design,
            'Add the intended first-in-human design.',
          )}
        </p>
        <p>
          <span>IND Story</span>
          {getSummaryLine(
            program.targetIndStrategy,
            'Add the intended IND strategy and supporting narrative.',
          )}
        </p>
      </div>

      {isOpen ? (
        <div className="program-context-panel__form">
          <section className="program-context-panel__section">
            <div className="program-context-panel__section-header">
              <h3>Program Context</h3>
              <span>Clinic-bound narrative and constraints</span>
            </div>

            <label className="field">
              <span>Program Title</span>
              <input
                value={program.programTitle ?? ''}
                onChange={(event) =>
                  onProgramChange({ programTitle: event.target.value || undefined })
                }
                placeholder="Optional demo program title"
              />
            </label>

            <label className="field">
              <span>Budget (USD)</span>
              <input
                type="number"
                step="any"
                min="0"
                value={budgetUsd ?? ''}
                onChange={(event) => onBudgetChange(event.target.value)}
                placeholder="USD"
              />
            </label>

            <label className="field">
              <span>Current Week</span>
              <input
                type="number"
                step="1"
                min="1"
                value={program.currentWeek}
                onChange={(event) =>
                  onProgramChange({
                    currentWeek: Math.max(1, Number(event.target.value) || 1),
                  })
                }
                placeholder="1"
              />
            </label>

            <label className="field">
              <span>Target Phase 1 Design</span>
              <textarea
                value={program.targetPhase1Design}
                onChange={(event) =>
                  onProgramChange({ targetPhase1Design: event.target.value })
                }
                rows={5}
                placeholder="Describe the intended first-in-human study design."
              />
            </label>

            <label className="field">
              <span>Target IND Strategy / Story</span>
              <textarea
                value={program.targetIndStrategy}
                onChange={(event) =>
                  onProgramChange({ targetIndStrategy: event.target.value })
                }
                rows={5}
                placeholder="Describe the evidence package and narrative the program is trying to support."
              />
            </label>
          </section>

          <section className="program-context-panel__section">
            <div className="program-context-panel__section-header">
              <h3>Personnel</h3>
              <span>Team capacity and assignees</span>
            </div>

            <form
              className="program-context-panel__person-form"
              onSubmit={(event) => {
                event.preventDefault();

                const nextName = name.trim();
                const nextHoursPerWeek = Number(hoursPerWeek);

                if (!nextName || !Number.isFinite(nextHoursPerWeek)) {
                  return;
                }

                onAddPerson(nextName, nextHoursPerWeek);
                setName('');
                setHoursPerWeek('40');
              }}
            >
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Add person"
              />
              <input
                type="number"
                step="any"
                min="0"
                value={hoursPerWeek}
                onChange={(event) => setHoursPerWeek(event.target.value)}
                placeholder="Hours/week"
              />
              <button type="submit" className="button button--primary">
                Add
              </button>
            </form>

            {personnel.length === 0 ? (
              <p className="program-context-panel__empty">No personnel added yet.</p>
            ) : (
              <ul className="program-context-panel__personnel-list">
                {personnel.map((person) => (
                  <li key={person.name}>
                    <div className="program-context-panel__personnel-item">
                      <span>{person.name}</span>
                      <label className="program-context-panel__hours">
                        <span>Hours/Week</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={person.hoursPerWeek}
                          onChange={(event) => {
                            const nextHoursPerWeek = Number(event.target.value);
                            if (!Number.isFinite(nextHoursPerWeek)) {
                              return;
                            }

                            onUpdatePersonHours(person.name, nextHoursPerWeek);
                          }}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onRemovePerson(person.name)}
                      aria-label={`Remove ${person.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="program-context-panel__actions">
            <ImportPanel onApply={onImport} />
            <button type="button" className="button" onClick={onExport}>
              Export
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
