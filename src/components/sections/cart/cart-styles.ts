import styles from "./cart.module.css";

/**
 * The cart's CSS module classes, resolved for both ways the bundler may emit
 * cart.module.css:
 * - as a CSS module: the hashed name from the module map;
 * - as global CSS (the current Turbopack rule in next.config.ts runs every
 *   *.css file through @tailwindcss/turbopack with `as: "*.css"`, which drops
 *   CSS-module processing and leaves the map empty): the literal name, which
 *   matches the unhashed global rule. The names are cart-prefixed so that mode
 *   cannot collide with another section.
 */

export type CartClass =
  | "cartGround"
  | "cartStage"
  | "cartCell"
  | "cartDigit"
  | "cartNote"
  | "cartLayout"
  | "cartFigure"
  | "cartStepper"
  | "cartReadout"
  | "cartMint"
  | "cartHome"
  | "cartMoot";

const moduleMap: Readonly<Partial<Record<string, string>>> = styles;

export function cartClass(name: CartClass): string {
  return moduleMap[name] ?? name;
}
