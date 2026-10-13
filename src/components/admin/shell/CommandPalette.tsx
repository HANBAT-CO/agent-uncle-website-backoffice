"use client";

import {
  ArrowRightIcon,
  ClockCounterClockwiseIcon,
  EnvelopeSimpleIcon,
  LightningIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StatusChip } from "@/components/admin/common/StatusChip";
import { Button } from "@/components/admin/ui/button";
import { CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/admin/ui/command";
import { Kbd } from "@/components/admin/ui/kbd";
import { LEAD_ROLE_LABEL, roleKindLabel } from "@/lib/admin/labels";
import { NAV_FOOTER, entityHref, visibleNav, visibleShortcuts, type AdminHref, type EntityKind } from "@/lib/admin/nav";
import type { AdminRole } from "@/lib/admin/roles";
import type { SearchResult } from "@/lib/admin/rpc/schemas";
import { searchAction } from "@/lib/admin/shared-actions";
import { cn } from "@/lib/admin/utils";

import { Highlight } from "./Highlight";
import { NAV_ICONS } from "./nav-icons";
import { RECENT_STORAGE_KEY, matchesQuery, parseRecent, pushRecent, type RecentItem } from "./palette-model";

const DEBOUNCE_MS = 200;
const MAX_QUERY = 100;
const PLACEHOLDER = "이름, 매장명, 상품명, 요청 ID로 찾기";

const KIND_LABEL: Record<EntityKind, string> = { account: "계정", request: "요청", lead: "문의" };
const KIND_ICON = { account: UsersThreeIcon, request: PackageIcon, lead: EnvelopeSimpleIcon } as const;

type Results = { term: string; data: SearchResult | null };

function readRecent(): RecentItem[] {
  try {
    return parseRecent(window.localStorage.getItem(RECENT_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeRecent(items: RecentItem[]): void {
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private mode or a full quota: recent items are a convenience only.
  }
}

function joinDot(parts: (string | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" · ");
}

/** cmdk value of the first search hit, in render order (계정, 요청, 문의). */
function firstHitValue(data: SearchResult | null): string | null {
  if (!data) return null;
  if (data.accounts[0]) return `account:${data.accounts[0].id}`;
  if (data.requests[0]) return `request:${data.requests[0].id}`;
  if (data.leads[0]) return `lead:${data.leads[0].id}`;
  return null;
}

const itemClass = "min-h-11 gap-3 rounded-lg px-2.5 py-2 text-[0.8125rem]";
const groupClass = "p-1.5 **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1";

function Lines({ title, sub, query }: { title: string; sub?: string; query: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <Highlight text={title} query={query} className="truncate font-semibold text-foreground" />
      {sub ? <Highlight text={sub} query={query} className="truncate text-xs text-muted-foreground" /> : null}
    </span>
  );
}

/**
 * ⌘K palette (screens appendix 9): 계정 / 요청 / 문의 from backoffice_search,
 * 화면 from the role's nav, 바로가기, and 최근 항목 (localStorage, ids and
 * labels only). Hangul-safe: nothing is sent while an IME composition is
 * open; the final text goes out 200 ms after compositionend, so the last
 * syllable is never dropped.
 */
export function CommandPalette({ role }: { role: AdminRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  // Controlled cmdk selection: while results load, "전체 결과 보기" is the
  // only item and cmdk selects it; once hits arrive, Enter must open the first one.
  const [selected, setSelected] = useState("");
  const seq = useRef(0);

  const term = query.trim().slice(0, MAX_QUERY);

  const changeOpen = useCallback((next: boolean) => {
    if (next) {
      setRecent(readRecent());
    } else {
      seq.current += 1;
      setQuery("");
      setResults(null);
      setFailed(null);
      setComposing(false);
      setSelected("");
    }
    setOpen(next);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      // With a Korean layout active, event.key can be the jamo; the physical key is still KeyK.
      if (event.key.toLowerCase() !== "k" && event.code !== "KeyK") return;
      event.preventDefault();
      changeOpen(!open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, changeOpen]);

  useEffect(() => {
    if (!open || composing || !term) return;
    const timer = window.setTimeout(() => {
      const id = ++seq.current;
      searchAction(term).then(
        (data) => {
          if (id !== seq.current) return;
          setResults({ term, data });
          setFailed(data === null ? term : null);
          const first = firstHitValue(data);
          if (first) setSelected(first);
        },
        () => {
          if (id !== seq.current) return;
          setFailed(term);
        },
      );
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [open, composing, term]);

  const go = useCallback(
    (href: AdminHref, item?: RecentItem) => {
      if (item) writeRecent(pushRecent(readRecent(), item));
      changeOpen(false);
      router.push(href);
    },
    [changeOpen, router],
  );

  const screens = useMemo(
    () => [
      ...visibleNav(role).flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))),
      ...NAV_FOOTER.map((item) => ({ ...item, group: "내 정보" })),
    ],
    [role],
  );
  const shortcuts = useMemo(() => visibleShortcuts(role), [role]);

  const matchedScreens = screens.filter((screen) => matchesQuery(screen.label, term));
  const matchedShortcuts = shortcuts.filter((shortcut) => matchesQuery(shortcut.label, term));
  const data = term && results ? results.data : null;
  const accounts = data?.accounts ?? [];
  const requests = data?.requests ?? [];
  const leads = data?.leads ?? [];
  const settled = term !== "" && results?.term === term && !composing;
  const searching = term !== "" && !settled && failed !== term;
  const nothing =
    settled && accounts.length + requests.length + leads.length + matchedScreens.length + matchedShortcuts.length === 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => changeOpen(true)}
        aria-keyshortcuts="Meta+K Control+K"
        aria-haspopup="dialog"
        className="h-8 w-full max-w-72 min-w-44 justify-start gap-2 rounded-full bg-card px-3 text-xs font-normal text-muted-foreground hover:bg-card hover:text-foreground"
      >
        <MagnifyingGlassIcon aria-hidden className="size-3.5" />
        <span className="truncate">계정·요청·화면 찾기</span>
        <Kbd className="ml-auto bg-muted text-[0.6875rem]">⌘K</Kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={changeOpen}
        className="top-[14vh] sm:max-w-xl"
        commandProps={{
          shouldFilter: false,
          loop: true,
          label: "계정·요청·화면 찾기",
          className: "rounded-xl p-0",
          value: selected,
          onValueChange: setSelected,
        }}
      >
        <div className="border-b p-2">
          <CommandInput
            placeholder={PLACEHOLDER}
            value={query}
            onValueChange={setQuery}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(event) => {
              setComposing(false);
              setQuery(event.currentTarget.value);
            }}
            maxLength={MAX_QUERY}
            aria-label="찾을 내용"
            data-testid="palette-input"
            className="text-sm"
          />
        </div>
        <CommandList className="max-h-[min(60vh,32rem)] px-1 pb-1.5" data-testid="palette-list">
          <div aria-live="polite" className="sr-only">
            {searching ? "찾는 중…" : settled ? `${accounts.length + requests.length + leads.length}건 찾았어요` : ""}
          </div>
          {searching && !data ? <p className="px-3.5 py-3 text-xs text-muted-foreground">찾는 중…</p> : null}
          {failed === term && term ? (
            <p role="alert" className="px-3.5 py-3 text-xs text-status-attention">
              결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
            </p>
          ) : null}
          {nothing ? (
            <p className="px-3.5 py-8 text-center text-sm text-muted-foreground" data-testid="palette-empty">
              &quot;{term}&quot;에 맞는 결과가 없어요
            </p>
          ) : null}

          {!term && recent.length > 0 ? (
            <CommandGroup heading="최근 항목" className={groupClass}>
              {recent.map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <CommandItem
                    key={`recent:${item.kind}:${item.id}`}
                    value={`recent:${item.kind}:${item.id}`}
                    onSelect={() => go(entityHref(item), item)}
                    className={itemClass}
                  >
                    <ClockCounterClockwiseIcon aria-hidden className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.label}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Icon aria-hidden className="size-3.5" />
                      {KIND_LABEL[item.kind]}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {accounts.length > 0 ? (
            <CommandGroup heading="계정" className={groupClass}>
              {accounts.map((account) => {
                const label = account.name || account.businessName || "이름 없는 계정";
                return (
                  <CommandItem
                    key={`account:${account.id}`}
                    value={`account:${account.id}`}
                    onSelect={() => go(entityHref({ kind: "account", id: account.id }), { kind: "account", id: account.id, label })}
                    className={itemClass}
                  >
                    <UsersThreeIcon aria-hidden className="size-4 text-muted-foreground" />
                    <Lines
                      title={label}
                      sub={joinDot([
                        roleKindLabel(account.role),
                        account.name ? account.businessName : null,
                        account.phoneTail ? `연락처 끝 ${account.phoneTail}` : null,
                        account.complete ? null : "가입 미완료",
                      ])}
                      query={term}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {requests.length > 0 ? (
            <CommandGroup heading="요청" className={groupClass}>
              {requests.map((request) => {
                const label = joinDot([request.product, request.option]) || "상품명 없음";
                return (
                  <CommandItem
                    key={`request:${request.id}`}
                    value={`request:${request.id}`}
                    onSelect={() => go(entityHref({ kind: "request", id: request.id }), { kind: "request", id: request.id, label })}
                    className={itemClass}
                  >
                    <PackageIcon aria-hidden className="size-4 text-muted-foreground" />
                    <Lines title={label} sub={joinDot([request.retailer, request.uncle ? `${request.uncle}에게` : null])} query={term} />
                    <StatusChip label={request.label} className="h-5 text-[0.6875rem]" />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {leads.length > 0 ? (
            <CommandGroup heading="문의" className={groupClass}>
              {leads.map((lead) => {
                const label = lead.businessName || lead.name || "이름 없는 문의";
                return (
                  <CommandItem
                    key={`lead:${lead.id}`}
                    value={`lead:${lead.id}`}
                    onSelect={() => go(entityHref({ kind: "lead", id: lead.id, label: lead.businessName ?? undefined }), { kind: "lead", id: lead.id, label })}
                    className={itemClass}
                  >
                    <EnvelopeSimpleIcon aria-hidden className="size-4 text-muted-foreground" />
                    <Lines
                      title={label}
                      sub={joinDot([LEAD_ROLE_LABEL[lead.role] ?? lead.role, lead.businessName ? lead.name : null])}
                      query={term}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {(accounts.length || requests.length || leads.length) && matchedScreens.length ? <CommandSeparator /> : null}

          {matchedScreens.length > 0 ? (
            <CommandGroup heading="화면" className={groupClass}>
              {matchedScreens.map((screen) => {
                const Icon = NAV_ICONS[screen.icon];
                return (
                  <CommandItem key={`screen:${screen.key}`} value={`screen:${screen.key}`} onSelect={() => go(screen.href)} className={cn(itemClass, "min-h-9")}>
                    <Icon aria-hidden className="size-4 text-muted-foreground" />
                    <Highlight text={screen.label} query={term} className="min-w-0 flex-1 truncate font-medium text-foreground" />
                    <span className="shrink-0 text-xs text-muted-foreground">{screen.group}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {matchedShortcuts.length > 0 ? (
            <CommandGroup heading="바로가기" className={groupClass}>
              {matchedShortcuts.map((shortcut) => (
                <CommandItem
                  key={`shortcut:${shortcut.key}`}
                  value={`shortcut:${shortcut.key}`}
                  onSelect={() => go(shortcut.href)}
                  className={cn(itemClass, "min-h-9")}
                >
                  <LightningIcon aria-hidden className="size-4 text-muted-foreground" />
                  <Highlight text={shortcut.label} query={term} className="min-w-0 flex-1 truncate font-medium text-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {term && !nothing ? (
            <CommandGroup className={groupClass}>
              <CommandItem
                value="search-page"
                onSelect={() => go(`/admin/search?q=${encodeURIComponent(term)}`)}
                className={cn(itemClass, "min-h-9 text-muted-foreground")}
              >
                <ArrowRightIcon aria-hidden className="size-4" />
                <span className="min-w-0 flex-1 truncate">&quot;{term}&quot; 전체 결과 보기</span>
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
