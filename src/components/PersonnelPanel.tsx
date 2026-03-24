import { useEffect, useRef, useState } from 'react';

type PersonnelPanelProps = {
  personnel: string[];
  onAddPerson: (name: string) => void;
  onRemovePerson: (name: string) => void;
};

export function PersonnelPanel({
  personnel,
  onAddPerson,
  onRemovePerson,
}: PersonnelPanelProps) {
  const [name, setName] = useState('');
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
              if (!nextName) {
                return;
              }

              onAddPerson(nextName);
              setName('');
            }}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Add person"
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
                <li key={person}>
                  <span>{person}</span>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onRemovePerson(person)}
                    aria-label={`Remove ${person}`}
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
