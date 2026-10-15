import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { brand } from "@/lib/assets";
import { LEGAL_DOCUMENTS, readLegalDocument, type LegalDocumentKind, type LegalHeading } from "@/lib/legal-documents";

import { PrintButton } from "./PrintButton";

function Contents({ headings }: { headings: LegalHeading[] }) {
  return (
    <ol className="legal-contents-list">
      {headings.filter((heading) => heading.depth === 2).map((heading, index) => (
        <li key={heading.id}>
          <a href={`#${heading.id}`}>
            <span className="legal-contents-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <span>{heading.title.replace(/^(?:\d+\. |제\d+조 )/, "")}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

export async function LegalDocument({ kind }: { kind: LegalDocumentKind }) {
  const document = await readLegalDocument(kind);
  const related = LEGAL_DOCUMENTS[document.related];
  const sections = document.headings.filter((heading) => heading.depth === 2);
  const components: Components = {
    h2: ({ node, children }) => (
      <h2 id={document.headings.find((heading) => heading.line === node?.position?.start.line)?.id}>{children}</h2>
    ),
    h3: ({ node, children }) => (
      <h3 id={document.headings.find((heading) => heading.line === node?.position?.start.line)?.id}>{children}</h3>
    ),
    a: ({ href, children }) => {
      const resolved = href === "privacy-policy.md" ? "/privacy" : href === "terms-of-service.md" ? "/terms" : href;
      return <a href={resolved}>{children}</a>;
    },
    table: ({ node, children }) => {
      const line = node?.position?.start.line ?? 0;
      const heading = document.headings.filter((item) => item.line < line).at(-1);
      return (
        <div className="legal-table-scroll" tabIndex={0} role="region" aria-label={`${heading?.title ?? document.label} 표. 가로로 스크롤할 수 있습니다.`}>
          <table>{children}</table>
        </div>
      );
    },
  };

  return (
    <>
      <header className="legal-header" id="top">
        <div className="legal-container legal-header-inner">
          <Link href="/" prefetch={false} className="legal-brand" aria-label="사입삼춘 홈">
            {/* Static brand SVG; no client image runtime needed. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.symbol.src} width="49" height="30" alt="" />
            <span>사입삼춘<span className="legal-brand-dot">.</span></span>
          </Link>
          <Link className="legal-home" href="/" prefetch={false}>홈으로 <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <main id="main" className="legal-container">
        <section className="legal-hero" aria-labelledby="legal-title">
          <div className="legal-eyebrow"><span className="legal-dot" /> 사입삼춘 이용 안내 <span className="legal-eyebrow-divider">/</span> {document.english}</div>
          <div className="legal-hero-main">
            <div>
              <h1 id="legal-title">{document.label}</h1>
              <p className="legal-introduction">{document.introduction}</p>
            </div>
            <div className="legal-edition"><span>시행본</span><strong>1.0</strong><span>2026. 10. 19. 시행</span></div>
          </div>
          <dl className="legal-metadata">
            <div><dt>문서 수정일</dt><dd><time dateTime="2026-10-15">2026. 10. 15.</time></dd></div>
            <div><dt>공고일</dt><dd><time dateTime="2026-10-19">2026. 10. 19.</time></dd></div>
            <div><dt>시행일</dt><dd><time dateTime="2026-10-19">2026. 10. 19.</time></dd></div>
          </dl>
        </section>

        <div className="legal-toolbar">
          <nav className="legal-document-nav" aria-label="이용 안내 문서">
            {Object.entries(LEGAL_DOCUMENTS).map(([key, item]) => (
              <a key={key} href={item.href} aria-current={key === kind ? "page" : undefined}>{item.label}</a>
            ))}
          </nav>
          <PrintButton />
        </div>

        <div className="legal-reading-layout">
          <aside className="legal-sidebar" aria-label="문서 탐색">
            <nav aria-label="목차">
              <p className="legal-contents-label">목차 <span>{sections.length}개 항목</span></p>
              <Contents headings={document.headings} />
            </nav>
            <a className="legal-top-link" href="#top">맨 위로 <span aria-hidden="true">↑</span></a>
          </aside>
          <div className="legal-document-column">
            <details className="legal-mobile-contents">
              <summary>목차 보기 <span>{sections.length}개 항목</span></summary>
              <nav aria-label="목차"><Contents headings={document.headings} /></nav>
            </details>
            <article className="legal-prose" aria-labelledby="legal-title">
              <Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml>{document.markdown}</Markdown>
            </article>
            <a className="legal-related" href={related.href}>
              <span><small>함께 확인해 주세요</small><strong>{related.label}</strong></span>
              <span className="legal-related-arrow" aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </main>

      <footer className="legal-footer legal-container">
        <div><Link href="/" prefetch={false} className="legal-footer-brand">사입삼춘.</Link><p>© 2026 한밭만물상</p></div>
        <a className="legal-top-link" href="#top">맨 위로 <span aria-hidden="true">↑</span></a>
      </footer>
    </>
  );
}
