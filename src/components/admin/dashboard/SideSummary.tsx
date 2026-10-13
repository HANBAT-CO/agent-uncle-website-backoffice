import { ChatCircleIcon, FolderOpenIcon, LinkIcon, MegaphoneIcon, PaperclipIcon, ShieldCheckIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";

import type { Overview } from "@/lib/admin/rpc";
import { cn } from "@/lib/admin/utils";

const LINE_ICONS = [LinkIcon, ChatCircleIcon, PaperclipIcon, FolderOpenIcon, MegaphoneIcon, ShieldCheckIcon];

/** A compact operational ledger. The bar shows the actual share of uncles at work. */
export function SideSummary({ lines, accounts, maintenanceOn }: { lines: string[]; accounts: Overview["accounts"]; maintenanceOn: boolean }) {
  const share = accounts.uncle > 0 ? Math.min(1, accounts.unclesWorking / accounts.uncle) : 0;
  return (
    <section aria-labelledby="summary-title" data-testid="side-summary" className="console-panel flex min-w-0 flex-col">
      <header className="console-panel-header">
        <h2 id="summary-title" className="console-panel-title">운영 요약</h2>
        <span className="text-[9px] tracking-[.1em] text-muted-foreground">AT A GLANCE</span>
      </header>
      <div className="px-[22px] pb-2">
        <div className="summary-account">
          <div>
            <p className="mb-2 text-[10px] text-muted-foreground">업무 중인 사입삼촌</p>
            <p className="summary-account-count num">{accounts.unclesWorking.toLocaleString("ko-KR")}<small>/ {accounts.uncle.toLocaleString("ko-KR")}명</small></p>
          </div>
          <div className="summary-account-bars" aria-hidden>
            {Array.from({ length: 12 }, (_, index) => <span key={index} data-active={index < Math.round(share * 12)} />)}
          </div>
        </div>
        <p className="border-b border-[var(--console-line)] py-3 text-[10px] leading-relaxed text-muted-foreground">{lines[0]}</p>
        <ul>
          {lines.slice(1).map((line, index) => {
            const alert = index === lines.length - 2 && maintenanceOn;
            const Icon = alert ? WarningCircleIcon : LINE_ICONS[index] ?? ShieldCheckIcon;
            return (
              <li key={line} className={cn("summary-line", alert && "font-semibold text-status-attention")}>
                <Icon aria-hidden weight={alert ? "fill" : "regular"} className={alert ? "!text-status-attention" : undefined} />
                <span>{line}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
