import HL from "@/vendor/hairline/kernel.mjs";

type ParcelInstance = { set(value: number): void; destroy(): void };
type Figure = {
  name: string;
  mount(context: { stage: HTMLElement; svg: SVGSVGElement; read: { textContent: string | null } }, value: number): ParcelInstance;
};
type Scope = typeof globalThis & {
  HL?: unknown;
  hairline?: (figure: Figure) => void;
  __hairlineFigures?: Map<string, Figure>;
};

let loading: Promise<Figure> | undefined;

function loadFigure() {
  if (loading) return loading;
  loading = (async () => {
    const scope = globalThis as Scope;
    const registry = (scope.__hairlineFigures ??= new Map());
    scope.HL = HL;
    scope.hairline = (figure) => { registry.set(figure.name, figure); };
    // @ts-expect-error Hairline figures are classic scripts that register through the host.
    await import("@/vendor/hairline/figures/parcel.js");
    const figure = registry.get("parcel");
    if (!figure) throw new Error("Parcel figure did not register");
    return figure;
  })();
  loading.catch(() => { loading = undefined; });
  return loading;
}

export async function mountParcel(stage: HTMLDivElement, phase: number, isLive: () => boolean): Promise<ParcelInstance | null> {
  const figure = await loadFigure();
  if (!isLive()) return null;
  HL.inject(document);
  const svg = HL.mk("svg", { viewBox: "0 0 400 320", "aria-hidden": "true", focusable: "false" }, stage) as SVGSVGElement;
  // Keep a finger's scroll gesture out of the pointer-driven illustration.
  const shield = (event: PointerEvent) => { if (event.pointerType !== "mouse") event.stopImmediatePropagation(); };
  const events = ["pointerdown", "pointermove", "pointerleave"] as const;
  for (const name of events) stage.addEventListener(name, shield, true);
  const instance = figure.mount({ stage, svg, read: { textContent: "rest" } }, phase);
  return {
    set: instance.set,
    destroy() {
      instance.destroy();
      for (const name of events) stage.removeEventListener(name, shield, true);
      svg.remove();
    },
  };
}
