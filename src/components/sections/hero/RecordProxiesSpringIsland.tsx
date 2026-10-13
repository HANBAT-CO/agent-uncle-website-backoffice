"use client";

import dynamic from "next/dynamic";

const LoadedRecordProxiesSpring = dynamic(() => import("./RecordProxiesSpring").then((module) => module.RecordProxiesSpring), {
  ssr: false,
});

export function RecordProxiesSpringIsland({ at }: { at: number }) {
  return <LoadedRecordProxiesSpring at={at} />;
}
