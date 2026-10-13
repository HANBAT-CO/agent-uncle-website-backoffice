"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Checkbox } from "@/components/admin/ui/checkbox";
import { cn } from "@/lib/admin/utils";

import { Pagination } from "./Pagination";
import { SelectionBar } from "./SelectionBar";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the generics are TanStack's declaration
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Numbers are right-aligned (screens 9). */
    align?: "left" | "right" | "center";
    /** CSS width of the column, e.g. '8rem'. */
    width?: string;
    /** The `sort` value that orders by this column, for aria-sort. */
    sortKey?: string;
  }
}

const VIRTUALIZE_ABOVE = 100;
const ROW_HEIGHT = 48;
const INTERACTIVE = "a, button, input, select, textarea, label, [role=checkbox], [role=button], [data-row-click=ignore]";

export type DataTableSort = { key: string; direction: "ascending" | "descending" } | null;

/**
 * Server-paginated list (screens 9 data table kit).
 * - Sticky header with aria-sort, 48px rows, numbers right-aligned via
 *   column meta.
 * - Rows are real links: with `rowHref`, the first data column renders inside
 *   a <Link> (Enter or click opens the detail, middle-click opens a tab), and
 *   a click anywhere else on the row opens it too. Keep other links out of
 *   that first column.
 * - Page and size live in the URL (Pagination); more than 100 rows on a
 *   page (size 200) are virtualized inside the scroll container.
 */
export function DataTable<T>({
  columns,
  rows,
  total,
  page,
  size,
  getRowId,
  rowHref,
  selectable = false,
  footer,
  empty,
  caption,
  sort = null,
  pagination = true,
  maxHeight = "calc(100dvh - 15rem)",
  className,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column value types differ per column
  columns: ColumnDef<T, any>[];
  rows: T[];
  total: number;
  page: number;
  size: number;
  getRowId: (row: T) => string;
  rowHref?: (row: T) => string | null;
  selectable?: boolean;
  footer?: React.ReactNode;
  empty: React.ReactNode;
  caption: string;
  sort?: DataTableSort;
  pagination?: boolean;
  maxHeight?: string;
  className?: string;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<RowSelectionState>({});

  const selectColumn: ColumnDef<T> = {
    id: "__select",
    meta: { width: "2.5rem" },
    header: ({ table }) => (
      <Checkbox
        aria-label="이 페이지 전체 선택"
        checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
        onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox aria-label="이 행 선택" checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(value === true)} />
    ),
  };

  // TanStack's table instance is a mutable object by design; it is created once per render here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns: selectable ? [selectColumn, ...columns] : columns,
    getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: selectable,
    state: { rowSelection: selection },
    onRowSelectionChange: setSelection,
  });

  const modelRows = table.getRowModel().rows;
  const virtual = modelRows.length > VIRTUALIZE_ABOVE;
  const virtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    enabled: virtual,
  });

  const items = virtual ? virtualizer.getVirtualItems() : null;
  const visible = items ? items.map((item) => modelRows[item.index]) : modelRows;
  const padTop = items && items.length > 0 ? items[0].start : 0;
  const padBottom = items && items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  const colCount = table.getVisibleLeafColumns().length;
  const linkColumnId = table.getVisibleLeafColumns().find((column) => column.id !== "__select")?.id ?? null;
  const selectedIds = Object.keys(selection).filter((id) => selection[id]);

  const openRow = (event: React.MouseEvent<HTMLTableRowElement>, href: string | null) => {
    if (!href || event.defaultPrevented || event.button !== 0) return;
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href, { scroll: false });
  };

  return (
    <div className={cn("console-data-table flex min-w-0 flex-col gap-3", className)}>
      {selectable && selectedIds.length > 0 ? <SelectionBar ids={selectedIds} onClear={() => setSelection({})} /> : null}
      {rows.length === 0 ? (
        empty
      ) : (
        <div ref={scrollRef} className="console-table-scroll relative overflow-auto rounded-xl border bg-card" style={{ maxHeight }}>
          <table className="w-full caption-bottom border-separate border-spacing-0 text-[0.8125rem]">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 z-10 bg-muted">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    const sorted = sort && meta?.sortKey === sort.key ? sort.direction : undefined;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={sorted}
                        style={meta?.width ? { width: meta.width } : undefined}
                        className={cn(
                          "h-11 border-b px-4 text-left align-middle text-[0.6875rem] font-medium whitespace-nowrap text-muted-foreground",
                          meta?.align === "right" && "text-right",
                          meta?.align === "center" && "text-center",
                        )}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {padTop > 0 ? (
                <tr aria-hidden>
                  <td colSpan={colCount} style={{ height: padTop }} />
                </tr>
              ) : null}
              {visible.map((row) => {
                const href = rowHref ? rowHref(row.original) : null;
                return (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    onClick={(event) => openRow(event, href)}
                    className={cn(
                      "group/row h-12 transition-colors hover:bg-accent focus-within:bg-accent data-[state=selected]:bg-secondary",
                      href && "cursor-pointer",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      const content = flexRender(cell.column.columnDef.cell, cell.getContext());
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "h-12 max-w-80 border-b border-[var(--console-line)]/65 px-4 align-middle whitespace-nowrap group-last/row:border-b-0",
                            meta?.align === "right" && "num text-right",
                            meta?.align === "center" && "text-center",
                          )}
                        >
                          {href && cell.column.id === linkColumnId ? (
                            <Link href={href} prefetch={false} scroll={false} className="block rounded-sm py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {padBottom > 0 ? (
                <tr aria-hidden>
                  <td colSpan={colCount} style={{ height: padBottom }} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      {footer ? <div className="px-1 text-xs text-muted-foreground">{footer}</div> : null}
      {pagination && total > 0 ? <Pagination total={total} page={page} size={size} /> : null}
    </div>
  );
}
