"use client";

import { footer, plate } from "@/content/copy";
import type { StoryState } from "@/lib/story/store";
import { useStorySelector } from "@/lib/story/use-story";

/**
 * 이 페이지에서 남긴 기록 (spec S11): the records this visit created, read
 * from the story store, which mirrors sessionStorage (au:visitor). The sample
 * 미송 answer keeps its 예시 chip; a 사전 신청 reads 신청 기록 · HH:MM.
 * Renders nothing until the visitor has left a record.
 */

const selectVisitor = (state: StoryState) => state.visitor;

export function VisitLog() {
  const visitor = useStorySelector(selectVisitor);
  if (visitor.length === 0) return null;

  return (
    <section aria-labelledby="footer-visit-log" data-visit-log="" className="flex flex-col gap-4">
      <h3 id="footer-visit-log" className="text-[15px] leading-[1.4] font-bold text-grey-800">
        {footer.visitLog.heading}
      </h3>
      <ol className="flex flex-col gap-2">
        {visitor.map((record) => (
          <li
            key={record.id}
            data-visit-record={record.kind}
            className="flex flex-col gap-0.5 rounded-card bg-record px-4 py-3.5 text-record-fg"
          >
            <span className="flex items-center gap-2 text-caption text-record-meta">
              <span>{record.meta}</span>
              {record.tag ? (
                <span className="inline-flex h-5 items-center rounded-pill border border-grey-400 px-2 text-[12px] leading-none text-grey-800">
                  {plate.sampleChip}
                </span>
              ) : null}
            </span>
            <span className="text-[15px] leading-[1.45] font-bold">{record.title}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
