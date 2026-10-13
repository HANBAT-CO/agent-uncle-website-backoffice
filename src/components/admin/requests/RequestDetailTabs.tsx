"use client";

import { CheckIcon, FolderOpenIcon, LinkIcon, NotePencilIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/admin/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/admin/ui/tabs";
import { cn } from "@/lib/admin/utils";

export type DetailTab = {
  key: string;
  label: string;
  count?: number | null;
  content: React.ReactNode;
};

const NOTES_TAB = "notes";

/**
 * The client half of RequestDetail: the header row with the actions
 * "링크 복사", "메모 남기기" and "케이스 열기" (the last two jump to the
 * 운영 메모 · 케이스 tab and focus its form), the summary, and the tab strip.
 * Every panel stays mounted, so a half-typed note or opened photos survive a
 * tab switch.
 */
export function RequestDetailTabs({
  header,
  summary,
  tabs,
  requestPath,
  canWrite,
  hasOpenCase,
  inSheet = false,
}: {
  inSheet?: boolean;
  header: React.ReactNode;
  summary: React.ReactNode;
  tabs: DetailTab[];
  requestPath: string;
  canWrite: boolean;
  hasOpenCase: boolean;
}) {
  const [tab, setTab] = useState(tabs[0]?.key ?? "");
  const [copied, setCopied] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const jump = (selector: string) => {
    setTab(NOTES_TAB);
    window.requestAnimationFrame(() => {
      const field = notesRef.current?.querySelector<HTMLElement>(selector);
      field?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      field?.focus({ preventScroll: true });
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(requestPath, window.location.origin).href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className={cn("flex flex-col items-start gap-5 border-b border-[var(--console-line)] pb-5", inSheet && "pr-6")}>
        {header}
        <div role="toolbar" aria-label="요청 작업" className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="lg" className="h-9 bg-card" onClick={copyLink}>
            {copied ? <CheckIcon aria-hidden data-icon="inline-start" /> : <LinkIcon aria-hidden data-icon="inline-start" />}
            <span aria-live="polite">{copied ? "링크를 복사했어요" : "링크 복사"}</span>
          </Button>
          {canWrite ? (
            <Button type="button" variant="default" size="lg" className="h-9 px-3" onClick={() => jump('form[aria-label="메모 남기기"] textarea')}>
              <NotePencilIcon aria-hidden data-icon="inline-start" />
              메모 남기기
            </Button>
          ) : null}
          {canWrite && !hasOpenCase ? (
            <Button type="button" variant="outline" size="lg" className="h-9 bg-card" onClick={() => jump('form[aria-label="케이스 열기"] input[name="title"]')}>
              <FolderOpenIcon aria-hidden data-icon="inline-start" />
              케이스 열기
            </Button>
          ) : null}
        </div>
      </div>

      {summary}

      <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-5">
        <div className="-mx-1 overflow-x-auto border-b px-1">
          <TabsList variant="line" aria-label="요청 상세" className="h-10! min-w-max gap-1">
            {tabs.map((item) => (
              <TabsTrigger key={item.key} value={item.key} className="h-10 flex-none px-3 text-sm">
                {item.label}
                {item.count !== undefined && item.count !== null ? (
                  <span className="num rounded-full bg-muted px-1.5 py-px text-[0.6875rem] font-medium text-muted-foreground">{item.count}</span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map((item) => (
          <TabsContent
            key={item.key}
            value={item.key}
            forceMount
            ref={item.key === NOTES_TAB ? notesRef : undefined}
            className="min-w-0 text-sm data-[state=inactive]:hidden"
          >
            {item.content}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
