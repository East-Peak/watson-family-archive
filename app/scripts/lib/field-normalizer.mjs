/**
 * field-normalizer.mjs
 *
 * Maps raw field names extracted from research finding tables to canonical keys.
 * Field names vary across findings (e.g. "Birth Year (Est.)" vs "Birth Year (Estimated)"
 * vs "Birth Date"), so this module provides a single authoritative lookup.
 */

/**
 * Canonical field map.
 * Keys must be lowercase and trimmed — they are compared against the lowercased,
 * trimmed input after whitespace normalisation.
 *
 * @type {Map<string, string>}
 */
export const FIELD_MAP = new Map([
  // Identity
  ['name',                        'name'],
  ['full name',                   'name'],
  ['sex',                         'sex'],
  ['gender',                      'sex'],
  ['age',                         'age'],
  ['race',                        'race'],
  ['occupation',                  'occupation'],

  // Birth
  ['birth date',                  'birth_date'],
  ['birth year',                  'birth_year'],
  ['birth year (est.)',           'birth_year_est'],
  ['birth year (estimated)',      'birth_year_est'],
  ['birth place',                 'birth_place'],
  ['birthplace',                  'birth_place'],

  // Death
  ['death date',                  'death_date'],
  ['death place',                 'death_place'],
  ['cause of death',              'cause_of_death'],

  // Burial
  ['burial date',                 'burial_date'],
  ['burial place',                'burial_place'],
  ['cemetery',                    'cemetery'],

  // Marriage / spouse
  ['marital status',              'marital_status'],
  ['spouse',                      'spouse'],
  ['spouse name',                 'spouse_name'],
  ['marriage date',               'marriage_date'],
  ['marriage place',              'marriage_place'],
  ['years married',               'years_married'],

  // Role / relationship
  ['relationship to head',        'role'],
  ['relationship',                'role'],
  ['role',                        'role'],
  ['relation',                    'role'],

  // Parents
  ['father',                      'father'],
  ['mother',                      'mother'],
  ["father's birthplace",         'fathers_birthplace'],
  ["mother's birthplace",         'mothers_birthplace'],

  // Children
  ['number of children',          'number_of_children'],
  ['number of living children',   'number_of_living_children'],

  // Event (generic)
  ['event date',                  'event_date'],
  ['event place',                 'event_place'],
  ['event type',                  'event_type'],

  // Census / record logistics
  ['enumeration district',        'enumeration_district'],
  ['line number',                 'line_number'],
  ['page number',                 'page_number'],
  ['residence',                   'residence'],

  // Immigration / naturalisation
  ['immigration year',            'immigration_year'],
  ['naturalization status',       'naturalization_status'],

  // Miscellaneous
  ['informant',                   'informant'],
  ['photograph',                  'photograph'],

  // Draft card (WWI/WWII military registration)
  ['employer',                    'employer'],
  ['employer name',               'employer'],
  ['employer address',            'employer_address'],
  ['dependents',                  'dependents'],
  ['physical description',        'physical_description'],
  ['has previously served',       'has_previously_served'],
  ['prior military service',      'has_previously_served'],
  ['citizenship',                 'citizenship'],
  ['citizenship status',          'citizenship'],
]);

/**
 * Normalize a raw field name from a research finding table to its canonical key.
 *
 * Lookup is case-insensitive and whitespace-tolerant.  If the field name is not
 * found in FIELD_MAP the function falls back to a slug-style key: lowercase,
 * spaces replaced with underscores, non-alphanumeric/underscore characters stripped.
 *
 * @param {string} fieldName - Raw field name as it appears in the finding markdown.
 * @returns {string} Canonical snake_case key.
 *
 * @example
 * normalizeFieldName('Birth Year (Est.)')   // → 'birth_year_est'
 * normalizeFieldName('  Name  ')            // → 'name'
 * normalizeFieldName('Some Unknown Field')  // → 'some_unknown_field'
 */
export function normalizeFieldName(fieldName) {
  const normalised = fieldName.trim().toLowerCase();

  if (FIELD_MAP.has(normalised)) {
    return FIELD_MAP.get(normalised);
  }

  // Fallback: spaces → underscores, strip anything not alphanumeric or underscore.
  return normalised
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}
