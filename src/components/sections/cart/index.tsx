import { AppIcon } from "@/components/icons/AppIcon";
import { SectionHeading } from "@/components/section/SectionHeading";
import { SectionShell } from "@/components/section/SectionShell";
import { cart } from "@/content/copy";
import { cn } from "@/lib/cn";

import { CartExploreProvider } from "./CartExplore";
import { CartFigure } from "./CartFigure";
import { CartHomeBackorder, CartMootCard, CartReadout } from "./CartReadout";
import { CartStepper } from "./CartStepper";
import { cartClass } from "./cart-styles";

/**
 * S4 cart, 03:06 확보 2 · 미송 4 (spec S4, 8). Unpinned object stage on the
 * night plate #093A32, which is also the hairline figure's plate.
 *
 * Make the split physical: six bags, two secured on the 손수레, four still
 * owed, hanging with their 재확인일. Exploring is not recording: the pointer
 * or the stepper changes the figure, the read-out and the home card's last
 * line (grey, with a note), never the story. The section reports nothing
 * beyond its default beat (b0307), so the record plate keeps 확보 2 · 남은
 * 미송 4 here.
 *
 * Every string renders on the server; the figure, the read-out, the stepper
 * and the home card's last line are client islands sharing one value.
 */

const NIGHT_PAPER_RING = "ring-1 ring-[rgb(242_255_232/0.08)]";

/**
 * Keeps each ‘quoted phrase’ with the particle after it on one line. Under
 * keep-all, WebKit otherwise breaks right after the opening quote and leaves
 * it alone at the end of a line.
 */
function KeepQuotes({ text }: { text: string }) {
  return text.split(/(‘[^’]*’\S*)/).map((part, index) =>
    part.startsWith("‘") ? (
      <span key={index} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Keeps each bound phrase on one line (spec 4.2, line breaks by meaning). In
 * the mint card's 13.5rem track keep-all alone broke inside 전달할 수 / 있어요
 * and 남은 / 미송의. With the phrases held and the lines balanced, the body
 * breaks between phrases on desktop and between its two sentences on phones.
 */
function KeepPhrases({ text, phrases }: { text: string; phrases: readonly string[] }) {
  const bound = new RegExp(`(${phrases.map(escapeRegExp).join("|")})`);
  return text.split(bound).map((part, index) =>
    phrases.includes(part) ? (
      <span key={index} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/**
 * [app] 미송 재확인 guidance card, the app's mint tint. It recedes while a
 * preview leaves nothing owed; data-cart-moot-tone names the ink each line
 * takes on the sunk paper then (cart.module.css).
 */
function MintCard({ className }: { className?: string }) {
  return (
    <CartMootCard
      className={cn("rounded-card bg-mint px-5 py-[1.125rem] text-ink", NIGHT_PAPER_RING, className)}
      data-cart-mint-card=""
    >
      <p className="text-[15px] leading-[1.45] font-bold tabular-nums" data-cart-moot-tone="strong">
        {cart.mintCard.title}
      </p>
      <p className="mt-1.5 text-[14px] leading-[1.6] text-balance text-grey-700" data-cart-moot-tone="soft">
        <KeepPhrases text={cart.mintCard.body} phrases={cart.mintCard.bodyPhrases} />
      </p>
    </CartMootCard>
  );
}

/** [app] The retailer home's 다음 미송 재확인 card, as a paper object. Its last line follows the explored value; it recedes while nothing is owed. */
function HomeCard({ className }: { className?: string }) {
  return (
    <CartMootCard className={cn("rounded-card bg-surface p-5 text-ink", NIGHT_PAPER_RING, className)} data-cart-home-card="">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[16px] leading-[1.4] font-bold" data-cart-moot-tone="strong">
          {cart.homeCard.title}
        </p>
        <AppIcon name="clock" size={20} className="mt-px shrink-0 text-green-800" />
      </div>
      <p className="mt-1.5 text-[15px] leading-[1.5] text-grey-700 tabular-nums" data-cart-moot-tone="soft">
        {cart.homeCard.date}
      </p>
      <p className="mt-5 text-[15px] leading-[1.45] font-bold" data-cart-moot-tone="strong">
        {cart.homeCard.item}
      </p>
      <CartHomeBackorder className="mt-0.5" />
    </CartMootCard>
  );
}

export function CartSection() {
  return (
    <SectionShell id="cart" titleId="cart-title" tone="night" className={cn("overflow-x-clip", cartClass("cartGround"))}>
      <div className="mx-auto w-full max-w-content px-gutter">
        <div className="stage-night">
          <div className="flex max-w-[46rem] flex-col gap-5 lg:gap-6">
            <SectionHeading id="cart-title" lines={cart.h2} className="text-night-ink" />
            <p className="max-w-(--container-prose) text-body text-night-ink-2 lg:text-body-lg">
              <KeepQuotes text={cart.body} />
            </p>
          </div>

          <CartExploreProvider>
            <div className={cartClass("cartLayout")}>
              <CartFigure className={cartClass("cartFigure")} />
              <CartStepper className={cartClass("cartStepper")} />
              <CartReadout className={cartClass("cartReadout")} />
              <MintCard className={cartClass("cartMint")} />
              <HomeCard className={cartClass("cartHome")} />
            </div>
          </CartExploreProvider>
        </div>
      </div>
    </SectionShell>
  );
}
