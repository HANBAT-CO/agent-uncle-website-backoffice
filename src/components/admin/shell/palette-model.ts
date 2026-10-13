import type { EntityKind } from "@/lib/admin/nav";

/*
 * Pure helpers for the ⌘K palette and the /admin/search page (screens
 * appendix 9): recent items, Hangul-safe highlighting, scope parsing.
 */

/** localStorage key for 최근 항목: ids and labels only, never contact data. */
export const RECENT_STORAGE_KEY = "au-admin-recent";
export const RECENT_LIMIT = 5;

export type RecentItem = { kind: EntityKind; id: string; label: string };

const KINDS: readonly EntityKind[] = ["account", "request", "lead"];

function toRecent(value: unknown): RecentItem | null {
  if (typeof value !== "object" || value === null) return null;
  const { kind, id, label } = value as Record<string, unknown>;
  if (typeof kind !== "string" || !KINDS.includes(kind as EntityKind)) return null;
  if (typeof id !== "string" || id.length === 0 || id.length > 200) return null;
  if (typeof label !== "string") return null;
  return { kind: kind as EntityKind, id, label: label.slice(0, 120) };
}

/** The stored list, newest first; anything malformed is dropped. */
export function parseRecent(raw: string | null | undefined): RecentItem[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(toRecent)
    .filter((item): item is RecentItem => item !== null)
    .slice(0, RECENT_LIMIT);
}

/** Adds `item` to the front, removing an older copy, keeping 5. */
export function pushRecent(list: readonly RecentItem[], item: RecentItem): RecentItem[] {
  const clean = toRecent(item);
  if (!clean) return list.slice(0, RECENT_LIMIT);
  return [clean, ...list.filter((entry) => !(entry.kind === clean.kind && entry.id === clean.id))].slice(0, RECENT_LIMIT);
}

export type HighlightPart = { text: string; match: boolean };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits `text` around case-insensitive occurrences of the trimmed query, the
 * same substring rule as backoffice_search (ILIKE '%q%'). Render matches in
 * <mark>; the text itself is never treated as HTML.
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
  if (!text) return [];
  const term = query.trim();
  if (!term) return [{ text, match: false }];
  const pattern = new RegExp(`(${escapeRegExp(term)})`, "giu");
  return text
    .split(pattern)
    .filter((piece) => piece.length > 0)
    .map((piece) => ({ text: piece, match: piece.toLocaleLowerCase("ko") === term.toLocaleLowerCase("ko") }));
}

function fold(value: string): string {
  return value.toLocaleLowerCase("ko").replace(/[\s·]/g, "");
}

/** Client-side match for the 화면 and 바로가기 groups. */
export function matchesQuery(label: string, query: string): boolean {
  const term = fold(query);
  return term.length === 0 || fold(label).includes(term);
}

export const SEARCH_SCOPES = ["all", "accounts", "requests", "leads"] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export function parseScope(value: string | string[] | undefined): SearchScope {
  const raw = Array.isArray(value) ? value[0] : value;
  return SEARCH_SCOPES.includes(raw as SearchScope) ? (raw as SearchScope) : "all";
}
