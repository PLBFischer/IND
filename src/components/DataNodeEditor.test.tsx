import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DataNode } from '../types/graph';
import { DataNodeEditor } from './DataNodeEditor';

const node: DataNode = {
  id: 'data_1',
  nodeKind: 'data',
  title: 'PK tables',
  description: 'Raw concentration tables.',
  files: [],
  linkedExperimentNodeIds: ['exp_1'],
  x: 0,
  y: 0,
};

describe('DataNodeEditor', () => {
  it('saves when the editor closes and uses the simplified delete label', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <DataNodeEditor
        mode="edit"
        node={node}
        isConnectMode={false}
        onClose={onClose}
        onSave={onSave}
        onDelete={vi.fn()}
        onStartConnect={vi.fn()}
        onCancelConnect={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Dataset Description'), {
      target: { value: 'Updated dataset description' },
    });

    expect(screen.queryByText('Update Node')).not.toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeKind: 'data',
        description: 'Updated dataset description',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
