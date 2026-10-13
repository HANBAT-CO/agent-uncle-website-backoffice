# Agent Uncle Website Backoffice

Next.js App Router, TypeScript, Tailwind CSS 기반 프로젝트입니다.
개발 서버와 프로덕션 빌드는 Next.js 기본 번들러인 Turbopack을 사용합니다.

## 시작하기

Node.js 20.9 이상과 npm이 필요합니다.

```bash
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.
첫 화면은 `src/app/page.tsx`, 공통 레이아웃은 `src/app/layout.tsx`,
전역 스타일은 `src/app/globals.css`에서 수정합니다.
`@/*` 경로 별칭은 `src/*`를 가리킵니다.

## 검증 및 프로덕션 실행

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

Tailwind CSS는 `next.config.ts`의 `@tailwindcss/turbopack` 로더와
`src/app/globals.css`의 `@import "tailwindcss"`로 연결되어 있습니다.
기본 템플릿의 Geist 폰트는 `next/font/google`을 사용하므로 최초 빌드 시
Google Fonts에 접근할 수 있어야 합니다.
