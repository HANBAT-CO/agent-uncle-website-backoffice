"use client";

import dynamic from "next/dynamic";

import type { MapBuildingId, MapPickView, ScreenPoint } from "@/components/map/views";

import type { HeroMapVariant } from "./hero-config";

type HeroLensIslandProps = {
  variant: HeroMapVariant;
  pick: MapPickView;
  viewBox: { width: number; height: number };
  targets: Readonly<Record<MapBuildingId, ScreenPoint>>;
  focus: MapBuildingId;
};

const HeroLensController = dynamic(() => import("./HeroLens").then((module) => module.HeroLens), { ssr: false });

export function HeroLensIsland({ variant, pick, viewBox, targets, focus }: HeroLensIslandProps) {
  return (
    <>
      <span className="hero-lens" data-hero-lens={variant} aria-hidden="true" />
      <HeroLensController variant={variant} pick={pick} viewBox={viewBox} targets={targets} focus={focus} />
    </>
  );
}
