import type { NodeRiskAssessment, RiskLevel } from '../types/graph';

const RISK_RANK: Record<RiskLevel, number> = {
  'Very Low': 0,
  Low: 1,
  Medium: 2,
  High: 3,
  'Very High': 4,
};

export const compareRiskLevels = (left: RiskLevel, right: RiskLevel) =>
  RISK_RANK[left] - RISK_RANK[right];

export const getDominantRiskLevel = (assessment: NodeRiskAssessment) =>
  [assessment.overallRisk, assessment.fragility, assessment.coherenceRisk].sort(
    (left, right) => compareRiskLevels(right, left),
  )[0];

export const getWarningLevel = (
  assessment: NodeRiskAssessment | null,
): 'warning' | 'critical' | null => {
  if (!assessment) {
    return null;
  }

  const dominant = getDominantRiskLevel(assessment);
  if (dominant === 'Very High') {
    return 'critical';
  }
  if (dominant === 'High') {
    return 'warning';
  }
  return null;
};
