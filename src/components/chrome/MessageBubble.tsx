import { cx } from "@/lib/cx";

/**
 * A chat bubble in the app's style (spec 5.2): #D7D7D7, ink 14px text, radius
 * 20, the time below in 12px. Inside a night section (the S3 stop blocks) the
 * time sits on night ground (#B6D7C2); in the sheet it sits on paper (#636363).
 *
 * In the rail the time would sit on the page itself, which the dawn sky turns
 * from night green to near white before the phase flips, so no single colour
 * holds 7:1 through the switch (spec 4.1 checks mid-switch frames). There it
 * sits on a small paper chip instead: #636363 on #F5F4EE, about 5.6:1, on any
 * ground, like the record cards around it.
 *
 * Messages never move the ledger, so the bubble is not a control: it carries
 * no chevron and no outline flash.
 */

type MessageBubbleProps = {
  text: string;
  time: string;
  /** Where the time line sits: the page ground (rail), a night section, or paper (sheet). */
  ground?: "page" | "night" | "paper";
  className?: string;
};

const TIME_CLASS = {
  page: "au-paper inline-flex h-5 items-center rounded-pill bg-record px-2 text-record-meta",
  night: "pl-1 text-green-200",
  paper: "pl-1 text-record-meta",
} as const;

export function MessageBubble({ text, time, ground = "page", className }: MessageBubbleProps) {
  return (
    <div className={cx("flex flex-col items-start gap-1.5", className)}>
      {/* data-entry-ink: the rail holds the text back while the bubble and chip fade in (RecordColumn fadeIn). */}
      <p className="max-w-[92%] rounded-[20px] bg-bubble px-4 py-3 text-[14px] leading-[1.5] text-record-fg">
        <span data-entry-ink="">{text}</span>
      </p>
      <time className={cx("text-[12px] leading-none tabular-nums", TIME_CLASS[ground])}>
        <span data-entry-ink="">{time}</span>
      </time>
    </div>
  );
}
