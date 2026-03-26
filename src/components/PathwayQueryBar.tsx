import { useState } from 'react';

type PathwayQueryBarProps = {
  isLoading: boolean;
  hasActiveQuery: boolean;
  onSubmit: (query: string) => void;
  onClear: () => void;
};

const EXAMPLE_PLACEHOLDERS = [
  'Show me the relationship between TNF and NF-kB',
  'Is there an in vivo validated path between Molecule A and B?',
  'Highlight all small molecules inhibiting this subpathway',
  'What evidence supports the edge from X to Y?',
  'What is missing to support this pathway claim?',
];

export function PathwayQueryBar({
  isLoading,
  hasActiveQuery,
  onSubmit,
  onClear,
}: PathwayQueryBarProps) {
  const [query, setQuery] = useState('');
  const placeholder = EXAMPLE_PLACEHOLDERS[0];

  return (
    <form
      className="pathway-query-bar"
      onSubmit={(event) => {
        event.preventDefault();
        const nextQuery = query.trim();
        if (!nextQuery || isLoading) {
          return;
        }

        onSubmit(nextQuery);
      }}
    >
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
      />
      <button type="submit" className="button button--primary" disabled={isLoading}>
        {isLoading ? 'Querying...' : 'Query'}
      </button>
      {hasActiveQuery ? (
        <button type="button" className="button button--ghost" onClick={onClear}>
          Show Full Network
        </button>
      ) : null}
    </form>
  );
}
