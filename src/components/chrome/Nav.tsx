"use client";

import type { MouseEvent } from "react";

import { CtaButton } from "@/components/cta/CtaButton";
import { nav } from "@/content/copy";
import { useStorySelector } from "@/lib/story/use-story";

import { focusWithoutScroll, jumpTarget, useJumpScroll } from "./hooks";

/**
 * The nav (spec 5.1): a fixed floating pill, one line, 56px tall (--nav-h),
 * 16px from the top (--nav-top), centred, at most 960px wide. ㅅㅊ symbol
 * (always #111111; at night on a 32px paper plate) + 사입삼춘 | 흐름 역할 신뢰
 * 영상 | 사전 신청. Colours follow html[data-phase] through the chrome variables
 * (chrome.css), never the store. Below 768px the links hide (no hamburger).
 *
 * Links are real anchors, so the page works without JS. With JS, a click
 * lands exactly where the browser's own fragment jump would (jumpTarget: the
 * section's scroll margin), smoothly with Lenis (at most 1.1s for long jumps)
 * and at once under reduced motion, then updates the hash and hands the
 * target the focus, as a fragment jump would.
 */

const BRAND_SYMBOL = { src: "/brand/saip-samchun-symbol.svg", width: 40, height: 24 } as const;

function isPlainClick(event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function Nav() {
  const scroll = useJumpScroll();
  const signupActive = useStorySelector((state) => state.active === "signup");

  const onAnchor = (event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    if (!isPlainClick(event)) return;
    const href = event.currentTarget.getAttribute("href");
    if (!href?.startsWith("#")) return;
    if (href === "#top") {
      event.preventDefault();
      scroll(0);
      window.history.pushState(null, "", href);
      return;
    }
    const target = document.getElementById(decodeURIComponent(href.slice(1)));
    if (!target) return;
    event.preventDefault();
    scroll(jumpTarget(target));
    window.history.pushState(null, "", href);
    focusWithoutScroll(target);
  };

  return (
    <header className="au-scope au-nav pointer-events-none fixed inset-x-0 top-(--nav-top) z-(--z-header) flex justify-center px-3">
      <nav
        aria-label={nav.label}
        className="au-nav-pill pointer-events-auto grid h-(--nav-h) w-full max-w-[960px] grid-cols-[1fr_auto] items-center gap-4 rounded-pill pr-2 pl-2 text-chrome-fg md:grid-cols-[1fr_auto_1fr]"
      >
        <a
          href="#top"
          onClick={onAnchor}
          className="flex min-h-11 w-max items-center gap-2.5 rounded-pill pr-2 text-[17px] leading-none font-bold whitespace-nowrap"
        >
          <span className="au-logo-plate grid h-8 w-[52px] place-items-center rounded-pill">
            {/* A static SVG: next/image would not optimise it and would add about 4 KB gzip of client JS to the nav. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND_SYMBOL.src} alt="" width={BRAND_SYMBOL.width} height={BRAND_SYMBOL.height} decoding="async" className="h-auto w-10" />
          </span>
          {nav.brand}
        </a>

        <ul className="hidden items-center gap-1 md:flex">
          {nav.links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={onAnchor}
                className="au-nav-link relative inline-flex h-10 items-center rounded-pill px-3.5 text-[15px] leading-none font-normal whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-['']"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {signupActive ? (
          <span
            aria-current="location"
            className="au-nav-cta-disabled justify-self-end"
            data-nav-cta-disabled=""
          >
            {nav.cta.label}
          </span>
        ) : (
          <CtaButton href={nav.cta.href} tone="phase" size="md" onClick={onAnchor} className="justify-self-end">
            {nav.cta.label}
          </CtaButton>
        )}
      </nav>
    </header>
  );
}
