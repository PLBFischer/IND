import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FlowNode, NodeRiskAssessment } from '../types/graph';
import { NodeEditor } from './NodeEditor';

const node: FlowNode = {
  id: 'node_pk',
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
  regulatoryRisk: 'Low',
  coherenceRisk: 'High',
  overallRisk: 'Medium',
  fragility: 'High',
  summary: 'Exposure is important to the clinic-bound story but still weakly supported.',
  scientificDrivers: ['Exposure margin still needs confirmation.'],
  executionDrivers: ['Vendor slot exists, but there is limited slack.'],
  regulatoryDrivers: ['No major regulatory issue is obvious yet.'],
  coherenceDrivers: ['The Phase 1 design assumes CNS exposure support.'],
  fragilityDrivers: ['A slip would delay downstream decisions.'],
  recommendations: [],
  keyAssumptions: ['Rodent exposure is directionally predictive enough for the current plan.'],
  affectedClaims: ['Supports brain penetration claim.'],
  changeSummary: 'Coherence risk increased after the Phase 1 design tightened.',
};

describe('NodeEditor', () => {
  it('renders coherence-aware risk summary and saves the richer schema', () => {
    const onSave = vi.fn();

    render(
      <NodeEditor
        mode="edit"
        node={node}
        personnel={[{ name: 'Avery Chen', hoursPerWeek: 40 }]}
        riskAssessment={riskAssessment}
        isRiskLoading={false}
        riskError={null}
        isDeepReasoningLoading={false}
        showParallelizationMultiplier
        isConnectMode={false}
        isParallelizeMode={false}
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
        onStartConnect={vi.fn()}
        onStartParallelize={vi.fn()}
        onCancelConnect={vi.fn()}
        onDeepReasoning={vi.fn()}
      />,
    );

    expect(screen.getByText('Risk, Fragility, and Coherence')).toBeInTheDocument();
    expect(screen.getByText('Coherence')).toBeInTheDocument();
    expect(screen.getByText(/Affected claims:/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Objective'), {
      target: { value: 'Updated objective' },
    });
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'blocked' },
    });
    fireEvent.change(screen.getByLabelText('Evidence References'), {
      target: { value: 'Memo A\nMemo B' },
    });

    fireEvent.click(screen.getByText('Update Node'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        objective: 'Updated objective',
        status: 'blocked',
        evidenceRefs: ['Memo A', 'Memo B'],
        blockerPriority: 'critical',
      }),
    );
  });
});
