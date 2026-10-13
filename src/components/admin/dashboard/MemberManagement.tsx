import { ArrowUpRightIcon, HandshakeIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { Overview } from "@/lib/admin/rpc";

/** Both sides of the marketplace share the existing role-filtered account directory. */
export function MemberManagement({ accounts, includeDemo }: { accounts: Overview["accounts"]; includeDemo: boolean }) {
  const members = [
    { role: "uncle", label: "사입삼춘 관리", description: "가입·서류·업무 상태", count: accounts.uncle },
    { role: "retailer", label: "소매상 관리", description: "가입·서류·이용 상태", count: accounts.retailer },
  ] as const;

  return (
    <section aria-labelledby="member-management-title" className="console-panel" data-testid="member-management">
      <header className="console-panel-header">
        <h2 id="member-management-title" className="console-panel-title">회원 관리</h2>
        <Link href={`/admin/connections${includeDemo ? "?demo=1" : ""}`} className="member-connections-link">
          <HandshakeIcon aria-hidden className="size-4" />
          거래처 연결
          <ArrowUpRightIcon aria-hidden className="size-3" />
        </Link>
      </header>
      <div className="member-directory">
        {members.map((member, index) => (
          <Link key={member.role} href={`/admin/accounts?role=${member.role}${includeDemo ? "&demo=1" : ""}`} className="member-directory-link">
            <div className="member-directory-copy">
              <span aria-hidden className="member-directory-index num">0{index + 1}</span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold tracking-tight">{member.label}</h3>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{member.description}</p>
              </div>
            </div>
            <div className="member-directory-total">
              <span className="num">{member.count.toLocaleString("ko-KR")}<small>명</small></span>
              <ArrowUpRightIcon aria-hidden className="member-directory-arrow" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
