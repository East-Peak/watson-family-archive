/**
 * Derive key_facts summary strings for a participant in a record.
 *
 * @param {object} participant - participant data (age, role, birthplace, etc.)
 * @param {object} record      - record node (type, details, etc.)
 * @returns {string[]}         - usually one element, empty if all fields null
 */
export function deriveKeyFacts(participant, record) {
  const { type, details = {} } = record;

  switch (type) {
    case 'death':
      return formatParts([details.death_date, details.death_place]);

    case 'marriage': {
      const parts = [participant.role, details.event_date, details.event_place];
      return formatParts(parts);
    }

    case 'burial':
    case 'memorial':
      return formatParts([details.death_date, details.cemetery]);

    case 'census':
    default:
      return formatCensusLike(participant);
  }
}

/** Census-style: "Age {age}, {role}, {birthplace}" — null fields omitted */
function formatCensusLike({ age, role, birthplace }) {
  const parts = [];
  if (age != null) parts.push(`Age ${age}`);
  if (role != null) parts.push(role);
  if (birthplace != null) parts.push(birthplace);
  return parts.length ? [parts.join(', ')] : [];
}

/** Generic: join non-null values with ", "; return [] if nothing present */
function formatParts(values) {
  const parts = values.filter((v) => v != null && v !== '');
  return parts.length ? [parts.join(', ')] : [];
}
