# Agent Uncle Website Backoffice

사입삼춘 랜딩(`/`)과 운영 화면(`/admin`)이 함께 있는 Next.js App Router, TypeScript,
Tailwind CSS 프로젝트입니다. 개발 서버와 프로덕션 빌드는 Next.js 기본 번들러인
Turbopack을 사용합니다.

## 시작하기

Node.js 20.9 이상과 npm이 필요합니다.

```bash
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.
루트 레이아웃은 두 개입니다.

- 랜딩: `src/app/(site)/` (`layout.tsx`, `page.tsx`, `globals.css`)
- 운영 화면: `src/app/(admin)/` (`layout.tsx`, `admin.css`, 화면은 `admin/(console)/`)

둘은 CSS, 폰트, provider를 나누지 않고, `/`와 `/admin` 사이 이동은 전체 페이지 로드예요.
어떤 경로에도 맞지 않는 주소는 `src/app/global-not-found.tsx`가 보여 줘요.
`@/*` 경로 별칭은 `src/*`를 가리킵니다.

## 검증 및 프로덕션 실행

```bash
npm run lint
npm run typecheck
npm test               # vitest (src/**/*.test.ts, scripts)
npm run build
npm start
npm run test:e2e       # 랜딩 Playwright
npm run test:e2e:admin # 운영 화면 Playwright (로컬 Supabase 필요, 아래 참고)
npm run qa             # 랜딩 QA 전체 (빌드, 색, 대시, e2e, Lighthouse)
```

Tailwind CSS는 `next.config.ts`의 `@tailwindcss/turbopack` 로더로 연결되어 있어요.
랜딩은 `src/app/(site)/globals.css`, 운영 화면은 `src/app/(admin)/admin.css`가 진입점이에요.

## 운영 화면 (`/admin`)

사입삼춘 앱 운영자가 쓰는 콘솔이에요. 기준 문서는 다음과 같아요.

- 설계: `docs/superpowers/specs/2026-10-13-backoffice-design.md`
- 화면과 문구: `docs/superpowers/specs/2026-10-13-backoffice-screens.md`
- 빌드 계획: `docs/superpowers/plans/2026-10-13-backoffice-build-plan.md`, `…-tasks.md`

### 절대 규칙: service role 키는 쓰지 않아요

웹 앱에는 service role(secret) 키가 코드, env, 빌드, 런타임 어디에도 없어요 (spec D2).
운영자의 모든 호출은 그 사람의 JWT(publishable 키 + `/admin` 경로의 httpOnly 쿠키 세션)로
`SECURITY DEFINER` RPC(`backoffice_*`)를 부르고, 각 RPC는 `require_admin()`으로 시작해요.
로컬 service role 키는 `supabase-local/.env.seed.local`에만 있고 seed 스크립트만 읽어요.
`tests/e2e-admin/security.spec.ts`가 빌드 결과(`.next/static`)에 `sb_secret_`, `service_role`,
JWT 모양 문자열이 없는지 확인해요.

### 로컬에서 시작하기

로컬 Supabase(Docker, 포트 553xx)만 써요. 라이브 프로젝트에는 연결하지 않고,
`supabase-local/scripts/sb.sh`는 `link`, `db push` 같은 호스팅 명령을 거부해요.
자세한 내용은 `supabase-local/README.md`에 있어요.

```bash
supabase-local/scripts/start.sh   # 스택 시작 + .env.development.local에 BACKOFFICE_LOCAL 블록 작성
supabase-local/scripts/reset.sh   # DB 초기화 → 마이그레이션 → 데모 데이터 → 운영 계정 seed → 요약
LEAD_DRY_RUN=1 npx next dev -p 3100
```

[http://localhost:3100/admin](http://localhost:3100/admin)에서 로그인해요. 로컬과 라이브 모두
아이디와 비밀번호로만 로그인해요(로컬 아이디: admin, operator, viewer). 라이브 아이디는
`<아이디>@staff.agentuncle.invalid` Auth 계정으로 연결돼요.

| 역할 | 이메일 | 비밀번호 |
|---|---|---|
| 관리자 (owner) | `admin@agentuncle.local` | `agentuncle-admin-local` |
| 운영자 (operator) | `operator@agentuncle.local` | `agentuncle-operator-local` |
| 열람자 (viewer) | `viewer@agentuncle.local` | `agentuncle-viewer-local` |
| 운영 계정 아님 | `spare@agentuncle.local` | `agentuncle-spare-local` |
| 데모 앱 사용자 | `<slug>@demo.agentuncle.local` | `agentuncle-demo-local` |

e2e가 남긴 메모, 감사 로그, 설정 버전은 `reset.sh`로 지울 수 있어요.

### 환경 변수

모두 서버 전용이에요. 운영 화면은 `NEXT_PUBLIC_*` Supabase 값을 읽지 않아요.

| 변수 | 로컬 | 프로덕션 | 프리뷰 |
|---|---|---|---|
| `BACKOFFICE_SUPABASE_TARGET` | `local` | `live` | 없음 (운영 화면 꺼짐) |
| `BACKOFFICE_SUPABASE_URL` | `http://127.0.0.1:55321` | `https://auicerytbhnqeakmkscs.supabase.co` | - |
| `BACKOFFICE_SUPABASE_PUBLISHABLE_KEY` | 로컬 publishable 키 | 앱과 랜딩이 쓰는 publishable 키 | - |

- 로컬 값은 `supabase-local/scripts/write-env.mjs`(start.sh, reset.sh가 실행)가
  `.env.development.local`에 써요. 이 파일은 `next dev`에서만 읽혀요.
- `target=local`은 localhost만, `target=live`는 localhost가 아닌 주소만 허용해요.
  어긋나면 "운영 화면 설정을 확인해 주세요."가 보여요.
- `BACKOFFICE_SUPABASE_TARGET`이 없으면 모든 `/admin` 주소가
  "이 배포에서는 운영 화면이 꺼져 있어요."를 보여 줘요 (spec D11). 그래서 프리뷰 URL은
  라이브 데이터에 닿지 않아요.
- 프로덕션 빌드의 CSP는 빌드 시점의 `BACKOFFICE_SUPABASE_URL`로 만들어져요. 프로덕션 빌드
  환경에도 이 값을 넣어 주세요.
- 랜딩의 `NEXT_PUBLIC_SUPABASE_*`(`.env.local`)는 그대로 두고 덮어쓰지 않아요.

### 역할

운영 계정은 `public.backoffice_admins`의 행이에요 (`app_metadata`는 보지 않아요).

| 역할 | 할 수 있는 일 |
|---|---|
| 열람자 viewer | 대시보드, 운영 점검, 모든 목록과 상세 (개인정보는 가려져요), 채팅 목록, 원격 설정 읽기 |
| 운영자 operator | 개인정보 열람(기록됨), 사유를 남기고 서류·사진·대화 열람, 서류 검토, 이용 제한, 메모·케이스, 공지(info, important), 기능 스위치와 지원 정보, 거래 CSV, 감사 로그 |
| 관리자 owner | 운영자 기능 + 점검 모드와 최소 버전, critical 공지, 계정·문의 CSV, 감사 로그 무결성 확인, 운영 계정 부여와 해제 |

권한은 화면에서 한 번, Postgres RPC에서 다시 확인해요. 거래 기록(수량, 상태, 메시지 등)은
어떤 역할도 고칠 수 없어요.

### 스크립트

| 무엇 | 명령 |
|---|---|
| 로컬 스택 시작, 정지 | `supabase-local/scripts/start.sh`, `supabase-local/scripts/stop.sh` |
| DB 초기화와 데모·운영 계정 seed | `supabase-local/scripts/reset.sh` (`--empty`는 데이터 없이) |
| API 확인 (로그인, RLS, 운영 계층) | `node supabase-local/scripts/check-api.mjs` |
| 운영 계층 동작 확인 (153개, 롤백) | `supabase/backoffice/run-checks.sh` |
| 운영 계층 pgTAP | `supabase-local/scripts/sb.sh test db` |
| 라이브 스키마와 비교 (읽기 전용) | `node supabase-local/scripts/verify-schema.mjs` |
| 마이그레이션 사본 비교 | `supabase-local/scripts/sync-migrations.sh` |
| 운영 화면 e2e | `npm run test:e2e:admin` (dev 서버 3100 재사용, `PLAYWRIGHT_BASE_URL`로 변경 가능) |

운영 화면 e2e는 로컬 스택이 켜져 있고 `reset.sh`를 한 번 실행한 상태여야 해요. 일부 spec은
데이터를 바꿨다가 되돌리므로 worker 1개로 돌아요. `security.spec.ts`의 빌드 관련 확인
(번들 검사, `next start -p 3102`에서 운영 화면 꺼짐)은 `npm run build` 뒤에만 실행되고,
빌드가 없으면 건너뛰어요.

### 마이그레이션은 어디에 있고 어떻게 배포되나요

- 기준 파일: `supabase/backoffice/20261013090000_backoffice_admin_layer.sql`
  (동작 확인: `backoffice_checks.sql`, `run-checks.sh`). 다른 사본과 다르면 이 파일이 맞아요.
- 로컬 사본: `supabase-local/supabase/migrations/20261013090000_backoffice_admin_layer.sql`
  (바이트 단위로 같아야 하고, `sync-migrations.sh`가 비교해요).
- 이 저장소는 라이브에 `db push`하지 않아요 (spec D10). 마이그레이션은 앱 저장소의 migration
  history로만 배포돼요. 앱 팀이 `20261011230000_landing_leads.sql` 다음에 이 파일을 추가하고
  `supabase test db`, `db lint`, `smoke.py`, `db push --dry-run`, `db push` 순서로 반영해요.
- 그다음 SQL editor에서 첫 관리자를 seed하고, Vercel Production에 위 환경 변수를 넣고
  배포해요. 관리자는 TOTP를 등록한 뒤 자기 `require_mfa`를 켜요. 자세한 순서는
  `supabase/README.md`와 spec §13에 있어요.
