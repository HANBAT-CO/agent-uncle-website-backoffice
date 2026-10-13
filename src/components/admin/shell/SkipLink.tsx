/** First focusable element: jumps past the sidebar and top bar to <main id="main">. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-[60] rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      본문으로 건너뛰기
    </a>
  );
}
