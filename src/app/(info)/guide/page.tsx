import type { Metadata } from "next";
import Link from "next/link";

import { StructuredData } from "@/components/seo/JsonLd";
import { VOCAB } from "@/content/glossary";
import { guide } from "@/content/guide";
import { brand } from "@/lib/assets";
import { getSiteUrl, site } from "@/lib/site";

const title = `${guide.title} | ${site.name}`;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: "/guide" },
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.name,
    title,
    description: guide.description,
    url: "/guide",
  },
  twitter: { card: "summary_large_image", title, description: guide.description },
};

export default function GuidePage() {
  const origin = getSiteUrl();
  const pageUrl = new URL("/guide", origin).href;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: title,
        description: guide.description,
        inLanguage: "ko-KR",
        isPartOf: { "@id": new URL("/#website", origin).href },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        mainEntity: guide.faqs.map(({ id, question, answer }) => ({
          "@type": "Question",
          "@id": `${pageUrl}#faq-${id}`,
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: site.name, item: origin.href },
          { "@type": "ListItem", position: 2, name: "이용 안내", item: pageUrl },
        ],
      },
    ],
  };

  return (
    <>
      <header className="guide-header" id="top">
        <div className="guide-container guide-header-inner">
          <Link href="/" prefetch={false} className="guide-brand" aria-label="사입삼춘 홈">
            {/* Static SVG; no image runtime is needed. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.symbol.src} width="43" height="27" alt="" />
            <span>사입삼춘<span className="guide-brand-dot">.</span></span>
          </Link>
          <Link href="/#signup" prefetch={false} className="guide-button guide-button-small">사전 신청 <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="guide-container">
        <nav className="guide-breadcrumb" aria-label="현재 위치">
          <ol><li><Link href="/" prefetch={false}>사입삼춘</Link></li><li><span aria-hidden="true">/</span> <a href="/guide" aria-current="page">이용 안내</a></li></ol>
        </nav>

        <section className="guide-hero" aria-labelledby="guide-title">
          <div>
            <p className="guide-eyebrow"><span aria-hidden="true" /> 사입삼춘 이용 안내</p>
            <h1 id="guide-title">{guide.heading[0]}<br />{guide.heading[1]}</h1>
            <p className="guide-introduction">{guide.introduction}</p>
            <a href="#workflow" className="guide-text-link">이용 흐름 살펴보기 <span aria-hidden="true">↓</span></a>
          </div>
          <figure className="guide-record">
            <div className="guide-record-top"><span>함께 보는 수량</span><span className="guide-example">기록 예시</span></div>
            <p className="guide-record-title">6장 요청, 2장 수령.</p>
            <dl className="guide-counts">
              {[{ label: "요청", value: 6 }, { label: "확보", value: 2 }, { label: "전달", value: 2 }, { label: "수령", value: 2 }].map(({ label, value }) => (
                <div key={label}><dt>{label}</dt><dd>{value}<span>장</span></dd></div>
              ))}
            </dl>
            <div className="guide-remaining"><span>남은 미송</span><strong>4장</strong></div>
            <figcaption>먼저 받은 수량과 아직 기다리는 수량을<br />두 사람이 같은 기록으로 확인해요.</figcaption>
          </figure>
        </section>

        <div className="guide-reading-layout">
          <aside className="guide-sidebar">
            <nav aria-label="이용 안내 목차">
              <p>이 페이지에서</p>
              <ol>{guide.contents.map(({ id, label }, index) => <li key={id}><a href={`#${id}`}><span aria-hidden="true">0{index + 1}</span>{label}</a></li>)}</ol>
            </nav>
            <Link href="/#film" prefetch={false} className="guide-text-link">앱 영상 보기 <span aria-hidden="true">↗</span></Link>
          </aside>

          <div className="guide-sections">
            <section id="roles" aria-labelledby="roles-title" className="guide-section">
              <p className="guide-section-number" aria-hidden="true">01 / 함께하는 사람들</p>
              <h2 id="roles-title">누가 사용하나요?</h2>
              <p className="guide-section-lead">사입을 요청하는 사람과 상품을 챙기는 사람이 각자의 업무를 기록합니다.</p>
              <div className="guide-roles">{guide.roles.map(({ name, heading, body }) => (
                <article key={name}>
                  <p className="guide-role-name">{name}</p>
                  <h3>{heading}</h3>
                  <p>{body}</p>
                </article>
              ))}</div>
            </section>

            <section id="workflow" aria-labelledby="workflow-title" className="guide-section">
              <p className="guide-section-number" aria-hidden="true">02 / 이용 흐름</p>
              <h2 id="workflow-title">어떤 순서로 진행하나요?</h2>
              <p className="guide-section-lead">거래처 연결부터 수령 확인까지, 각 단계의 담당자와 기록할 내용을 확인하세요.</p>
              <ol className="guide-steps">{guide.steps.map(({ title: stepTitle, owner, body }, index) => (
                <li key={stepTitle}>
                  <span className="guide-step-number" aria-hidden="true">{index + 1}</span>
                  <div><div className="guide-step-heading"><h3>{stepTitle}</h3><span>{owner}</span></div><p>{body}</p></div>
                </li>
              ))}</ol>
              <p className="guide-note">전달을 기록한 뒤에도 소매업자의 수령 확인이 필요해요. 대화와 업무 처리는 각각의 기록으로 남습니다.</p>
            </section>

            <section id="glossary" aria-labelledby="glossary-title" className="guide-section">
              <p className="guide-section-number" aria-hidden="true">03 / 같은 말, 같은 의미</p>
              <h2 id="glossary-title">업무 용어 살펴보기</h2>
              <p className="guide-section-lead">앱에서 사용하는 수량과 기록의 의미입니다.</p>
              <dl className="guide-glossary">{VOCAB.map(({ term, gloss }) => <div key={term}><dt>{term}</dt><dd>{gloss}</dd></div>)}</dl>
            </section>

            <section id="faq" aria-labelledby="faq-title" className="guide-section">
              <p className="guide-section-number" aria-hidden="true">04 / 자주 묻는 질문</p>
              <h2 id="faq-title">궁금한 점을 확인해 보세요.</h2>
              <div className="guide-faqs">{guide.faqs.map(({ id, question, answer }) => (
                <article key={id} id={`faq-${id}`}>
                  <h3><a href={`#faq-${id}`}>{question}<span className="guide-permalink" aria-hidden="true">↗</span></a></h3>
                  <p>{answer}</p>
                </article>
              ))}</div>
            </section>
          </div>
        </div>

        <section className="guide-signup" aria-labelledby="signup-title">
          <div><p className="guide-eyebrow">사전 신청과 도입 문의</p><h2 id="signup-title">거래처와 함께 시작해 보세요.</h2><p>역할과 연락처를 남겨 주시면 도입을 안내드릴게요.</p></div>
          <Link href="/#signup" prefetch={false} className="guide-button">사전 신청 <span aria-hidden="true">↗</span></Link>
        </section>
      </main>

      <footer className="guide-container guide-footer">
        <div><Link href="/" prefetch={false} className="guide-footer-brand">사입삼춘.</Link><p>{site.oneLiner}</p></div>
        <nav aria-label="관련 페이지"><Link href="/privacy" prefetch={false}>개인정보 처리방침</Link><Link href="/terms" prefetch={false}>서비스 이용약관</Link><a href="#top">맨 위로 ↑</a></nav>
      </footer>
      <StructuredData data={structuredData} />
    </>
  );
}
