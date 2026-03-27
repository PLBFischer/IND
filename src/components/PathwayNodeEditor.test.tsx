import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BiologicalPathwayNode } from '../types/graph';
import { PathwayNodeEditor } from './PathwayNodeEditor';

const node: BiologicalPathwayNode = {
  id: 'path_1',
  nodeKind: 'biological_pathway',
  title: 'TNF pathway',
  summary: 'Mechanistic evidence around TNF signaling.',
  focusTerms: ['TNF', 'NF-kB'],
  paperSources: [
    {
      sourceId: 'source_1',
      sourceType: 'raw_text',
      sourceValue: 'Results: TNF increased NF-kB activation in vivo.',
    },
  ],
  extractionStatus: 'ready',
  extractionError: null,
  pathwayGraph: null,
  sanityReport: null,
  queryHistory: [],
  lastBuiltAt: null,
  linkedExperimentNodeIds: ['exp_1'],
  lastBuildResponse: null,
  latestQueryResponse: null,
  x: 0,
  y: 0,
};

describe('PathwayNodeEditor', () => {
  it('updates source inputs and emits a build payload', () => {
    const onBuild = vi.fn();

    render(
      <PathwayNodeEditor
        mode="edit"
        node={node}
        isConnectMode={false}
        isBuilding={false}
        buildError={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onStartConnect={vi.fn()}
        onCancelConnect={vi.fn()}
        onBuild={onBuild}
        onOpenExplorer={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Summary'), {
      target: { value: 'Updated pathway summary' },
    });
    fireEvent.change(screen.getByLabelText('Source Value'), {
      target: { value: 'Results: updated full text.' },
    });

    fireEvent.click(screen.getByText('Build Pathway'));

    expect(onBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeKind: 'biological_pathway',
        summary: 'Updated pathway summary',
        paperSources: [
          expect.objectContaining({
            sourceValue: 'Results: updated full text.',
          }),
        ],
      }),
    );
  });

  it('saves when the editor closes and uses the simplified delete label', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <PathwayNodeEditor
        mode="edit"
        node={node}
        isConnectMode={false}
        isBuilding={false}
        buildError={null}
        onClose={onClose}
        onSave={onSave}
        onDelete={vi.fn()}
        onStartConnect={vi.fn()}
        onCancelConnect={vi.fn()}
        onBuild={vi.fn()}
        onOpenExplorer={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Summary'), {
      target: { value: 'Close-saved summary' },
    });

    expect(screen.queryByText('Update Node')).not.toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeKind: 'biological_pathway',
        summary: 'Close-saved summary',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
