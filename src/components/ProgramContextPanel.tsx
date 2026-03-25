import { useState } from 'react';
import type { ProgramContext } from '../types/graph';

type ProgramContextPanelProps = {
  program: ProgramContext;
  onChange: (updates: Partial<ProgramContext>) => void;
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
  onChange,
}: ProgramContextPanelProps) {
  const [isOpen, setIsOpen] = useState(
    !program.targetPhase1Design.trim() && !program.targetIndStrategy.trim(),
  );

  return (
    <aside className="program-context-panel" aria-label="Program context">
      <div className="program-context-panel__header">
        <div>
          <span className="toolbar__eyebrow">Program Context</span>
          <h2>{program.programTitle?.trim() || 'Clinic-Bound Story'}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? 'Collapse' : 'Edit'}
        </button>
      </div>

      <div className="program-context-panel__summary">
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
          <label className="field">
            <span>Program Title</span>
            <input
              value={program.programTitle ?? ''}
              onChange={(event) =>
                onChange({ programTitle: event.target.value || undefined })
              }
              placeholder="Optional demo program title"
            />
          </label>

          <label className="field">
            <span>Target Phase 1 Design</span>
            <textarea
              value={program.targetPhase1Design}
              onChange={(event) =>
                onChange({ targetPhase1Design: event.target.value })
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
                onChange({ targetIndStrategy: event.target.value })
              }
              rows={5}
              placeholder="Describe the evidence package and narrative the program is trying to support."
            />
          </label>
        </div>
      ) : null}
    </aside>
  );
}
