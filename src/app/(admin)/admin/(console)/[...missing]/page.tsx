import { notFound } from "next/navigation";

/**
 * Any /admin path without a screen renders the console not-found inside the
 * shell (and stops the root-level 404 reload loop between the two root
 * layouts). The layout above has already verified the session.
 */
export default function MissingPage(): never {
  notFound();
}
