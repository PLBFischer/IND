import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExperimentNode, NodeRiskAssessment } from '../types/graph';
import { NodeEditor } from './NodeEditor';

const node: ExperimentNode = {
  id: 'node_pk',
  nodeKind: 'experiment',
  title: 'Rodent PK / brain exposure',
  type: 'pk',
  objective: 'Establish whether oral dosing reaches the target exposure.',
  procedureSummary: 'Single-dose PK with matched brain and plasma sampling.',
  successCriteria: 'Exposure clears the projected efficacy threshold.',
  decisionSupported: 'Supports brain penetration claim.',
  results: 'Preliminary exposure looks directionally positive.',
  operationalNotes: 'Vendor slot is held for next week.',
  cost: 52000,
  duration: 4,
  workHoursPerWeek: 10,
  parallelizationMultiplier: 2,
  operators: ['Avery Chen'],
  owner: 'Avery Chen',
  status: 'planned',
  blockerPriority: 'critical',
  phase1Relevance: 'Supports the oral SAD design.',
  indRelevance: 'Supports the CNS exposure narrative in the IND.',
  evidenceRefs: ['Study memo 001'],
  x: 120,
  y: 120,
};

const riskAssessment: NodeRiskAssessment = {
  nodeId: 'node_pk',
  scientificRisk: 'Medium',
  executionRisk: 'Low',
  overallRisk: 'Medium',
  fragility: 'High',
  summary: 'Exposure is important to the clinic-bound story but still weakly supported.',
  scientificDrivers: ['Exposure margin still needs confirmation.'],
  executionDrivers: ['Vendor slot exists, but there is limited slack.'],
  fragilityDrivers: ['A slip would delay downstream decisions.'],
  recommendations: [],
  keyAssumptions: ['Rodent exposure is directionally predictive enough for the current plan.'],
  affectedClaims: ['Supports brain penetration claim.'],
  changeSummary: 'Program risk increased after the Phase 1 design tightened.',
};

describe('NodeEditor', () => {
  it('renders scientific risk details and saves changes when the editor closes', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <NodeEditor
        mode="edit"
        node={node}
        personnel={[{ name: 'Avery Chen', hoursPerWeek: 40 }]}
        riskAssessment={riskAssessment}
        isRiskLoading={false}
        riskError={null}
        showParallelizationMultiplier
        isConnectMode={false}
        isParallelizeMode={false}
        onClose={onClose}
        onSave={onSave}
        onDelete={vi.fn()}
        onStartConnect={vi.fn()}
        onStartParallelize={vi.fn()}
      />,
    );

    expect(screen.getByText('Scientific and Operational Risk')).toBeInTheDocument();
    expect(screen.getByText('Operational Risk')).toBeInTheDocument();
    expect(screen.getByText(/Affected claims:/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Objective'), {
      target: { value: 'Updated objective' },
    });
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'blocked' },
    });

    expect(screen.queryByLabelText('Evidence References')).not.toBeInTheDocument();
    expect(screen.queryByText('Program Relevance')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Work Required Per Week (h)')).toBeInTheDocument();
    expect(screen.queryByText('Update Node')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeKind: 'experiment',
        objective: 'Updated objective',
        status: 'blocked',
        evidenceRefs: ['Study memo 001'],
        blockerPriority: 'critical',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
