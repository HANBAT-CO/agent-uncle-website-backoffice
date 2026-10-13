import { trust } from "@/content/copy";
import { cn } from "@/lib/cn";

import { IdempotencyDemo } from "./IdempotencyDemo";
import { PhraseSpans, SentenceBlocks } from "./lines";

/**
 * Proof index (spec S8 row 4), a Server Component: the app's guardrails as
 * typography. Whitespace only: no cards, no dividers.
 *
 * Each item is the claim (h3), the app's own string in the board's refusal
 * material (ink, 2px deep-green rule, the opening quote hung outside the
 * text edge) and the site's one-line explanation. From 768px the three
 * read-only claims stack in a 7fr column and 두 번 생기지 않아요, the one
 * proof the visitor can touch, takes its own 5fr column across their rows
 * (DOM order unchanged, so the stacked order below 768px is 1, 2, 3, 4).
 * Its demo is a client leaf (IdempotencyDemo).
 */
export function ProofIndex({ className }: { className?: string }) {
  return (
    <div
      className={cn("grid gap-y-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-x-12 md:gap-y-14 lg:gap-x-24", className)}
      data-proof-index=""
    >
      {trust.proof.map((item, index) => {
        const demo = index === 1;
        return (
          <div
            key={item.title}
            className={cn(
              "flex flex-col gap-3 md:gap-4",
              demo ? "md:col-start-2 md:row-span-3 md:row-start-1 md:self-start" : "md:col-start-1",
            )}
            data-proof={index}
          >
            <h3 className="trust-proof-claim font-bold text-ink">{item.title}</h3>
            {"quote" in item ? (
              <p className="trust-quote max-w-[34rem]">
                <SentenceBlocks text={item.quote} />
              </p>
            ) : null}
            {"body" in item ? (
              <p className="max-w-[34rem] text-body text-grey-700">
                <PhraseSpans text={item.body} />
              </p>
            ) : null}
            {demo ? (
              <div className="mt-3 md:mt-6">
                <IdempotencyDemo />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
