"use client";

import dynamic from "next/dynamic";

const LoadedFooterMotion = dynamic(() => import("./FooterMotion").then((module) => module.FooterMotion), { ssr: false });

export function FooterMotionIsland() {
  return <LoadedFooterMotion />;
}
