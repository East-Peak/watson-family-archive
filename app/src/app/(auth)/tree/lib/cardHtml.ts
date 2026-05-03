const COUNTRY_FLAGS: Record<string, string> = {
  'United States': '🇺🇸',
  'United Kingdom': '🇬🇧',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Ireland': '🇮🇪',
  'Germany': '🇩🇪',
  'France': '🇫🇷',
  'Canada': '🇨🇦',
  'Switzerland': '🇨🇭',
  'Poland': '🇵🇱',
  'Netherlands': '🇳🇱',
  'Sweden': '🇸🇪',
  'Norway': '🇳🇴',
  'Italy': '🇮🇹',
  'Australia': '🇦🇺',
};

function getFlag(country: string): string {
  if (!country) return '';
  // Try exact match first
  if (COUNTRY_FLAGS[country]) return COUNTRY_FLAGS[country];
  // Try case-insensitive
  const lower = country.toLowerCase();
  for (const [key, flag] of Object.entries(COUNTRY_FLAGS)) {
    if (key.toLowerCase() === lower) return flag;
  }
  return '';
}

export function createFamilyCardInnerHtml(d: import('family-chart').TreeDatum): string {
  const data = d.data.data as Record<string, unknown>;
  const firstName = (data['first name'] as string) || '';
  const lastName = (data['last name'] as string) || '';
  const fullName = (data['_fullName'] as string) || `${firstName} ${lastName}`.trim();
  const birthday = (data['birthday'] as string) || '';
  const deathday = (data['deathday'] as string) || '';
  const isLiving = data['_isLiving'] as boolean;
  const gender = (data['_sex'] as string) || (data['gender'] as string) || '';
  const avatar = (data['avatar'] as string) || '';
  const originCountry = (data['_originCountry'] as string) || '';
  const deathCountry = (data['_deathCountry'] as string) || '';

  let lifeSpan = '';
  if (birthday && deathday) {
    lifeSpan = `${birthday} \u2013 ${deathday}`;
  } else if (birthday && isLiving) {
    lifeSpan = `b. ${birthday}`;
  } else if (birthday) {
    lifeSpan = `b. ${birthday}`;
  } else if (deathday) {
    lifeSpan = `d. ${deathday}`;
  }

  const accentColor = gender === 'M' ? '#4a42b0' : gender === 'F' ? '#7ba028' : '#9ca3af';
  const accentBg = gender === 'M' ? 'rgba(74,66,176,0.08)' : gender === 'F' ? 'rgba(123,160,40,0.08)' : 'rgba(156,163,175,0.08)';
  const deceased = !isLiving;

  const photoHtml = avatar
    ? `<img src="${avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid ${accentColor}30;flex-shrink:0;" />`
    : `<div style="
        width: 36px; height: 36px;
        border-radius: 50%;
        background: ${accentBg};
        border: 2px solid ${accentColor}25;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </div>`;

  const livingDot = isLiving
    ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;margin-left:4px;vertical-align:middle;box-shadow:0 0 0 2px rgba(34,197,94,0.2);"></span>'
    : '';

  // Migration indicator
  let migrationHtml = '';
  const originFlag = getFlag(originCountry);
  const deathFlag = getFlag(deathCountry);

  if (originFlag && deathFlag && originFlag !== deathFlag) {
    // Immigrant: born in one country, died in another
    migrationHtml = `<div style="
      font-size: 11px;
      line-height: 1.3;
      margin-top: 2px;
      color: #6b7280;
      display: flex;
      align-items: center;
      gap: 3px;
    "><span style="font-size:12px;">${originFlag}</span><span style="font-size:9px;color:#9ca3af;">→</span><span style="font-size:12px;">${deathFlag}</span></div>`;
  } else if (originFlag) {
    // Non-immigrant: just show origin
    migrationHtml = `<div style="
      font-size: 12px;
      line-height: 1.3;
      margin-top: 2px;
    ">${originFlag}</div>`;
  }

  return `
    <div class="card-inner watson-card ${deceased ? 'deceased' : ''}" style="
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(22, 16, 135, 0.05); /* very subtle outer border */
      border-left: 4px solid ${accentColor};
      border-radius: 12px;
      padding: 12px 14px;
      width: 250px;
      min-height: 76px;
      box-shadow: 0 2px 4px rgba(22, 16, 135, 0.04), 0 8px 16px rgba(22, 16, 135, 0.08); /* Sophisticated deep shadow */
      display: flex;
      align-items: flex-start;
      gap: 12px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      ${deceased ? 'opacity: 0.95;' : ''}
    ">
      ${photoHtml}
      <div style="flex:1;min-width:0;padding-top:2px;">
        <div style="
          font-family: var(--font-fraunces), Georgia, serif; /* Premium typography */
          font-weight: 700;
          font-size: 15px;
          color: ${deceased ? '#1e1496' : '#161087'};
          line-height: 1.2;
          letter-spacing: -0.01em;
          margin-bottom: 4px;
        ">${fullName}</div>
        ${lifeSpan ? `<div style="
          font-size: 11px;
          color: #6b7280;
          line-height: 1.4;
          margin-top: 2px;
        ">${lifeSpan}${livingDot}</div>` : (isLiving ? `<div style="font-size:11px;color:#6b7280;line-height:1.4;margin-top:2px;">Living${livingDot}</div>` : '')}
        ${migrationHtml}
      </div>
    </div>
  `;
}
