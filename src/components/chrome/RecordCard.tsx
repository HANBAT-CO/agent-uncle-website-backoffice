import { AppIcon } from "@/components/icons/AppIcon";
import { plate } from "@/content/copy";
import { cx } from "@/lib/cx";

/**
 * A record card in the app's chat format (spec 5.2): paper #F5F4EE, radius
 * 24, padding 14px 16px; meta 업무 기록 · 03:06 (13px #636363), title (15px
 * 700 ink), optional detail (14px #2D2D2D) and the app chevron (16px #808080).
 * Record surfaces never change colour with the phase.
 *
 * Presentational. With `onActivate` it is a button (the rail scrolls to the
 * section where the record happened); `draft` is the visitor's 사전 신청 in
 * progress: a dashed outline and its lines instead of a chevron.
 */

type RecordCardProps = {
  meta: string;
  title: string;
  detail?: string;
  /** Sample surfaces carry the 예시 chip. */
  sample?: boolean;
  /** Draft card lines ("역할: 소매업자", ...). Turns the card into the dashed draft. */
  lines?: readonly string[];
  onActivate?: () => void;
  className?: string;
};

function Body({ meta, title, detail, sample, lines }: Pick<RecordCardProps, "meta" | "title" | "detail" | "sample" | "lines">) {
  return (
    // data-entry-ink: the rail holds this text back while the card fades in (RecordColumn fadeIn).
    <span data-entry-ink="" className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-[13px] leading-[1.6] text-record-meta">
        <span>{meta}</span>
        {sample ? (
          <span className="inline-flex h-5 items-center rounded-pill bg-[rgb(12_72_62/0.12)] px-2 text-[11px] leading-none font-bold text-green-800">
            {plate.sampleChip}
          </span>
        ) : null}
      </span>
      <span className="text-[15px] leading-[1.45] font-bold text-record-fg">{title}</span>
      {detail ? <span className="text-[14px] leading-[1.5] text-grey-800">{detail}</span> : null}
      {lines && lines.length > 0 ? (
        <span className="mt-1 flex flex-col text-[13px] leading-[1.6] text-grey-800">
          {lines.map((line, index) => (
            <span key={`${index}-${line}`} className="truncate">
              {line}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

export function RecordCard({ meta, title, detail, sample, lines, onActivate, className }: RecordCardProps) {
  const surface = "au-paper relative flex w-full items-center gap-2 rounded-card bg-record px-4 py-3.5 text-left text-record-fg";

  if (lines !== undefined) {
    return (
      <div className={cx(surface, "outline-1 -outline-offset-1 outline-[rgb(16_16_16/0.32)] outline-dashed", className)}>
        <Body meta={meta} title={title} lines={lines} />
      </div>
    );
  }

  if (!onActivate) {
    return (
      <div className={cx(surface, className)}>
        <Body meta={meta} title={title} detail={detail} sample={sample} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      className={cx(
        surface,
        "group/card cursor-pointer transition-[scale] duration-(--duration-fast) ease-snap select-none active:scale-[0.98]",
        className,
      )}
    >
      <Body meta={meta} title={title} detail={detail} sample={sample} />
      <AppIcon
        name="chevron"
        size={16}
        className="shrink-0 text-grey-500 transition-transform duration-300 ease-snap group-hover/card:translate-x-0.5"
      />
    </button>
  );
}
