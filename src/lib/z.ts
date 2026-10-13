/**
 * z-index scale. Mirrors the `--z-*` custom properties in src/app/(site)/globals.css;
 * change both together.
 *
 * In class names prefer the CSS variable: `z-(--z-header)`.
 * In inline styles or GSAP use this object: `style={{ zIndex: z.header }}`.
 *
 * | token      | value | use                                              |
 * |------------|-------|--------------------------------------------------|
 * | below      | -1    | decorative layers behind content                 |
 * | base       | 0     | default stacking context                         |
 * | raised     | 10    | cards lifted over siblings, pinned media         |
 * | grain      | 50    | day-phase grain layer (fixed, pointer-events none) |
 * | sticky     | 100   | sticky section headers, progress bars            |
 * | header     | 200   | global site header                               |
 * | overlay    | 300   | scrims, menus, popovers                          |
 * | modal      | 400   | dialogs, sheets (lead form)                      |
 * | toast      | 500   | transient status messages                        |
 * | skipLink   | 1000  | the skip link, always on top when focused        |
 */
export const z = {
  below: -1,
  base: 0,
  raised: 10,
  grain: 50,
  sticky: 100,
  header: 200,
  overlay: 300,
  modal: 400,
  toast: 500,
  skipLink: 1000,
} as const;

export type ZLayer = keyof typeof z;

/** `var(--z-header)` style reference for a layer. */
export function zVar(layer: ZLayer): string {
  const name = layer === "skipLink" ? "skip-link" : layer;
  return `var(--z-${name})`;
}
