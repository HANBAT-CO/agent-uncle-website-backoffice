"use client";

import { lazy, Suspense, type ReactNode } from "react";

import type { MapBuildingId } from "@/components/map/views";
import { useInView } from "@/hooks/use-in-view";

import type { DrawPlan, IntroSchedule } from "./draw-plan";

type HeroMotionIslandProps = {
  plan: DrawPlan;
  schedule: IntroSchedule;
  focus: MapBuildingId;
  children: ReactNode;
};

const LoadedHeroMotion = lazy(() => import("./HeroMotion").then((module) => ({ default: module.HeroMotion })));

function HeroMotionFallback({ children, viewRef }: { children: ReactNode; viewRef?: (node: HTMLDivElement | null) => void }) {
  return (
    <div ref={viewRef} className="hero-pin-spacer" data-hero-pin-spacer>
      <div className="hero-pin" data-hero-pin>
        <span className="hero-stage-probe" data-hero-stage-probe aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function HeroMotionIsland({ plan, schedule, focus, children }: HeroMotionIslandProps) {
  const [ref, near] = useInView<HTMLDivElement>({ rootMargin: "100%", once: true });

  if (near) {
    return (
      <Suspense fallback={<HeroMotionFallback viewRef={ref}>{children}</HeroMotionFallback>}>
        <LoadedHeroMotion plan={plan} schedule={schedule} focus={focus}>
          {children}
        </LoadedHeroMotion>
      </Suspense>
    );
  }

  return <HeroMotionFallback viewRef={ref}>{children}</HeroMotionFallback>;
}
