import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/admin/utils";

import type { DiffEntry } from "./config-forms";

/** Before → after rows of a config change (editor preview and 변경 기록). */
export function ConfigDiff({
  entries,
  emptyText = "바뀐 내용이 없어요.",
  beforeLabel = "지금",
  afterLabel = "저장할 값",
  className,
}: {
  entries: DiffEntry[];
  emptyText?: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}) {
  if (entries.length === 0) return <p className={cn("text-xs text-muted-foreground", className)}>{emptyText}</p>;
  return (
    <table className={cn("w-full table-fixed border-separate border-spacing-0 text-xs", className)}>
      <thead>
        <tr className="text-left text-muted-foreground">
          <th scope="col" className="w-[30%] border-b pb-1.5 font-medium">
            항목
          </th>
          <th scope="col" className="border-b pb-1.5 font-medium">
            {beforeLabel}
          </th>
          <th scope="col" className="w-5 border-b pb-1.5" aria-hidden />
          <th scope="col" className="border-b pb-1.5 font-medium">
            {afterLabel}
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.path} data-testid={`diff-${entry.path}`}>
            <th scope="row" className="border-b py-1.5 pr-2 text-left align-top font-medium break-words text-foreground">
              {entry.label}
            </th>
            <td className="border-b py-1.5 pr-2 align-top break-words text-muted-foreground">
              {entry.before}
            </td>
            <td className="border-b py-1.5 align-top text-muted-foreground" aria-hidden>
              <ArrowRightIcon className="mt-0.5 size-3" />
            </td>
            <td className="border-b py-1.5 align-top font-semibold break-words text-foreground">{entry.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
