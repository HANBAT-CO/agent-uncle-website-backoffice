import { QuantityDot } from "@/components/dot/QuantityDot";
import { receipt } from "@/content/copy";

import { BatchQuantity, IssueRow, SlipHead, StubButton } from "./SlipControls";

/**
 * The receipt slip's paper faces (Server Components). The strings are the
 * app's own (상품 수령 확인 screen) with the denim's numbers, set as a
 * typographic paper object in the site's material (spec 2, rule 1), never as
 * a screenshot. Both faces render once on the server and are placed either in
 * the static slip or inside the TearTicket leaf (ReceiptSlip).
 */

const { slip } = receipt;

/** "1차 · 10월 11일" and "05:53": on a narrow slip the row wraps before the time, never inside it. */
const roundCut = slip.batch.round.lastIndexOf(" ");
const roundDate = slip.batch.round.slice(0, roundCut);
const roundTime = slip.batch.round.slice(roundCut + 1);

/** Everything above the perforation. */
export function SlipBody() {
  return (
    <div className="slip-body">
      <SlipHead title={slip.title} badge={slip.badge} />
      <h3 className="slip-heading">{slip.heading}</h3>

      <div className="slip-block">
        <p className="slip-party">{slip.card[0]}</p>
        <p className="slip-meta">{slip.card[1]}</p>
      </div>

      <div className="slip-block">
        <p className="slip-label">{slip.batchesLabel}</p>
        <dl className="slip-ledger">
          <div className="slip-batch">
            <dt>
              {roundDate} <span className="whitespace-nowrap">{roundTime}</span>
            </dt>
            <BatchQuantity pending={slip.batch.quantity} confirmed={slip.batch.quantityConfirmed} />
          </div>
          {slip.rows.map((row) => (
            <div key={row.label} className="slip-row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="slip-mint">
        <p className="slip-mint-title">{slip.mint.title}</p>
        <p className="slip-mint-body">{slip.mint.body}</p>
      </div>

      <IssueRow label={slip.issue} closedLabel={slip.issueClosed} />
    </div>
  );
}

/** The tear-off stub: the ink dot is the grip at the perforation's top (or left) end; the button tears it. */
export function SlipStub() {
  return (
    <div className="slip-stub">
      <QuantityDot tone="ink" className="slip-grip" />
      <StubButton label={slip.stub} />
    </div>
  );
}
