import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY } from '../utils/constants';
import {
  normalizeGraphState,
  useLocalStorageGraph,
} from './useLocalStorageGraph';

function ProgramHarness() {
  const { program, setProgram } = useLocalStorageGraph();

  return (
    <div>
      <p data-testid="phase1">{program.targetPhase1Design}</p>
      <button
        type="button"
        onClick={() =>
          setProgram({
            programTitle: 'Updated Demo',
            targetPhase1Design: 'Updated Phase 1 design',
            targetIndStrategy: 'Updated IND strategy',
            currentWeek: 1,
          })
        }
      >
        Update Program
      </button>
    </div>
  );
}

describe('useLocalStorageGraph', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('normalizes old payloads into the richer schema', () => {
    const normalized = normalizeGraphState({
      nodes: [
        {
          id: 'legacy_node',
          title: 'Legacy node',
          content: 'Legacy procedure summary',
          results: 'Interim result',
          cost: 1200,
          duration: 3,
          workHoursPerWeek: 10,
          parallelizationMultiplier: 2,
          operators: ['Avery Chen'],
          completed: true,
          x: 80,
          y: 120,
        },
      ],
      edges: [],
      personnel: ['Avery Chen'],
      budgetUsd: 5000,
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.program.targetPhase1Design).toEqual(expect.any(String));
    expect(normalized?.nodes[0]).toMatchObject({
      procedureSummary: 'Legacy procedure summary',
      status: 'completed',
      type: 'other',
      blockerPriority: 'supporting',
      evidenceRefs: [],
    });
  });

  it('persists program context updates to localStorage', () => {
    render(<ProgramHarness />);

    fireEvent.click(screen.getByText('Update Program'));

    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(saved.program).toMatchObject({
      programTitle: 'Updated Demo',
      targetPhase1Design: 'Updated Phase 1 design',
      targetIndStrategy: 'Updated IND strategy',
    });
    expect(screen.getByTestId('phase1')).toHaveTextContent('Updated Phase 1 design');
  });

  it('normalizes and preserves biological pathway nodes', () => {
    const normalized = normalizeGraphState({
      nodes: [
        {
          id: 'pathway_1',
          nodeKind: 'biological_pathway',
          title: 'TNF signaling evidence',
          focusTerms: ['TNF', 'NF-kB'],
          paperSources: [
            {
              sourceId: 'source_1',
              sourceType: 'raw_text',
              sourceValue: 'Full text results here.',
            },
          ],
          extractionStatus: 'ready',
          x: 240,
          y: 320,
        },
      ],
      edges: [],
      personnel: [],
      budgetUsd: 5000,
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.nodes[0]).toMatchObject({
      nodeKind: 'biological_pathway',
      title: 'TNF signaling evidence',
      extractionStatus: 'ready',
    });
  });
});
