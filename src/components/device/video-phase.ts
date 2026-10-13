export type DeviceVideoPhase = "still" | "loading" | "playing" | "paused" | "ended";
export type DeviceVideoYield = "keep" | "still";
export type DeviceVideoEnd = "still" | "hold";

export function phaseAfterPause(
  current: DeviceVideoPhase,
  { yielded, onYield }: { yielded: boolean; onYield: DeviceVideoYield },
): DeviceVideoPhase {
  if (yielded && onYield === "still") return "still";
  if (current === "playing") return "paused";
  if (current === "loading") return "still";
  return current;
}

export function phaseAfterEnded(end: DeviceVideoEnd): DeviceVideoPhase {
  return end === "hold" ? "ended" : "still";
}

export function isBusyPhase(phase: DeviceVideoPhase): boolean {
  return phase === "loading" || phase === "playing";
}

export function showsVideoForPhase(phase: DeviceVideoPhase): boolean {
  return phase === "playing" || phase === "paused" || phase === "ended";
}
