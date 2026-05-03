import type { ContributionEntity } from '@/lib/contributions/types';
import { generateSelector } from './generateSelector';

export interface ClickResolution {
  target: Element;
  entity: ContributionEntity | null;
  selector: string;
}

/**
 * Resolve entity anchoring and debug selector from a pointer event.
 *
 * Scans event.composedPath() — NOT element.closest() — for the first element
 * carrying both data-comment-anchor-type and data-comment-anchor-id.
 * composedPath() crosses shadow root boundaries; closest() does not.
 */
export function resolveClickTarget(event: PointerEvent): ClickResolution {
  const path = event.composedPath();
  const target = (path[0] instanceof Element ? path[0] : path[1]) as Element;

  let entity: ContributionEntity | null = null;
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    const type = node.getAttribute('data-comment-anchor-type');
    const id = node.getAttribute('data-comment-anchor-id');
    if (type && id) {
      entity = { type, id };
      break;
    }
  }

  const selector = target ? generateSelector(target) : '';

  return { target, entity, selector };
}
