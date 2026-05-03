const LOCATION_FIELDS = ['birth', 'death'];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function compilePattern(values) {
  return new RegExp(`\\b(?:${values.join('|')})\\b`, 'i');
}

const COUNTRY_DEFINITIONS = [
  {
    id: 'US',
    label: 'United States',
    pattern: compilePattern([
      'united states',
      'u\\.s\\.a',
      'usa',
      'america',
      'alabama',
      'alaska',
      'arizona',
      'arkansas',
      'california',
      'colorado',
      'connecticut',
      'delaware',
      'district of columbia',
      'florida',
      'georgia',
      'hawaii',
      'idaho',
      'illinois',
      'indiana',
      'iowa',
      'kansas',
      'kentucky',
      'louisiana',
      'maine',
      'maryland',
      'massachusetts',
      'michigan',
      'minnesota',
      'mississippi',
      'missouri',
      'montana',
      'nebraska',
      'nevada',
      'new hampshire',
      'new jersey',
      'new mexico',
      'new york',
      'north carolina',
      'north dakota',
      'ohio',
      'oklahoma',
      'oregon',
      'pennsylvania',
      'rhode island',
      'south carolina',
      'south dakota',
      'tennessee',
      'texas',
      'utah',
      'vermont',
      'virginia',
      'washington',
      'west virginia',
      'wisconsin',
      'wyoming',
      'connecticut colony',
      'massachusetts bay colony',
      'rhode island colony',
    ]),
  },
  {
    id: 'UK',
    label: 'United Kingdom',
    pattern: compilePattern([
      'united kingdom',
      'england',
      'scotland',
      'wales',
      'london',
      'bristol',
      'cheshire',
      'essex',
      'gloucester',
      'gloucestershire',
      'hampshire',
      'kent',
      'lancashire',
      'middlesex',
      'northamptonshire',
      'surrey',
      'yorkshire',
      'devon',
      'cornwall',
      'sussex',
      'somerset',
      'norfolk',
      'suffolk',
      'warwick',
      'glamorgan',
      'pembroke',
      'carmarthen',
      'cardigan',
      'caernarvon',
      'merioneth',
      'montgomery',
      'denbigh',
      'flint',
      'anglesey',
      'brecon',
      'radnor',
      'monmouth',
      'southwark',
    ]),
  },
  {
    id: 'Ireland',
    label: 'Ireland',
    pattern: compilePattern(['ireland']),
  },
  {
    id: 'Canada',
    label: 'Canada',
    pattern: compilePattern([
      'canada',
      'alberta',
      'british columbia',
      'manitoba',
      'montreal',
      'new brunswick',
      'nova scotia',
      'ontario',
      'prince edward island',
      'quebec',
      'saskatchewan',
    ]),
  },
  {
    id: 'Germany',
    label: 'Germany',
    pattern: compilePattern([
      'germany',
      'prussia',
      'pomerania',
      'pommern',
      'saxony',
      'bavaria',
      'baden',
      'brandenburg',
      'wurttemberg',
      'hannover',
      'hesse',
    ]),
  },
  {
    id: 'Poland',
    label: 'Poland',
    pattern: compilePattern(['poland', 'russia poland']),
  },
  {
    id: 'Russia',
    label: 'Russia',
    pattern: compilePattern(['russia']),
  },
  {
    id: 'France',
    label: 'France',
    pattern: compilePattern(['france', 'normandy', 'brittany', 'paris']),
  },
  {
    id: 'Italy',
    label: 'Italy',
    pattern: compilePattern(['italy']),
  },
  {
    id: 'Austria',
    label: 'Austria',
    pattern: compilePattern(['austria']),
  },
  {
    id: 'Hungary',
    label: 'Hungary',
    pattern: compilePattern(['hungary']),
  },
  {
    id: 'Czech Republic',
    label: 'Czech Republic',
    pattern: compilePattern(['bohemia', 'czech']),
  },
  {
    id: 'Sweden',
    label: 'Sweden',
    pattern: compilePattern(['sweden']),
  },
  {
    id: 'Norway',
    label: 'Norway',
    pattern: compilePattern(['norway']),
  },
  {
    id: 'Denmark',
    label: 'Denmark',
    pattern: compilePattern(['denmark']),
  },
  {
    id: 'Netherlands',
    label: 'Netherlands',
    pattern: compilePattern(['netherlands', 'holland']),
  },
  {
    id: 'Switzerland',
    label: 'Switzerland',
    pattern: compilePattern(['switzerland']),
  },
];

function collectLocationText(frontmatter) {
  const values = [
    frontmatter?.origin_country,
    frontmatter?.burial,
    frontmatter?.name?.full,
  ];

  for (const field of LOCATION_FIELDS) {
    values.push(frontmatter?.[field]?.place);
  }

  return normalizeText(values.filter(Boolean).join(' | '));
}

function getInputText(value) {
  if (typeof value === 'string') {
    return normalizeText(value);
  }

  return collectLocationText(value);
}

function detectCountry(value) {
  const text = getInputText(value);
  if (!text) return null;

  return COUNTRY_DEFINITIONS.find(country => country.pattern.test(text)) || null;
}

export function inferCountry(value, options = {}) {
  const format = options.format || (typeof value === 'string' ? 'name' : 'code');
  const country = detectCountry(value);

  if (!country) {
    return format === 'name' ? '' : null;
  }

  return format === 'name' ? country.label : country.id;
}
