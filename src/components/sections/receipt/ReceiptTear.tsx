"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import TearTicket from "@/components/rb/TearTicket";

import type { TearSource } from "./receipt-state";
import { SLIP, slipGeometry } from "./slip-geometry";

/**
 * The 수령 stub as a physical tear (spec S6, Motion leaf, lazy). React Bits
 * TearTicket restyled through props: paper #F5F4EE, ink #101010, perforation
 * and edge #D7D7D7, flat (no 3D tilt; GSAP tilts the wrapper outside this
 * tree), the stub on the right of a wide slip and under a phone-width one.
 *
 * Controlled by the section reducer: a drag past 60% of the stub, a swipe, the
 * stub's button or an auto-tear set `torn`; TearTicket plays the 900ms tear
 * for anything that is not a drag. Under reduced motion every tear is instant.
 *
 * Kept inside the slip's column (no element may cross the h2 or the body
 * beside a wide slip, nor the next section's h2), with four local adjustments
 * to the shared component:
 * - Contained drop: TearTicket swings a wide stub open to the right before it
 *   drops, straight across the copy column, and lets any stub fall about 480px
 *   before it has faded, onto the next section's h2. For a tear nobody is
 *   dragging (the button, Enter, the auto-tear) receipt.css plays its own path
 *   on the same stub layer instead (data-stub-drop, by orientation): a wide
 *   stub's top peels a few px off the cut, then it falls inside its own column,
 *   drifting left; a phone-width stub's left end peels down, then it falls
 *   straight with a small turn. Both fade on the way, well short of that h2. A
 *   CSS animation outranks the inline transform TearTicket writes every frame;
 *   TearTicket still times the tear and hides the stub at the end.
 * - Short throw: a dragged or swiped stub keeps TearTicket's physics, but once
 *   let go it fades by how far it has fallen (--slip-stub-fling, receipt.css):
 *   gone within FLING_FROM + FLING_SPAN px below the lower of home and where it
 *   was let go. Thrown from the slip, it is gone before the next section's h2,
 *   160px or more below; the reader's own hand still takes it anywhere.
 * - Copy aside: the stub stays in the reader's hand until it is torn. The
 *   gutter beside a wide slip is only about 50px, well short of the 72px
 *   pull that tears, so a pulled stub crosses the copy column. While it is
 *   pulled (1024px up) or near the copy (or the open sample), the copy steps
 *   aside to 12% (data-stub-over on this frame, receipt.css), as it does for
 *   the open sample; the stub paints above it. A returned or thrown stub
 *   keeps the copy aside until it is back on the slip or gone.
 * - Touch capture: TearTicket captures the pointer on its stub layer, which
 *   is pointer-events none. A touch's implicit capture on the element under
 *   the finger is lost on that switch, and the lostpointercapture it bubbles
 *   up reads to TearTicket as a release, so a real swipe never tore. While
 *   that touch is still down the stale event stops at this frame.
 *
 * The leaf lays itself out while hidden, measures the body's natural height at
 * its final width, and reports onReady once the ticket has its real geometry.
 */

const PAPER = "#F5F4EE";
const INK = "#101010";
const EDGE = "#D7D7D7";
/** shadow-float (0 18px 48px -12px rgb(7 35 28 / 0.22)) as drop-shadows, so it follows the cut. */
const SHADOW = "drop-shadow(0 1px 1px rgb(7 35 28 / 0.08)) drop-shadow(0 18px 28px rgb(7 35 28 / 0.17))";
/** TearTicket's stub layer (it holds the clipped stub surface, which holds the stub face). Mirrored in receipt.css. */
const STUB_LAYER = "div:has(> div > div > .slip-stub)";
/**
 * Text that steps aside when the stub nears it: the copy beside or above the
 * slip, and the open sample beside a wide slip. A phone-width stub swings a
 * few px toward the sample under it while it is pulled, which must not dim it.
 */
const KEEP_CLEAR = ".receipt-copy h2, .receipt-copy p";
const KEEP_CLEAR_WIDE = `${KEEP_CLEAR}, .whatif-sheet`;
/** How near (px) the stub may come to that text before it steps aside: early enough to finish its 160ms fade. */
const NEAR = 16;
/** How long the drag watch keeps looking after the pointer lets go (TearTicket's drop or return ends well before). */
const SETTLE_MS = 1200;
/**
 * A let-go stub fades over this much fall (px): it starts FLING_FROM below the
 * lower of home and where it was let go (past a returning stub's spring
 * overshoot), and is gone FLING_SPAN further down.
 */
const FLING_FROM = 12;
const FLING_SPAN = 96;
/** The stub layer's fade for a let-go stub (receipt.css). */
const FLING = "--slip-stub-fling";

type ReceiptTearProps = {
  body: ReactNode;
  stub: ReactNode;
  torn: boolean;
  /** What tore it (section state); a drag plays TearTicket's own physics. */
  tornBy?: TearSource;
  onTear: () => void;
  /** Laid out but invisible until the static slip hands over. */
  hidden: boolean;
  onReady: () => void;
};

function overlaps(a: DOMRect, b: DOMRect, inset: number): boolean {
  return a.right > b.left - inset && a.left < b.right + inset && a.bottom > b.top - inset && a.top < b.bottom + inset;
}

export default function ReceiptTear({ body, stub, torn, tornBy, onTear, hidden, onReady }: ReceiptTearProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const readySent = useRef(false);
  const [frameWidth, setFrameWidth] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setFrameWidth(frame.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const measureBody = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => setBodyHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const geometry = frameWidth > 0 ? slipGeometry(frameWidth, bodyHeight) : null;
  const measured = geometry !== null && bodyHeight > 0;
  // TearTicket swings a wide stub to the right and drops any stub far below; only a drag keeps its physics.
  const contained = torn && tornBy !== undefined && tornBy !== "drag";

  useLayoutEffect(() => {
    if (!measured || readySent.current) return;
    readySent.current = true;
    onReady();
  }, [measured, onReady]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const section = frame.closest<HTMLElement>('[data-section="receipt"]');
    /** Touches (and pens) pressed inside the slip and not yet lifted. */
    const down = new Set<number>();
    let raf = 0;
    let releasedAt = 0;
    /** Where the let-go stub's fall is measured from (px below the frame's top); null while it is held. */
    let fallFrom: number | null = null;
    let fling = 1;

    const resetFling = () => {
      fallFrom = null;
      fling = 1;
      frame.style.removeProperty(FLING);
    };
    const stopWatch = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      frame.removeAttribute("data-stub-over");
      // Home, or hidden by TearTicket until a reset brings it back whole.
      resetFling();
    };
    const watch = () => {
      const layer = frame.querySelector<HTMLElement>(STUB_LAYER);
      const face = frame.querySelector<HTMLElement>(".slip-ticket .slip-stub");
      // Torn and gone (TearTicket hides the stub at the end of its drop): the copy comes back.
      if (!layer || !face || layer.style.visibility === "hidden") {
        stopWatch();
        return;
      }
      const grabbing = frame.querySelector(".slip-ticket[data-grabbing]") !== null;
      if (grabbing) releasedAt = 0;
      else if (releasedAt === 0) releasedAt = performance.now();
      const box = face.getBoundingClientRect();
      if (grabbing || frame.hasAttribute("data-stub-drop")) {
        // In the reader's hand (whole, wherever it is), or torn by its button: the contained drop fades it.
        if (fallFrom !== null || fling < 1) resetFling();
      } else {
        const home = frame.getBoundingClientRect();
        const bottom = box.bottom - home.top;
        if (fallFrom === null) fallFrom = Math.max(bottom, home.height);
        const left = Math.min(1, Math.max(0, 1 - (bottom - fallFrom - FLING_FROM) / FLING_SPAN));
        if (left < fling) {
          fling = left;
          frame.style.setProperty(FLING, fling.toFixed(3));
        }
      }
      const wideSlip = frame.querySelector('.slip-ticket[data-orientation="horizontal"]') !== null;
      const clear = section ? [...section.querySelectorAll<HTMLElement>(wideSlip ? KEEP_CLEAR_WIDE : KEEP_CLEAR)] : [];
      const near = clear.some((node) => node.offsetParent !== null && overlaps(box, node.getBoundingClientRect(), NEAR));
      frame.toggleAttribute("data-stub-over", near);
      if (!grabbing && performance.now() - releasedAt > SETTLE_MS) {
        // Back on the slip untorn, or settled wherever a refresh left it.
        stopWatch();
        return;
      }
      raf = requestAnimationFrame(watch);
    };

    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".slip-stub")) return;
      if (event.pointerType !== "mouse") down.add(event.pointerId);
      releasedAt = 0;
      if (!raf) raf = requestAnimationFrame(watch);
    };
    const onEnd = (event: PointerEvent) => {
      down.delete(event.pointerId);
    };
    const onLost = (event: PointerEvent) => {
      if (!down.has(event.pointerId)) return;
      if (event.target === frame.querySelector(STUB_LAYER)) return;
      event.stopPropagation();
    };

    frame.addEventListener("pointerdown", onDown, true);
    frame.addEventListener("lostpointercapture", onLost, true);
    window.addEventListener("pointerup", onEnd, true);
    window.addEventListener("pointercancel", onEnd, true);
    return () => {
      stopWatch();
      frame.removeEventListener("pointerdown", onDown, true);
      frame.removeEventListener("lostpointercapture", onLost, true);
      window.removeEventListener("pointerup", onEnd, true);
      window.removeEventListener("pointercancel", onEnd, true);
    };
  }, []);

  useEffect(() => {
    if (torn) return;
    frameRef.current?.removeAttribute("data-stub-over");
    frameRef.current?.style.removeProperty(FLING);
  }, [torn]);

  // The contained drop's pivot, in ticket px: the cut's bottom end on a wide slip, its right end on a phone-width one.
  const hinge = geometry
    ? ({
        "--slip-hinge":
          geometry.orientation === "horizontal"
            ? `${geometry.width - geometry.stubSize}px ${geometry.height - SLIP.notch}px`
            : `${geometry.width - SLIP.notch}px ${geometry.height - geometry.stubSize}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      ref={frameRef}
      className="slip-tear"
      style={hinge}
      data-hidden={hidden ? "" : undefined}
      data-stub-drop={contained ? geometry?.orientation : undefined}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
    >
      {geometry ? (
        <TearTicket
          orientation={geometry.orientation}
          width={geometry.width}
          height={geometry.height}
          stubSize={geometry.stubSize}
          holes={geometry.holes}
          holeSize={SLIP.hole}
          notch={SLIP.notch}
          radius={24}
          roughness={1.1}
          tearAngle={26}
          stretch={26}
          resistance={0.5}
          rotate={0}
          tilt={false}
          parallax={0}
          background={PAPER}
          color={INK}
          border
          borderColor={EDGE}
          borderWidth={1}
          stubBackground={PAPER}
          recenter={false}
          stubFocusable={false}
          stubTouchAction="pan-y pinch-zoom"
          pullToTear={0.6}
          tearDuration={900}
          dimUsed={false}
          usedLabel=""
          shadow={SHADOW}
          torn={torn}
          onTear={onTear}
          stub={stub}
          className="slip-ticket"
        >
          <div ref={measureBody}>{body}</div>
        </TearTicket>
      ) : null}
    </div>
  );
}
