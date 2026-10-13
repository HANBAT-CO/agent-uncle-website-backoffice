/**
 * Run `callback` once the browser is idle after hydration, at the latest
 * after `timeout` ms (spec S1: the draw-in starts on idle with a 300ms
 * timeout). Safari has no requestIdleCallback: a timeout stands in. Returns a
 * cancel function. Client only.
 */
export function onIdle(callback: () => void, timeout = 300): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(() => callback(), { timeout });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, Math.min(timeout, 120));
  return () => window.clearTimeout(handle);
}
