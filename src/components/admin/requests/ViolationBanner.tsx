import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";

import { VIOLATION_NOTE, violationLabels } from "@/lib/admin/labels";

/** Ledger rules broken (screens 10.9): the red banner with the codes in Korean. Nothing when the ledger is sound. */
export function ViolationBanner({ codes }: { codes: readonly string[] }) {
  if (codes.length === 0) return null;
  return (
    <section
      role="alert"
      data-testid="violation-banner"
      className="flex gap-3 rounded-xl border border-status-attention/30 bg-status-attention-bg px-4 py-3 text-status-attention"
    >
      <WarningCircleIcon aria-hidden weight="fill" className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-sm font-bold">수량 기록이 서로 맞지 않아요</p>
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-sm">
          {violationLabels(codes).map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <p className="text-xs">{VIOLATION_NOTE}</p>
      </div>
    </section>
  );
}
