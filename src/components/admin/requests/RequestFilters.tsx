"use client";

import { CaretDownIcon, StorefrontIcon, TruckIcon, UserIcon } from "@phosphor-icons/react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useEffect, useRef, useState, useTransition } from "react";

import { DateRangeFilter } from "@/components/admin/data-table/DateRangeFilter";
import { Button } from "@/components/admin/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/admin/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/admin/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/admin/ui/select";
import { roleKindLabel } from "@/lib/admin/labels";
import { searchAccountsAction } from "@/lib/admin/shared-actions";
import { cn } from "@/lib/admin/utils";

import { REQUEST_CONDITIONS } from "./request-model";

/** 기간 (요청 시각, KST days), 거래처 and 조건 (screens 10.9). Every value lives in the URL. */
export function RequestFilters({ accountId, accountName }: { accountId: string | null; accountName: string | null }) {
  return (
    <>
      <DateRangeFilter label="기간" />
      <AccountCombobox activeId={accountId} selectedName={accountName} />
      <ConditionSelect />
    </>
  );
}

const SEARCH_DEBOUNCE_MS = 200;
type AccountOption = { id: string; name: string; role: string | null };

function RoleIcon({ role }: { role: string | null }) {
  const Icon = role === "retailer" ? StorefrontIcon : role === "uncle" ? TruckIcon : UserIcon;
  return <Icon aria-hidden weight="bold" className="size-3.5 text-muted-foreground" />;
}

/**
 * 거래처 combobox: finds accounts through backoffice_search and sets
 * `?account=`. Hangul-safe like the list search: nothing is sent while an
 * IME composition is open, and the query is read again when the timer fires.
 */
function AccountCombobox({ activeId, selectedName }: { activeId: string | null; selectedName: string | null }) {
  const [pending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(
    { account: parseAsString, page: parseAsInteger },
    { shallow: false, scroll: false, startTransition },
  );
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<AccountOption | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AccountOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState("");
  const composing = useRef(false);
  const timer = useRef<number | null>(null);
  const latest = useRef("");
  const queryRef = useRef("");

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const run = async () => {
    timer.current = null;
    if (composing.current) return;
    const term = queryRef.current.trim();
    latest.current = term;
    if (!term) {
      setResults([]);
      setSearched("");
      return;
    }
    setSearching(true);
    const found = await searchAccountsAction(term);
    if (latest.current !== term) return; // a newer query is on its way
    setResults(found);
    setSearched(term);
    setSearching(false);
  };

  const schedule = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(), SEARCH_DEBOUNCE_MS);
  };

  const select = (option: AccountOption | null) => {
    setOpen(false);
    setPicked(option);
    void setParams({ account: option ? option.id : null, page: null });
  };

  // The server validated the id (activeId); the name comes from the rows, or from the pick itself.
  const label = activeId ? (selectedName ?? (picked?.id === activeId ? picked.name : null) ?? "선택한 거래처") : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          role="combobox"
          aria-expanded={open}
          aria-busy={pending || undefined}
          aria-label={label ? `거래처: ${label}` : "거래처"}
          className={cn("h-9 max-w-60 bg-card text-sm", label && "border-primary/50 font-semibold")}
        >
          <span className="truncate">{label ?? "거래처"}</span>
          <CaretDownIcon aria-hidden data-icon="inline-end" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            placeholder="이름·매장명으로 찾기"
            aria-label="거래처 찾기"
            onValueChange={(value) => {
              setQuery(value);
              queryRef.current = value;
              if (!composing.current) schedule();
            }}
            onCompositionStart={() => {
              composing.current = true;
              if (timer.current) window.clearTimeout(timer.current);
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              queryRef.current = event.currentTarget.value;
              schedule();
            }}
            className="text-sm"
          />
          <CommandList>
            {params.account ? (
              <CommandGroup>
                <CommandItem value="__clear" onSelect={() => select(null)} className="text-sm text-muted-foreground">
                  거래처 선택 해제
                </CommandItem>
              </CommandGroup>
            ) : null}
            {results.length > 0 ? (
              <CommandGroup heading="계정">
                {results.map((option) => (
                  <CommandItem key={option.id} value={option.id} onSelect={() => select(option)} className="text-sm">
                    <RoleIcon role={option.role} />
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    <span className="text-xs text-muted-foreground">{roleKindLabel(option.role)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <p aria-live="polite" className={cn("px-3 text-center text-xs text-muted-foreground", (searching || (searched && results.length === 0) || !query.trim()) && "py-4")}>
              {searching ? "찾는 중…" : searched && results.length === 0 ? `"${searched}"에 맞는 거래처가 없어요` : !query.trim() ? "이름이나 매장명을 입력해 주세요." : ""}
            </p>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const ALL = "__all";

/** 조건 (single select) in `?cond=`; the RPC's p_attention. */
function ConditionSelect() {
  const [pending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(
    { cond: parseAsString, page: parseAsInteger },
    { shallow: false, scroll: false, startTransition },
  );
  const current = REQUEST_CONDITIONS.find((condition) => condition.key === params.cond) ?? null;

  return (
    <Select value={current?.key ?? ALL} onValueChange={(next) => void setParams({ cond: next === ALL ? null : next, page: null })}>
      <SelectTrigger
        aria-label="조건"
        aria-busy={pending || undefined}
        className={cn("h-9 min-w-36 bg-card text-sm", current && "border-primary/50 font-semibold")}
      >
        <SelectValue>{current ? current.label : "조건 전체"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="text-sm">
          조건 전체
        </SelectItem>
        {REQUEST_CONDITIONS.map((condition) => (
          <SelectItem key={condition.key} value={condition.key} className="text-sm">
            {condition.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
