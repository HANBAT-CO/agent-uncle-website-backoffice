"use client";

export function PrintButton() {
  return (
    <button type="button" className="legal-print" onClick={() => window.print()}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M7 8V3h10v5M7 17H4V8h16v9h-3M7 14h10v7H7zM16 11h1" />
      </svg>
      인쇄·PDF 저장
    </button>
  );
}
