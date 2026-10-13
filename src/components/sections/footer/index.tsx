import { QuantityDot } from "@/components/dot/QuantityDot";
import { AppIcon } from "@/components/icons/AppIcon";
import { SectionActivity } from "@/components/section/SectionActivity";
import { footer } from "@/content/copy";
import { COMPANY, PRIVACY_PAGE, TERMS_PAGE } from "@/content/legal";
import { brand } from "@/lib/assets";

import { FooterMotionIsland } from "./FooterMotionIsland";
import { VisitLog } from "./VisitLog";
import "./footer.css";

/**
 * S11 footer · 사입삼춘. (spec S11). Closes the story where the film ends: the
 * giant wordmark whose full stop is the page's quantity dot, the app's
 * one-liner, the callback card (the record continues: 다음 미송 재확인
 * 2026-10-13), the records this visit created, the links and the legal line.
 *
 * A footer landmark outside main, not a SectionShell; it still registers as a
 * story section (bnow) through SectionActivity. Its h2 is the wordmark in the
 * 900 display subset: one line at min(22vw, 320px) from 768px (capped by the
 * viewport height so the end frame clears the nav), and two lines
 * (사입 / 삼춘.) at 40vw below 768px and on screens 500px tall or less
 * (landscape phones, short windows), stacked last there so the page always
 * ends on the whole wordmark (the legal line beside it when short and wide
 * enough). Sizes, the stacked order and the short-screen rhythm live in
 * footer.css.
 */

const SYMBOL_WIDTH = 112;
const SYMBOL_HEIGHT = Math.round((SYMBOL_WIDTH * brand.symbol.height) / brand.symbol.width);

function CallbackCard() {
  const { callback } = footer;
  return (
    <div data-footer-callback="" className="flex max-w-[22rem] flex-col rounded-card bg-surface p-6 text-ink">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[19px] leading-[1.4] font-bold">{callback.title}</p>
        <AppIcon name="clock" size={28} className="shrink-0 text-green-800" />
      </div>
      <p className="mt-2 text-[17px] leading-[1.4] text-grey-600 numeric">{callback.date}</p>
      <div className="mt-6 flex flex-col gap-0.5">
        <p className="text-[17px] leading-[1.4] font-bold">{callback.item}</p>
        <p className="text-[15px] leading-[1.5] text-grey-600">{callback.backorder}</p>
      </div>
    </div>
  );
}

export function FooterSection() {
  return (
    <footer
      id="footer"
      aria-labelledby="footer-title"
      data-section="footer"
      data-tone="day"
      className="footer-shell relative overflow-x-clip pt-20 pb-10 lg:pt-28 lg:pb-8"
    >
      <div className="footer-inner mx-auto w-full max-w-content px-gutter">
        {/*
          aria-label: the flex items would otherwise be read as "사입삼춘 ." with a gap.
          items-end: the period slot sits on the last line (삼춘. below 768px).
        */}
        <h2
          id="footer-title"
          aria-label={`${footer.wordmark}${footer.period}`}
          className="footer-wordmark flex items-end leading-none font-black tracking-[-0.02em] text-ink"
        >
          <span data-footer-chars="" className="footer-wordmark-chars -ml-[0.025em]">
            {footer.wordmarkLines.map((line) => (
              <span key={line} data-footer-mask="" className="footer-wordmark-line">
                {line}
              </span>
            ))}
          </span>
          <span data-footer-slot="" className="footer-period-slot">
            {footer.period}
            <span data-footer-dot="" aria-hidden="true" className="footer-period-dot">
              <QuantityDot tone="ink" className="block! size-full!" />
            </span>
          </span>
        </h2>

        <div aria-hidden="true" className="footer-rule mt-6 h-px bg-grey-200 lg:mt-8" />

        <div className="footer-grid mt-10 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-12 lg:gap-x-6">
          <div className="flex flex-col gap-8 lg:col-span-5">
            <p data-footer-line="" className="text-heading-md text-ink">
              {footer.line}
            </p>
            <CallbackCard />
          </div>

          {/* Collapses when the visitor has no records yet (VisitLog renders nothing); footer.css then moves the links into the middle. */}
          <div data-visit-slot="" className="empty:hidden lg:col-span-4 lg:col-start-6">
            <VisitLog />
          </div>

          <nav aria-label={footer.linksLabel} className="footer-links md:col-start-2 lg:col-span-2 lg:col-start-11">
            {/* lg:-mt: the first link's text shares the one-liner's top line; the 44px targets stay. */}
            <ul className="grid grid-cols-2 gap-x-6 lg:-mt-2 lg:grid-cols-1">
              {footer.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="-mx-2.5 inline-flex min-h-11 items-center rounded-pill px-2.5 text-[17px] font-bold text-ink underline decoration-transparent decoration-1 underline-offset-4 transition-[text-decoration-color] duration-300 ease-snap hover:decoration-ink"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              {[PRIVACY_PAGE, TERMS_PAGE].filter((page) => page.exists).map((page) => (
                <li key={page.href}>
                  <a
                    href={page.href}
                    className="-mx-2.5 inline-flex min-h-11 items-center rounded-pill px-2.5 text-[15px] text-grey-700 underline decoration-1 underline-offset-4"
                  >
                    {page.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Symbol and legal line sit left: the record pill (min 1280px) floats bottom-right. */}
        <div className="footer-legal mt-16 flex flex-wrap items-end gap-x-8 gap-y-4 lg:mt-14">
          {/* Decorative here: the footer landmark and the h2 already name the brand. */}
          {/* A static SVG (unoptimized anyway): a plain img keeps next/image's client code out of the bundle. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.symbol.src}
            alt=""
            width={SYMBOL_WIDTH}
            height={SYMBOL_HEIGHT}
            loading="lazy"
            decoding="async"
            className="h-auto w-28"
          />
          <p className="text-caption text-grey-700">{COMPANY.line}</p>
        </div>
      </div>
      <FooterMotionIsland />
      <SectionActivity id="footer" />
    </footer>
  );
}
