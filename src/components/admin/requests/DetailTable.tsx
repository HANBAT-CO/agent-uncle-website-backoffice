import { cn } from "@/lib/admin/utils";

export type DetailColumn = { header: string; align?: "left" | "right"; className?: string };

/** A small read-only table for the request detail tabs: 40px header, roomy rows, numbers right-aligned. */
export function DetailTable({
  caption,
  columns,
  rows,
  empty,
  testId,
}: {
  caption: string;
  columns: DetailColumn[];
  rows: { key: string; cells: React.ReactNode[] }[];
  empty: string;
  testId?: string;
}) {
  if (rows.length === 0) {
    return <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table data-testid={testId} className="w-full border-separate border-spacing-0 text-[0.8125rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={cn(
                  "h-10 border-b px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground",
                  column.align === "right" && "text-right",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="group/row">
              {row.cells.map((cell, index) => (
                <td
                  key={columns[index]?.header ?? index}
                  className={cn(
                    "border-b px-3 py-2.5 align-top group-last/row:border-b-0",
                    columns[index]?.align === "right" ? "num text-right whitespace-nowrap" : "break-words",
                    columns[index]?.className,
                  )}
                >
                  {cell === null || cell === undefined || cell === "" ? <span className="text-muted-foreground">-</span> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
