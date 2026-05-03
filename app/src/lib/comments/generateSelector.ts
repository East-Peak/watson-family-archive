const MAX_DEPTH = 5;

function describeElement(el: Element): string {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList)
    .filter((c) => !c.startsWith('__') && c.length < 40)
    .slice(0, 3)
    .map((c) => `.${c}`)
    .join('');
  return `${tag}${classes}`;
}

/**
 * Build a short debug-only CSS selector for a DOM element.
 * NOT used for anchoring — only aids Stuart during triage.
 */
export function generateSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;

  while (current && current !== document.documentElement && depth < MAX_DEPTH) {
    const desc = describeElement(current);
    parts.unshift(desc);
    // Short-circuit on id — already unique
    if (current.id) break;
    current = current.parentElement;
    depth++;
  }

  return parts.join(' > ');
}
