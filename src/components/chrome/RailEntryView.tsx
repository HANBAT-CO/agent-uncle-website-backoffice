import { entryDetail, entryMeta, entryTitle, type ChromeEntry } from "./chrome-model";
import { MessageBubble } from "./MessageBubble";
import { RecordCard } from "./RecordCard";

/**
 * One rail entry, as the app shows it in the 1:1 chat: 업무 기록 cards for
 * records (buttons that jump to where they happened), a grey bubble for the
 * 03:07 message, the visitor's own records (예시 for the sample answer) and the
 * dashed draft of their 사전 신청.
 */
export function RailEntryView({
  entry,
  onActivate,
  ground = "page",
}: {
  entry: ChromeEntry;
  onActivate: (entry: ChromeEntry) => void;
  ground?: "page" | "paper";
}) {
  if (entry.kind === "story" && entry.record.kind === "message") {
    return <MessageBubble text={entry.record.title} time={entry.record.time} ground={ground} />;
  }

  if (entry.kind === "draft") {
    return <RecordCard meta={entryMeta(entry)} title={entryTitle(entry)} lines={entry.lines} />;
  }

  return (
    <RecordCard
      meta={entryMeta(entry)}
      title={entryTitle(entry)}
      detail={entryDetail(entry)}
      sample={entry.kind === "visitor" && entry.record.tag === "예시"}
      onActivate={() => onActivate(entry)}
    />
  );
}
