import { clsx, type ClassValue } from "clsx";

/**
 * Join class names. This deliberately stays as plain `clsx`: the landing page
 * uses fixed class stacks and conditional additions, and pulling
 * tailwind-merge into the initial route costs about 8.6 KB gzip.
 *
 * If a caller needs to override a base utility, use a prop or an important
 * utility instead of relying on string order.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
