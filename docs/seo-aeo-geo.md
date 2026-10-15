# 사입삼춘 SEO·AEO·GEO 작업 기록

작업일: 2026-10-15. 범위는 공개 랜딩과 이용 안내입니다. 코드와 로컬 프로덕션 빌드를 검증했으며, 이 작업으로 배포·검색 도구 등록·색인 요청을 실행하지 않았습니다.

## 발견한 문제와 반영 내용

| 우선순위 | 발견 사항과 근거 | 영향 / 반영 내용 |
| --- | --- | --- |
| 높음 | 기존 `getSiteUrl()`은 환경 변수가 없으면 localhost를 반환 | 검색·공유 주소의 기본값을 실제 운영 주소로 고정. 배포 호스트가 대표 주소를 바꾸지 않도록 정리 |
| 높음 | 기존 검색 설명이 브랜드 한 줄 소개에 그쳐 대상과 관리 업무가 드러나지 않음 | 홈 제목·설명·첫 본문에 소매업자, 사입삼촌, 사입·미송·전달·수령 관리의 의미를 자연스럽게 명시 |
| 높음 | 자세한 이용 흐름과 질문별 답변을 직접 인용할 수 있는 공개 URL이 부족 | `/guide`에 역할, 6단계 흐름, 용어, FAQ 8개와 질문별 고정 앵커 추가 |
| 보통 | 새 가이드의 검색·공유 정보와 내부 진입 경로 필요 | 페이지별 제목·설명·canonical·OG URL, 홈 메뉴·푸터 링크, 사이트맵 등록 |
| 보통 | 기존 WebSite 정보에 설명과 안정적인 식별자가 없음 | `WebSite`의 `@id`와 설명, 가이드의 `FAQPage`·`BreadcrumbList` 추가. FAQ 본문과 JSON-LD가 같은 데이터를 사용 |
| 보통 | 별도 루트 레이아웃에서는 홈 공유 이미지가 자동 상속되지 않음 | 공통 이미지 렌더러를 각 경로의 파일 메타데이터로 연결. 홈과 가이드 모두 1200×630 PNG 제공 |

새 가이드는 기존 크림색·녹색과 Paperlogy 폰트를 사용합니다. 작은 화면에서는 한 열로 배치하며, 홈의 애니메이션 provider 없이 내용을 서버에서 렌더링합니다. 폰트 서브셋도 새 문구에 맞춰 재생성했습니다.

## 운영 도메인

사용자가 **`the-saena.ai`를 사입삼춘의 운영 도메인으로 사용할 예정임을 확정**했습니다. 별도 도메인 확인은 필요하지 않습니다. 2026-10-15 HTTP 확인 결과:

- 입력 주소는 HTTP 308로 `https://www.the-saena.ai/`에 이동합니다.
- 도착 주소는 HTTP 200이며 사입삼춘 랜딩을 표시하고, 기존 canonical도 www 주소를 사용합니다.
- 따라서 이번 코드의 기본 origin은 **`https://www.the-saena.ai`**로 통일했습니다. www와 비-www 모두 사입삼춘 도메인으로 사용하며, 검색 대표 주소는 현재 리다이렉트 목적지인 www 주소를 따릅니다.

`NEXT_PUBLIC_SITE_URL`은 명시적으로 재정의할 수 있습니다. 환경 변수의 경로·쿼리·앵커는 origin으로 정규화하고, HTTP(S) 외 URL 및 자격증명이 들어 있는 URL은 사용하지 않습니다. 환경 변수가 없으면 위 운영 도메인을 사용하며, `VERCEL_URL`과 `VERCEL_PROJECT_PRODUCTION_URL`은 대표 주소를 대체하지 않습니다.

메타데이터와 사이트맵은 빌드 결과이므로 배포 환경의 `NEXT_PUBLIC_SITE_URL`을 확인하고 다시 빌드합니다. 이전에 저장된 localhost 값이 있으면 운영 도메인으로 교체해야 합니다. 로컬 메타데이터 테스트에만 localhost override를 사용합니다. 기존 QA 출시 검사는 공개 HTTPS 주소를 요구하며, 법률 확인사항과 `LEAD_DRY_RUN` 검사도 유지합니다.

실제 배포 후에는 www/비-www·HTTP/HTTPS의 최종 도착 주소, `/guide`, `/sitemap.xml`, `/robots.txt`, 생성된 공유 이미지의 HTTP 200 응답을 재확인합니다. 기존 도메인 연결이나 리다이렉트 설정은 이 작업에서 변경하지 않았습니다.

## 페이지별 검색 의도

검색량이나 난이도를 측정한 키워드 목록이 아니라 제품 기능에 근거한 초기 가설입니다.

| 페이지 | 중심 검색 의도 | 보조 질문 | 다음 행동 |
| --- | --- | --- | --- |
| `/` | 사입삼춘, 사입 관리 앱, 미송 관리 앱 | 소매업자와 사입삼촌이 어떤 기록을 공유하는가 | 영상 확인, 사전 신청 |
| `/guide` | 사입삼춘 사용법, 미송 관리 방법 | 거래처 연결, 부분 전달, 수량 차이, 기록 정정, 채팅과 수락의 차이 | 해당 FAQ 링크 공유, 사전 신청 |

`/privacy`와 `/terms`는 기존 `noindex, follow`를 유지하고 사이트맵에서 제외합니다. `/admin`도 검색 제외를 유지합니다. robots의 `/admin` 차단은 접근 권한 검증을 대신하지 않습니다.

## 답변의 근거와 구조화 데이터

- 제품 내용의 기준은 제공된 `.context/brief/product.md` 1·2·4절과 기존 `src/content/glossary.ts`입니다. 브리프는 로컬 자료이며 Git에 포함되지 않습니다.
- 거래처는 초대 코드와 상대방 수락으로 연결하며, 확보·미송·전달·수령·채팅은 각각의 기록입니다. 수량 차이와 정정 확인 절차도 제품 설명에 맞췄습니다.
- 화면의 요청 6장·확보/전달/수령 2장·남은 미송 4장은 ‘기록 예시’로 표시합니다. 고객 실적이나 통계로 사용하지 않습니다.
- FAQ는 `src/content/guide.ts`에서 화면과 JSON-LD에 함께 공급합니다. 질문 제목·짧은 답변·고정 링크를 사용하며 자바스크립트 없이 본문을 읽을 수 있습니다.
- 상호 표기의 확인이 남아 있어 Organization 데이터는 추가하지 않았습니다. 확인되지 않은 가격·평점·고객 수·앱스토어 링크도 넣지 않았습니다.
- JSON-LD의 `<`는 이스케이프하여 script 종료 문자열이 되지 않게 처리합니다.

Google의 AI 검색 기능에는 기존 검색 최적화 기준이 적용되며 특별한 AI 전용 파일이나 스키마가 필수는 아닙니다. 공개된 설명과 내부 링크, 실제 본문에 맞는 구조화 데이터를 우선했습니다. `llms.txt` 추가나 크롤러 허용만으로 AI 인용이 보장된다고 주장하지 않습니다. 검색 수집과 모델 학습 제어도 구분해야 하며, Google Search의 수집 제어와 Google-Extended의 용도는 다릅니다. [Google AI 기능 가이드](https://developers.google.com/search/docs/appearance/ai-features)

FAQPage를 추가해도 Google FAQ 리치 결과가 보장되지는 않습니다. Google은 해당 노출을 주로 권위 있는 정부·보건 사이트로 제한합니다. 이 프로젝트에서는 본문과 일치하는 의미 구조로 사용합니다. [Google FAQ 결과 변경 안내](https://developers.google.com/search/blog/2023/08/howto-faq-changes)

## 검증 결과

| 확인 | 결과 |
| --- | --- |
| ESLint / TypeScript / Next.js 프로덕션 빌드 | 통과 |
| 콘텐츠·페이지 폰트·OG 폰트·URL 단위 테스트 | 55개 통과 |
| 기존 랜딩 Playwright smoke | 9개 통과: Chromium, 모바일 WebKit, 동작 줄이기 |
| 가이드 Chromium 1440px·320px / WebKit 390px | 가로 넘침·브라우저 런타임 오류 없음, 목차·FAQ·신청·법률 링크 확인 |
| 가이드 Axe WCAG 2A/AA·2.1AA 및 best-practice | 세 화면에서 위반 0건. 자동 검사 범위 내 결과 |
| 자바스크립트 비활성화 | 본문·6단계·FAQ 8개 접근 가능 |
| 메타데이터·JSON-LD | 홈/가이드의 고유 제목·설명·대표 주소 확인, FAQ와 JSON-LD 답변 일치 |
| 공유 이미지 | 홈/가이드 OG·Twitter 메타데이터, PNG HTTP 200, 1200×630 확인 |
| 사이트맵·robots·noindex | 사이트맵은 홈/가이드 2개, 공개 수집 허용, 운영 화면 차단, 법률·운영 페이지 noindex 확인 |
| 출시 주소 검사 | 기본 운영 주소 허용, HTTP localhost와 HTTPS IPv6 loopback 거부, 기존 법률 차단 유지 |

로컬 증거는 `.context/seo-qa.mjs`, `.context/seo-qa-results.json`과 `seo-guide-*.png`, `seo-home-*.png`에 있습니다. `.context/`는 Git에 포함되지 않습니다. 전체 QA·Lighthouse를 다시 실행한 결과나 실제 사용자 Core Web Vitals, 검색 순위, AI 인용률은 이번 검증에 포함되지 않습니다. Google Rich Results Test와 Schema Validator에 운영 URL을 제출한 결과도 아직 없습니다.

## 배포 후 운영자가 진행할 일

1. 배포 환경의 대표 주소를 확인하고 변경된 사이트를 배포합니다. 출시 조건은 [기존 법률 운영 확인사항](legal-release-checklist.md)을 따릅니다. `HANBAT & CO.` 표기와 사전신청 보유기간 확인은 그대로 남아 있습니다.
2. [Google Search Console](https://search.google.com/search-console)에서 도메인 소유권을 확인하고 `https://www.the-saena.ai/sitemap.xml`을 제출합니다. 홈과 가이드의 URL 검사에서 수집 허용, 사용자 지정/Google 선택 canonical, 색인 상태를 확인합니다.
3. [Bing Webmaster Tools](https://www.bing.com/webmasters)와 [네이버 서치어드바이저](https://searchadvisor.naver.com/)에서도 소유권과 사이트맵을 등록합니다. 필요한 DNS 값·인증 파일·메타 태그는 각 도구가 실제 발급한 값으로 반영합니다. [네이버 사이트맵 제출 안내](https://searchadvisor.naver.com/guide/request-feed)
4. 운영 URL을 [Rich Results Test](https://search.google.com/test/rich-results)와 [Schema Validator](https://validator.schema.org/)에서 확인하고, 실제 메신저 공유 카드도 확인합니다. 구문 유효성과 검색 결과 노출 자격은 별도입니다.
5. 색인이 시작되면 4주간 주 1회 Search Console의 페이지·검색어별 노출, 클릭, CTR과 대표 URL을 기록합니다. 신청 전환과 AI 유입은 실제 분석 도구 및 동의 범위를 정한 후 측정합니다. 이 작업은 추적 도구를 새로 설치하지 않았습니다.

AI 답변의 초기 관찰 질문은 ‘사입삼춘은 어떤 앱인가요?’, ‘소매업자와 사입삼촌은 미송을 어떻게 함께 관리하나요?’, ‘사입 상품을 나눠 받았을 때 수량 차이는 어떻게 확인하나요?’입니다. 같은 질문을 월 1회 같은 언어·지역·검색 설정으로 확인하고 서비스·모델, 날짜, 원문 답변, 브랜드 언급, 인용 URL, 설명 오류를 기록합니다. 브랜드 언급과 출처 인용을 별도로 집계하고 단발성 결과를 전체 노출률로 해석하지 않습니다.

현재 Search Console·Bing·네이버 소유권과 분석 데이터 접근은 확인되지 않았으므로 검색 성과의 기준값은 미측정입니다. 배포 전 코드 변경만으로 순위 상승이나 AI 추천을 확정할 수 없습니다.
