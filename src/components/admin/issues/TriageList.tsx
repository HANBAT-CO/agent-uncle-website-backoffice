"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Pagination } from "@/components/admin/data-table/Pagination";
import { useListHref } from "@/components/admin/data-table/use-list-href";
import { cn } from "@/lib/admin/utils";

export type TriageColumn<T> = {
  id: string;
  header: string;
  align?: "right";
  cell: (row: T) => React.ReactNode;
};

const INTERACTIVE = "a, button, input, select, textarea, label";

/**
 * The list pane of the 문제·정정 triage (screens 10.12). Each row selects the
 * record into the detail and 속성 panes through `?item=` (a real link in the
 * first cell, so Enter and middle-click work); the selected row carries
 * aria-current. Rows are 48px with a bold first line, like the data table kit.
 */
export function TriageList<T>({
  caption,
  columns,
  rows,
  getId,
  selectedId,
  total,
  page,
  size,
  empty,
}: {
  caption: string;
  columns: TriageColumn<T>[];
  rows: T[];
  getId: (row: T) => string;
  selectedId: string | null;
  total: number;
  page: number;
  size: number;
  empty: React.ReactNode;
}) {
  const router = useRouter();
  const hrefWith = useListHref();
  const hrefFor = (row: T) => hrefWith({ item: getId(row), page: page > 1 ? page : null });

  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="overflow-auto rounded-xl border bg-card" style={{ maxHeight: "calc(100dvh - 19rem)" }}>
        <table className="w-full border-separate border-spacing-0 text-[0.8125rem]">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    "h-10 border-b px-2.5 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = getId(row);
              const selected = id === selectedId;
              const href = hrefFor(row);
              return (
                <tr
                  key={id}
                  data-state={selected ? "selected" : undefined}
                  onClick={(event) => {
                    if (event.button !== 0 || (event.target as HTMLElement).closest(INTERACTIVE)) return;
                    router.push(href, { scroll: false });
                  }}
                  className="group/row h-12 cursor-pointer transition-colors hover:bg-accent data-[state=selected]:bg-secondary data-[state=selected]:[&_.text-muted-foreground]:text-foreground/75"
                >
                  {columns.map((column, index) => (
                    <td
                      key={column.id}
                      className={cn(
                        "h-12 border-b px-2.5 align-middle whitespace-nowrap group-last/row:border-b-0",
                        column.align === "right" && "num text-right",
                        index === 0 && "relative",
                      )}
                    >
                      {index === 0 ? (
                        <Link
                          href={href}
                          scroll={false}
                          prefetch={false}
                          aria-current={selected ? "true" : undefined}
                          className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          {selected ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" /> : null}
                          {column.cell(row)}
                        </Link>
                      ) : (
                        column.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {total > 0 ? <Pagination total={total} page={page} size={size} /> : null}
    </div>
  );
}
