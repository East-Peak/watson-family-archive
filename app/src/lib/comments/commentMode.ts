import { resolveClickTarget, type ClickResolution } from './captureClick';
import { subscribeToRouteChange } from './subscribeToRouteChange';

export interface CommentModeResult {
  exit: () => void;
}

export function enterCommentMode(
  onCapture: (resolution: ClickResolution) => void,
): CommentModeResult {
  let cleaned = false;

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    document.removeEventListener('pointerdown', pointerHandler, true);
    document.removeEventListener('keydown', escHandler, true);
    routeChangeUnsubscribe();
    document.body.classList.remove('comment-mode-active');
  }

  function pointerHandler(event: PointerEvent) {
    if (event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    const path = event.composedPath();

    if (path.some((node) => node instanceof Element && node.hasAttribute('data-comment-chrome'))) {
      return;
    }

    if (path.some((node) => node instanceof Element && node.hasAttribute('data-comment-skip'))) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const resolution = resolveClickTarget(event);
    cleanup();
    onCapture(resolution);
  }

  function escHandler(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      cleanup();
    }
  }

  document.addEventListener('pointerdown', pointerHandler, true);
  document.addEventListener('keydown', escHandler, true);
  document.body.classList.add('comment-mode-active');

  const routeChangeUnsubscribe = subscribeToRouteChange(cleanup);

  return { exit: cleanup };
}
