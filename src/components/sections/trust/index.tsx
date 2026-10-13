import { Fragment } from "react";

import { Device } from "@/components/device/Device";
import { DeviceVideo } from "@/components/device/DeviceVideo";
import { SectionHeading } from "@/components/section/SectionHeading";
import { SectionShell } from "@/components/section/SectionShell";
import { roles, trust } from "@/content/copy";
import { APP_CLIPS, APP_STILLS } from "@/content/media";

import { EquationBoard } from "./EquationBoard";
import { HistoryStrip } from "./HistoryStrip";
import { ProofIndex } from "./ProofIndex";
import { AskContent, CounterpartIdle, Pane, ProposalSheet } from "./proposal-parts";
import { ProposalSlot } from "./ProposalSlot";
import "./trust.css";

/**
 * S8 trust, 09:41 (spec S8): the trust mechanics made testable. Server
 * Component; every string is in the server HTML (the no-JS baseline equals the
 * reduced-motion layout). Day canvas, unpinned; chrome: rail spine, plate and
 * mobile pill hidden; story beat b0941 (the section default).
 *
 * Rows (desktop):
 * 1. H2 + lead (columns 1-6), then the equation board across all 12 columns
 *    (EquationBoard: GSAP leaf, rules in ledger-rules.ts).
 * 2. The proposal block (columns 1-7; ProposalSlot loads the Motion leaf one
 *    viewport early over the static ask sheet) and the 1:1 chat device
 *    (columns 9-12; real chatHistory footage, autoplays muted at 50% in view),
 *    with a line that frames the shirt records and says the footage is real.
 * 3. 처리 이력 strip (HistoryStrip).
 * 4. Proof index: three claims in a 7fr column, the idempotency demo in its
 *    own 5fr column (ProofIndex).
 * Below 1024px everything stacks; the equation stacks vertically below 768px.
 *
 * At 1280px and wider the content keeps clear of the rail spine on the right.
 */

/** A comma that ends a clause: the lead may only wrap there. */
const CLAUSE_END = /(?<=,) /;

export function TrustSection() {
  return (
    <SectionShell id="trust" titleId="trust-title" tone="day" className="overflow-x-clip">
      <div className="mx-auto w-full max-w-content px-gutter xl:pr-[calc(var(--spacing-gutter)+4.5rem)]">
        <div className="flex max-w-[44rem] flex-col gap-6">
          <SectionHeading id="trust-title" lines={trust.h2} className="text-ink" />
          {/*
            Lines by meaning (spec 4.2): one sentence per line at every width, and each comma
            clause kept whole, so the inequality wraps on phones only at its comma:
            받은 수량이 전달보다, / 전달이 확보보다 많아질 수 없어요.
          */}
          <p className="max-w-(--container-prose) text-body text-grey-800 lg:text-body-lg" data-trust-lead="">
            {trust.lead.map((line, index) => (
              <Fragment key={line}>
                {index > 0 ? " " : null}
                <span className="block">
                  {line.split(CLAUSE_END).map((clause, part) => (
                    <Fragment key={clause}>
                      {part > 0 ? " " : null}
                      <span className="inline-block">{clause}</span>
                    </Fragment>
                  ))}
                </span>
              </Fragment>
            ))}
          </p>
        </div>

        <EquationBoard className="mt-8 lg:mt-20" />

        <div className="mt-8 grid items-start gap-8 lg:mt-24 lg:grid-cols-12 lg:gap-x-6">
          <ProposalSlot className="lg:col-span-7">
            <ProposalSheet
              phase="ask"
              retailer={
                <Pane side="retailer">
                  <AskContent />
                </Pane>
              }
              counterpart={
                <Pane side="counterpart" ghost>
                  <CounterpartIdle />
                </Pane>
              }
            />
          </ProposalSlot>

          <div className="trust-device flex flex-col items-center lg:col-span-4 lg:col-start-9 lg:pt-2" data-trust-device="">
            <Device screenWidth="var(--trust-device-w)" label={trust.chatCaption}>
              <DeviceVideo
                clip={APP_CLIPS.chatHistory}
                still={APP_STILLS.chatHistoryRecords}
                mode="in-view"
                playLabel={trust.chatPlay}
                pauseLabel={roles.pause}
                end="hold"
                sizes="(min-width: 1024px) 280px, 80vw"
              />
            </Device>
            <p className="mt-2 max-w-[23rem] text-center text-caption text-grey-600" data-chat-context="">
              {trust.chatContext.map((line, index) => (
                <Fragment key={line}>
                  {index > 0 ? " " : null}
                  <span className="block text-balance">{line}</span>
                </Fragment>
              ))}
            </p>
          </div>
        </div>

        {/*
          One rhythm between the rows: 96px from 1024px; 56px below, where the rows stack
          and every saved line shortens a section of several phone screens (spec S8 rows 2-4).
        */}
        <HistoryStrip className="mt-8 lg:mt-24" />

        <ProofIndex className="mt-8 lg:mt-24" />
      </div>
    </SectionShell>
  );
}
