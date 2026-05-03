/**
 * Subscribe to Next.js App Router route changes by polling pathname.
 *
 * Next.js App Router does not expose a global routeChangeStart event like
 * Pages Router did. This uses a MutationObserver on the <head> element
 * (Next.js updates <title> and other head elements on navigation) combined
 * with popstate, which fires on back/forward navigation.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToRouteChange(callback: () => void): () => void {
  let currentPath = window.location.pathname + window.location.search;

  function check() {
    const newPath = window.location.pathname + window.location.search;
    if (newPath !== currentPath) {
      currentPath = newPath;
      callback();
    }
  }

  // popstate fires on browser back/forward
  window.addEventListener('popstate', check);

  // MutationObserver on <head> catches client-side navigations
  // (Next.js updates <title> element on route change)
  const observer = new MutationObserver(check);
  if (document.head) {
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  }

  return () => {
    window.removeEventListener('popstate', check);
    observer.disconnect();
  };
}
