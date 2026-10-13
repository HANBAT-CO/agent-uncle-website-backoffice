import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class names for the admin kit: clsx joins, tailwind-merge resolves conflicts (later wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
