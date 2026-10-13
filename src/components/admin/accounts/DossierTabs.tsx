"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

import { Button } from "@/components/admin/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/admin/ui/tabs";

/*
 * Dossier tabs (screens 10.7). The active tab lives in `?tab=` (shallow, no
 * server round trip), so a pasted link and a reload reopen it. Every panel
 * stays mounted and is only hidden, so an opened document and a half-typed
 * form survive switching tabs.
 */

export const DOSSIER_TABS = ["profile", "documents", "connections", "requests", "attachments", "history", "notes"] as const;
export type DossierTab = (typeof DOSSIER_TABS)[number];

export const DOSSIER_TAB_LABEL: Record<DossierTab, string> = {
  profile: "프로필",
  documents: "서류",
  connections: "연결",
  requests: "요청 이력",
  attachments: "첨부",
  history: "처리 이력",
  notes: "운영 메모 · 케이스",
};

const tabParser = parseAsStringLiteral(DOSSIER_TABS).withDefault("profile");

function useDossierTab() {
  return useQueryState("tab", tabParser.withOptions({ scroll: false, history: "replace" }));
}

export function DossierTabs({ panels, counts = {} }: { panels: Record<DossierTab, React.ReactNode>; counts?: Partial<Record<DossierTab, number>> }) {
  const [tab, setTab] = useDossierTab();

  return (
    <Tabs value={tab} onValueChange={(value) => void setTab(value === "profile" ? null : (value as DossierTab))} className="gap-4">
      <TabsList variant="line" aria-label="계정 정보" className="h-auto w-full flex-wrap justify-start gap-1 border-b px-0 pb-0">
        {DOSSIER_TABS.map((key) => (
          <TabsTrigger key={key} value={key} className="h-9 flex-none px-3 text-sm group-data-horizontal/tabs:after:bottom-[-1px] data-[state=active]:font-semibold">
            {DOSSIER_TAB_LABEL[key]}
            {counts[key] ? <span className="num text-xs font-normal text-muted-foreground">{counts[key]}</span> : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {DOSSIER_TABS.map((key) => (
        <TabsContent key={key} value={key} forceMount className="text-sm data-[state=inactive]:hidden">
          {panels[key]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** A header action that opens one dossier tab ("서류 확인", "메모 남기기", "케이스 열기"). */
export function DossierTabButton({ tab, children, icon }: { tab: DossierTab; children: React.ReactNode; icon?: React.ReactNode }) {
  const [, setTab] = useDossierTab();
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={() => {
        void setTab(tab === "profile" ? null : tab);
        document.getElementById("dossier-tabs")?.scrollIntoView({ block: "start", behavior: "smooth" });
      }}
    >
      {icon}
      {children}
    </Button>
  );
}
