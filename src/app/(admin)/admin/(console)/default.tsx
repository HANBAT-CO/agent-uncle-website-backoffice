import { notFound } from "next/navigation";

/**
 * Fallback for the implicit `children` slot of the console layout (Next 16
 * default.js). Without it, strict route matching treats every /admin page
 * outside (console) (login, mfa, no-access, unavailable) as incomplete,
 * because the @sheet catch-all also matches their URLs, and drops them as
 * 404. It renders the console not-found, like a missing page would.
 */
export default function ConsoleChildrenDefault(): never {
  notFound();
}
