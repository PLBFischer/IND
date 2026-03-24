import { useEffect, useRef, useState } from 'react';
import type { Personnel } from '../types/graph';

type PersonnelPanelProps = {
  personnel: Personnel[];
  onAddPerson: (name: string, hoursPerWeek: number) => void;
  onUpdatePersonHours: (name: string, hoursPerWeek: number) => void;
  onRemovePerson: (name: string) => void;
};

export function PersonnelPanel({
  personnel,
  onAddPerson,
  onUpdatePersonHours,
  onRemovePerson,
}: PersonnelPanelProps) {
  const [name, setName] = useState('');
  const [hoursPerWeek, setHoursPerWeek] = useState('40');
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  return (
    <div className="personnel-panel" ref={panelRef}>
      <button
        type="button"
        className={`button personnel-panel__toggle ${
          isOpen ? 'personnel-panel__toggle--open' : ''
        }`}
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        Personnel
      </button>
      {isOpen ? (
        <aside className="personnel-panel__popover" aria-label="Personnel">
          <div className="personnel-panel__header">
            <div>
              <span className="toolbar__eyebrow">Personnel Log</span>
              <h2>Operators</h2>
            </div>
          </div>

          <form
            className="personnel-panel__form"
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
            <p className="personnel-panel__empty">No personnel added yet.</p>
          ) : (
            <ul className="personnel-panel__list">
              {personnel.map((person) => (
                <li key={person.name}>
                  <div className="personnel-panel__item">
                    <span>{person.name}</span>
                    <label className="personnel-panel__hours">
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
        </aside>
      ) : null}
    </div>
  );
}
