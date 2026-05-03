import { CONFIDENCE } from './person-matcher.mjs';

const LOW_PRECISION_PREFIXES = ['~', 'abt', 'about', 'circa', 'c.'];

export function isLowPrecisionDate(dateStr) {
  if (!dateStr) return false;
  const normalized = String(dateStr).trim().toLowerCase();
  return LOW_PRECISION_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export function shouldCountBirthForSpacing(dateStr) {
  if (!dateStr) return false;
  return !isLowPrecisionDate(dateStr);
}

export function severityForYoungParentGap({
  gap,
  parentBirthYear,
  childBirthYear,
  parentDateStr,
  childDateStr,
}) {
  if (gap < 12) {
    return 'CRITICAL';
  }
  if (gap >= 15) {
    return null;
  }

  const hasLowPrecisionDate =
    isLowPrecisionDate(parentDateStr) || isLowPrecisionDate(childDateStr);
  if (hasLowPrecisionDate) {
    return 'INFO';
  }

  if ((parentBirthYear && parentBirthYear < 1700) || (childBirthYear && childBirthYear < 1700)) {
    return 'WARNING';
  }

  return 'CRITICAL';
}

export function severityForOlderMotherGap({
  gap,
  parentBirthYear,
  childBirthYear,
  parentDateStr,
  childDateStr,
  parentMarriageDate,
}) {
  if (gap <= 50) {
    return null;
  }

  const marriageMatch = String(parentMarriageDate || '').match(/(\d{4})/);
  const marriageYear = marriageMatch ? Number(marriageMatch[1]) : null;
  if (marriageYear && parentBirthYear && childBirthYear) {
    const motherAgeAtMarriage = marriageYear - parentBirthYear;
    const yearsAfterMarriage = childBirthYear - marriageYear;
    if (motherAgeAtMarriage >= 40 && yearsAfterMarriage >= 0 && yearsAfterMarriage <= 10) {
      return 'INFO';
    }
  }

  const hasLowPrecisionDate =
    isLowPrecisionDate(parentDateStr) || isLowPrecisionDate(childDateStr);
  if (hasLowPrecisionDate && gap <= 56) {
    return 'INFO';
  }

  return 'WARNING';
}

export function severityForLongLifespan({
  lifespan,
  birthYear,
  sources,
}) {
  if (!lifespan || lifespan <= 105 || lifespan > 120) {
    return null;
  }

  const sourceList = Array.isArray(sources) ? sources : [];
  const sourceYears = sourceList
    .map(source => Number(source?.year))
    .filter(Number.isFinite);
  const hasEarlyLifeSource = sourceYears.some(year => year >= birthYear && year <= birthYear + 40);
  const hasLateLifeSource = sourceYears.some(year => year >= birthYear + 75);
  const hasDeathSource = sourceList.some(source => source?.record_type === 'death');

  if (hasEarlyLifeSource && (hasLateLifeSource || hasDeathSource)) {
    return 'INFO';
  }

  return 'WARNING';
}

export function severityForSpouseAgeGap({
  gap,
  marriageDate,
  myBirthYear,
  spouseBirthYear,
}) {
  if (gap <= 30) {
    return null;
  }

  const match = String(marriageDate || '').match(/(\d{4})/);
  const marriageYear = match ? Number(match[1]) : null;
  if (marriageYear && myBirthYear && spouseBirthYear) {
    const olderAgeAtMarriage = marriageYear - Math.min(myBirthYear, spouseBirthYear);
    const youngerAgeAtMarriage = marriageYear - Math.max(myBirthYear, spouseBirthYear);
    if (olderAgeAtMarriage >= 60 && youngerAgeAtMarriage >= 40) {
      return 'INFO';
    }
  }

  return 'WARNING';
}

export function severityForDuplicateConfidence(confidence) {
  if (confidence === CONFIDENCE.HIGH || confidence === CONFIDENCE.MEDIUM) {
    return 'WARNING';
  }
  if (confidence === CONFIDENCE.LOW) {
    return 'INFO';
  }
  return null;
}
