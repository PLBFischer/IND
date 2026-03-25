import type { Personnel } from '../types/graph';
import { ImportPanel } from './ImportPanel';
import { PersonnelPanel } from './PersonnelPanel';

type ToolbarProps = {
  budgetUsd: number | null;
  plannedCost: string;
  plannedDuration: string;
  personnel: Personnel[];
  isAssigning: boolean;
  canAssign: boolean;
  isAssignedView: boolean;
  isAccelerating: boolean;
  canAccelerate: boolean;
  isChatOpen: boolean;
  isReviewOpen: boolean;
  isReviewing: boolean;
  onAddPerson: (name: string, hoursPerWeek: number) => void;
  onUpdatePersonHours: (name: string, hoursPerWeek: number) => void;
  onRemovePerson: (name: string) => void;
  onBudgetChange: (value: string) => void;
  onAssign: () => void;
  onAccelerate: () => void;
  onToggleChat: () => void;
  onToggleReview: () => void;
  onExport: () => void;
  onImport: (value: string) => string | null;
  onAddNode: () => void;
};

export function Toolbar({
  budgetUsd,
  plannedCost,
  plannedDuration,
  personnel,
  isAssigning,
  canAssign,
  isAssignedView,
  isAccelerating,
  canAccelerate,
  isChatOpen,
  isReviewOpen,
  isReviewing,
  onAddPerson,
  onUpdatePersonHours,
  onRemovePerson,
  onBudgetChange,
  onAssign,
  onAccelerate,
  onToggleChat,
  onToggleReview,
  onExport,
  onImport,
  onAddNode,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__eyebrow">Flow Editor</span>
        <h1>Pipeline Canvas</h1>
      </div>
      <div className="toolbar__actions">
        <div className="toolbar__metrics" aria-label="Flow metrics">
          <label className="toolbar__metric toolbar__metric--budget">
            <span>Budget</span>
            <input
              type="number"
              step="any"
              min="0"
              value={budgetUsd ?? ''}
              onChange={(event) => onBudgetChange(event.target.value)}
              placeholder="USD"
            />
          </label>
          <div className="toolbar__metric">
            <span>Planned Cost</span>
            <strong>{plannedCost}</strong>
          </div>
          <div className="toolbar__metric">
            <span>Planned Duration</span>
            <strong>{plannedDuration}</strong>
          </div>
        </div>
        <PersonnelPanel
          personnel={personnel}
          onAddPerson={onAddPerson}
          onUpdatePersonHours={onUpdatePersonHours}
          onRemovePerson={onRemovePerson}
        />
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
          className={isChatOpen ? 'button button--primary' : 'button'}
          onClick={onToggleChat}
        >
          ChatGPT
        </button>
        <button
          type="button"
          className={isReviewOpen ? 'button button--primary' : 'button'}
          onClick={onToggleReview}
        >
          {isReviewing && isReviewOpen ? 'Reviewing...' : 'Review'}
        </button>
        <ImportPanel onApply={onImport} />
        <button type="button" className="button" onClick={onExport}>
          Export
        </button>
        <button type="button" className="button button--primary" onClick={onAddNode}>
          Add Node
        </button>
      </div>
    </header>
  );
}
