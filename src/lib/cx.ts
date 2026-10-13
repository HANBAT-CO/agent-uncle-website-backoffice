import { clsx, type ClassValue } from "clsx";

/**
 * Join class names without conflict resolution (clsx). For modules that ship
 * in the page's initial JS: `cn` (src/lib/cn.ts) carries tailwind-merge, about
 * 8.6 KB gzip, which spec 13's 85 KB initial budget cannot afford.
 *
 * Plain joining means two utilities for the same property both stay, and the
 * one later in Tailwind's generated CSS wins (not the one later in the string).
 * So a caller's className must not restate a property the base already sets:
 * pass a prop instead (e.g. SignupIslands' Bar `maxWidth`) or use the important
 * modifier (`block!`). Server-only modules and lazy chunks may keep `cn`.
 */
export function cx(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
