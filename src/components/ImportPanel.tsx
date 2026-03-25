import { useEffect, useRef, useState } from 'react';

type ImportPanelProps = {
  onApply: (value: string) => string | null;
};

export function ImportPanel({ onApply }: ImportPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setError(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  return (
    <div className="import-panel" ref={panelRef}>
      <button
        type="button"
        className={`button import-panel__toggle ${isOpen ? 'import-panel__toggle--open' : ''}`}
        onClick={() => {
          setIsOpen((current) => !current);
          setError(null);
        }}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        Import
      </button>
      {isOpen ? (
        <aside className="import-panel__popover" aria-label="Import graph JSON">
          <div className="import-panel__header">
            <div>
              <span className="toolbar__eyebrow">Graph Import</span>
              <h2>Paste JSON</h2>
            </div>
          </div>
          <textarea
            className="import-panel__textarea"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste exported graph JSON here"
            spellCheck={false}
          />
          {error ? <p className="import-panel__error">{error}</p> : null}
          <div className="import-panel__footer">
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                const nextError = onApply(value);
                if (nextError) {
                  setError(nextError);
                  return;
                }

                setError(null);
                setValue('');
                setIsOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
