export function normalizeApprovedCandidates(baseline) {
  const approvedCandidates = Array.isArray(baseline?.approvedCandidates)
    ? baseline.approvedCandidates
    : [];
  const byCandidateParentId = new Map();

  for (const candidate of approvedCandidates) {
    if (!candidate?.candidateParentId) {
      throw new Error('Baseline approved candidate is missing candidateParentId');
    }

    byCandidateParentId.set(candidate.candidateParentId, {
      candidateParentId: candidate.candidateParentId,
      allowedClassifications: Array.isArray(candidate.allowedClassifications) &&
        candidate.allowedClassifications.length > 0
        ? candidate.allowedClassifications
        : ['ambiguous_half_sibling_branch'],
      note: candidate.note || '',
    });
  }

  return byCandidateParentId;
}

export function evaluateRelationshipHopReport(report, baseline) {
  const approvedByCandidateParentId = normalizeApprovedCandidates(baseline);
  const candidates = Array.isArray(report?.candidates) ? report.candidates : [];

  const unexpectedCandidates = [];
  const classificationMismatches = [];
  const seenApprovedIds = new Set();

  for (const candidate of candidates) {
    const approved = approvedByCandidateParentId.get(candidate.candidateParentId);
    if (!approved) {
      unexpectedCandidates.push(candidate);
      continue;
    }

    seenApprovedIds.add(candidate.candidateParentId);
    if (!approved.allowedClassifications.includes(candidate.classification)) {
      classificationMismatches.push({
        candidate,
        approved,
      });
    }
  }

  const resolvedApprovedCandidates = [...approvedByCandidateParentId.values()].filter(
    (approved) => !seenApprovedIds.has(approved.candidateParentId)
  );

  const viewerMismatch = Boolean(
    baseline?.viewerSlug &&
    report?.viewer?.slug &&
    baseline.viewerSlug !== report.viewer.slug
  );

  return {
    viewerMismatch,
    unexpectedCandidates,
    classificationMismatches,
    resolvedApprovedCandidates,
    passes:
      !viewerMismatch &&
      unexpectedCandidates.length === 0 &&
      classificationMismatches.length === 0,
  };
}
