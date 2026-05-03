import type { ChatConfidence } from '@/types/chat';

interface LineageConfidenceInput {
  birthYear: number | null;
  verificationStatus: string | null;
  generation: number;
  parentCount: number;
  birthPlace: string | null;
  ambiguityGapYears: number | null;
}

function toLevel(score: number): ChatConfidence['level'] {
  if (score >= 0.78) return 'high';
  if (score >= 0.62) return 'medium';
  return 'low';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeVerification(verificationStatus: string | null): string {
  return (verificationStatus || '').trim().toUpperCase();
}

export function scoreLineageClaim(input: LineageConfidenceInput, threshold: number = 0.62): ChatConfidence {
  let score = 0.2;
  const reasons: string[] = [];

  if (input.birthYear != null) {
    score += 0.25;
    reasons.push('Birth year is documented');
  } else {
    score -= 0.25;
    reasons.push('Birth year is missing');
  }

  const verification = normalizeVerification(input.verificationStatus);
  if (verification === 'VERIFIED') {
    score += 0.2;
    reasons.push('Record is marked VERIFIED');
  } else if (verification === 'PROBABLE' || verification === 'REVIEWED') {
    score += 0.1;
    reasons.push(`Record is marked ${verification}`);
  } else if (verification) {
    score += 0.03;
    reasons.push(`Record status is ${verification}`);
  } else {
    score -= 0.05;
    reasons.push('Verification status is unknown');
  }

  if (input.generation >= 4) {
    score += 0.15;
    reasons.push(`Connected by ${input.generation} documented parent-child steps`);
  } else if (input.generation >= 2) {
    score += 0.1;
    reasons.push(`Connected by ${input.generation} parent-child steps`);
  } else {
    score += 0.02;
    reasons.push('Close generation depth; lineage path is short');
  }

  if (input.parentCount >= 2) {
    score += 0.15;
    reasons.push('Both parents are linked on this record');
  } else if (input.parentCount === 1) {
    score += 0.08;
    reasons.push('One parent is linked on this record');
  } else {
    score -= 0.1;
    reasons.push('No parent links on this record');
  }

  if (input.birthPlace) {
    score += 0.05;
    reasons.push('Birth place is documented');
  }

  if (input.ambiguityGapYears != null) {
    if (input.ambiguityGapYears <= 1) {
      score -= 0.18;
      reasons.push('Earliest birth year is effectively tied with another ancestor');
    } else if (input.ambiguityGapYears <= 3) {
      score -= 0.1;
      reasons.push('Earliest birth year is very close to another candidate');
    } else {
      score += 0.03;
      reasons.push('Clear gap from other earliest candidates');
    }
  }

  const finalScore = clamp01(score);
  return {
    score: round2(finalScore),
    level: toLevel(finalScore),
    threshold,
    passed: finalScore >= threshold,
    reasons,
  };
}

interface MilitaryConfidenceInput {
  count: number;
  verifiedCount: number;
  withWarCount: number;
}

export function scoreMilitaryLineageClaim(input: MilitaryConfidenceInput, threshold: number = 0.55): ChatConfidence {
  let score = 0.25;
  const reasons: string[] = [];

  if (input.count > 0) {
    score += 0.25;
    reasons.push(`${input.count} military-lineage people found`);
  } else {
    score -= 0.2;
    reasons.push('No military-lineage people found');
  }

  const verifiedRatio = input.count > 0 ? input.verifiedCount / input.count : 0;
  score += verifiedRatio * 0.25;
  reasons.push(`${Math.round(verifiedRatio * 100)}% have VERIFIED status`);

  const warLinkRatio = input.count > 0 ? input.withWarCount / input.count : 0;
  score += warLinkRatio * 0.2;
  reasons.push(`${Math.round(warLinkRatio * 100)}% include explicit war-service links`);

  const finalScore = clamp01(score);
  return {
    score: round2(finalScore),
    level: toLevel(finalScore),
    threshold,
    passed: finalScore >= threshold,
    reasons,
  };
}
