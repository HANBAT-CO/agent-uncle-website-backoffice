import { SectionHeading } from "@/components/section/SectionHeading";
import { SectionShell } from "@/components/section/SectionShell";
import { receipt } from "@/content/copy";

import { ReceiptMotionIsland } from "./ReceiptMotionIsland";
import { ReceiptProvider } from "./ReceiptProvider";
import { ReceiptSlip } from "./ReceiptSlip";
import { SlipBody, SlipStub } from "./SlipFace";
import { WhatIfSlot } from "./WhatIfSlot";
import "./receipt.css";

/**
 * S6 receipt, 08:49 (spec S6): delivery is not receipt until the shop
 * confirms it, and a difference opens a problem.
 *
 * Server Component. Every string, the whole slip and the stub button are in
 * the server HTML (the no-JS baseline equals the reduced-motion layout).
 * Client leaves:
 * - ReceiptProvider: the section reducer, the beat it reports (b0553d, then
 *   b0849 once torn), auto-tear and reset by scroll position
 * - ReceiptMotion: GSAP entrance of the outer slip wrapper (desktop only)
 * - ReceiptSlip: static slip, swapped for the lazy TearTicket leaf (Motion)
 * - WhatIfSlot: host of the lazy what-if sample (Motion), never in the store
 *
 * Desktop (1024px up): the slip in columns 1-5 of the stage, the h2 and body
 * in columns 6-9, centred against the slip; the sample takes their place,
 * top-aligned with the slip so its stepper holds still as the count changes.
 * Below 1024px: h2 and body, then the full-width slip, then the sample.
 */
export function ReceiptSection() {
  return (
    <SectionShell id="receipt" titleId="receipt-title" tone="day" className="overflow-x-clip">
      <ReceiptProvider announce={receipt.slip.badge}>
        <div className="mx-auto w-full max-w-content px-gutter">
          <div className="stage-night receipt-grid">
            <div className="receipt-copy">
              <SectionHeading id="receipt-title" lines={receipt.h2} className="text-ink" />
              <p className="mt-6 max-w-(--container-prose) text-body text-grey-800 lg:text-body-lg">{receipt.body}</p>
            </div>
            <ReceiptMotionIsland className="receipt-slip-cell">
              <ReceiptSlip label={receipt.slip.title} body={<SlipBody />} stub={<SlipStub />} />
            </ReceiptMotionIsland>
            <WhatIfSlot className="receipt-whatif-cell" />
          </div>
        </div>
      </ReceiptProvider>
    </SectionShell>
  );
}
