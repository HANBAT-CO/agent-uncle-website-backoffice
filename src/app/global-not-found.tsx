import type { Metadata } from "next";
import Link from "next/link";

import { fontVariables } from "./fonts/paperlogy";

/*
 * The 404 for URLs that match no route (next.config experimental.globalNotFound).
 * The app has two root layouts, (site) and (admin), so without this file Next
 * has no layout to render its default 404 in, and `next dev` reloads such a
 * URL in a loop. /admin/* never lands here: (console)/[...missing] renders the
 * console's own not-found. Self-contained (no landing CSS, no motion), in the
 * landing's light surface colours.
 */

export const metadata: Metadata = {
  title: "찾는 페이지가 없어요 | 사입삼춘",
  robots: { index: false, follow: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="ko" className={fontVariables}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#EDECE3",
          color: "#101010",
          fontFamily: 'var(--font-paperlogy), var(--font-paperlogy-full), "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif',
          wordBreak: "keep-all",
        }}
      >
        <main style={{ padding: "2rem", textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>찾는 페이지가 없어요</h1>
          <p style={{ margin: "0.75rem 0 1.5rem", color: "#484848" }}>주소를 다시 확인해 주세요.</p>
          <Link href="/" style={{ color: "#0C483E", fontWeight: 700 }}>
            처음 화면으로 돌아가기
          </Link>
        </main>
      </body>
    </html>
  );
}
