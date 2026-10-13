# 사입삼춘 Landing Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan package by package. Steps use checkbox syntax. Process skills to invoke: superpowers:test-driven-development for every reducer, store and geometry module; design-taste-frontend and high-end-visual-design for every visual package; hairline-create for WP-13; vercel-plugin:nextjs and fullstack-dev-skills:nextjs-developer for App Router questions (read node_modules/next/dist/docs before using any Next API); superpowers:verification-before-completion before claiming any package done.

Goal: build the 사입삼춘 landing page specified in docs/superpowers/specs/2026-10-11-landing-design.md: one real night of one real request told by scroll, with a hairline night map, a physics pit, a route film, a hairline cart, a dawn theme switch, a tearable receipt, a role seam with real footage, an equation board, the promo film, and a Supabase lead form.

Architecture: the page shell is a Server Component that renders all copy (SEO, no-JS). Each section is an isolated folder with a server wrapper and client animation leaves. Sections never import each other. Cross-section continuity (clock, ledger, record rail, day/night phase) lives in a tiny external store; sections only report story beats from their own scroll progress, and the chrome derives everything from the store, so reverse scrolling is deterministic and each section can be built and tested alone.

Tech stack: Next.js 16.4 (App Router, Turbopack), React 19.3, TypeScript 5, Tailwind CSS 4 (brand tokens in src/app/globals.css), GSAP 3.15 + @gsap/react, Lenis 1.3, Motion 14.1 (UI leaves only), matter-js 0.20, ogl 1.0, vendored hairline kernel, React Bits (SplitFlapText, TearTicket, StatusMark), LDRS Treadmill, Radix primitives, Supabase (existing action), Vitest, Playwright, ffmpeg, sharp.

Spec: docs/superpowers/specs/2026-10-11-landing-design.md (read it with this plan; section numbers below refer to it).

## Global Constraints
- Next 16.4 rules: read node_modules/next/dist/docs before any Next API; priority prop on next/image is deprecated (use preload or fetchPriority); no webpack config; metadata only in Server Components; next/dynamic with ssr false only inside Client Components.
- Node 20.9 or newer for the app; media and map scripts are plain .mjs; the media script imports video/src/timeline.ts and therefore needs Node 22.6 or newer (this workspace runs Node 25).
- Copy: every visible string comes from src/content/copy.ts (written by WP-00 verbatim from spec section 7). Zero em dashes and zero en dashes. Middle dots only in verbatim app formats.
- Colour: only tokens from globals.css. No orange, lime, purple, glows, gradient text. No #E42939 or #D22030 in site styles. Record surfaces are always #F5F4EE with #101010.
- Type: Paperlogy only; weights 400, 700, 800 (display subset), 900 (display subset). Weight 800 only on strings listed in DISPLAY_800.
- Motion: GSAP and Motion never in the same component tree; every animation has a reduced-motion branch; no window scroll listeners; continuous values never in React state.
- Pins: only in the desktopMotion media query; refreshPriority per spec 3.2; call requestScrollRefresh() after lazy mounts.
- Truth: numbers only from spec table 0.6; footage only in S7, S8, S9; red only inside real media.
- Ownership: a package edits only the files it owns (listed per package). Shared files (package.json, globals.css, layout.tsx, page.tsx, src/content/*) belong to WP-00. Placeholder files created by WP-00 inside a section folder transfer to that section's package.
- Commits: one commit per completed task, conventional messages, ending with the attribution line required by the session.

## Review Focus (the failure modes most likely to bite; each has a test in the owning package)
1. Fast reverse scroll through pinned sections (End key then Home key, or a fling): plate, rail and phase must match the section at the viewport centre with no orphan entries. Test: WP-02 e2e chrome-reverse.spec.ts and WP-00 derive.test.ts.
2. Resize, orientation change and late font load during a pin: pins recalculate, no jump, no double spacer. Test: WP-20 e2e resize.spec.ts (resize at 50% of each pin).
3. Korean IME in the form (composition events) with Lenis active: no lost or duplicated syllables, draft persists across reload. Test: WP-19 e2e signup.spec.ts using page.keyboard.insertText plus composition simulation, and a manual iOS Safari check listed in WP-20.
4. Media unavailable: autoplay rejected (iOS Low Power), WebGL missing or context lost, Save-Data on, slow 3G. Test: WP-14 (no WebGL fallback), WP-16 and WP-18 (play() rejection shows poster and button), WP-20 throttled run.
5. Deep link on first load to #signup or #film (pins not yet measured). Test: WP-20 e2e deeplink.spec.ts asserts the target heading is within the viewport after load.

## File structure and ownership
```
src/app/layout.tsx                      WP-00 (modify)
src/app/page.tsx                        WP-00 (rewrite: final section order)
src/app/globals.css                     WP-00 (modify)
src/app/fonts/paperlogy.ts              WP-00 (modify) + paperlogy-800-display.woff2, paperlogy-900-display.woff2 (WP-00 generated)
src/app/opengraph-image.tsx             WP-20 (rewrite)
src/app/robots.ts, src/app/sitemap.ts   WP-20
src/app/actions/lead.ts                 WP-19 (modify: dry run, rate limit)
src/app/lab/**                          WP-01 (dev-only previews), deleted by WP-20
src/content/story.ts copy.ts glossary.ts legal.ts media.ts      WP-00
src/content/generated/film.json         WP-00 creates dev fixture, WP-03 owns and overwrites
src/lib/story/store.ts derive.ts derive.test.ts use-story.ts    WP-00
src/lib/gsap-plugins.ts device.ts motion.ts (modify) z.ts (modify) assets.ts (trim)   WP-00
src/lib/lead/constants.ts (new), schema.ts (modify to re-export)                     WP-00
src/hooks/use-in-view.ts                WP-00
src/components/section/**               WP-00
src/components/cta/**, dot/**, icons/** WP-00
src/components/seo/JsonLd.tsx           WP-00
src/components/lead/LeadFormGuards.tsx  WP-00 (import fix only)
src/components/map/**                   WP-01 (+ scripts/map/build-map.mjs)
src/components/device/**                WP-01
src/components/chrome/**                WP-02 (WP-00 creates Chrome.tsx placeholder)
src/components/rb/SplitFlapText.tsx     WP-02
src/components/rb/TearTicket.tsx        WP-15
src/components/rb/StatusMark.tsx        WP-17
src/components/sections/hero/**         WP-10
src/components/sections/words/**        WP-11
src/components/sections/route/**        WP-12
src/components/sections/cart/**         WP-13 (+ src/vendor/hairline/figures/cart.js)
src/components/sections/dawn/**         WP-14
src/components/sections/receipt/**      WP-15
src/components/sections/roles/**        WP-16
src/components/sections/trust/**        WP-17
src/components/sections/film/**         WP-18
src/components/sections/signup/**, sections/footer/**, src/components/ui/**   WP-19
src/vendor/hairline/kernel.mjs, kernel.d.mts   WP-00
scripts/fonts/**                        WP-00
scripts/media/**, public/media/**       WP-03
scripts/qa/**                           WP-20
tests/e2e/smoke.spec.ts                 WP-00; tests/e2e/<section>.spec.ts by the section package; tests/e2e/global/** WP-20
vitest.config.ts, playwright.config.ts  WP-00
deleted by WP-00: src/app/_smoke/**, public/app/screens/**, scripts/images/build-screens.mjs
```

## Dependency graph and integration order
1. WP-00 Foundation (blocks everything).
2. In parallel: WP-01 Map and device, WP-02 Record chrome, WP-03 Media pipeline.
3. In parallel, each as soon as its inputs exist: WP-10 Hero (00, 01), WP-11 Words (00, 01), WP-12 Route (00, 01), WP-13 Cart (00), WP-14 Dawn (00), WP-15 Receipt (00), WP-16 Roles (00, 01, 03), WP-17 Trust (00, 01, 03), WP-18 Film (00, 03; external: green v2 film renders), WP-19 Signup and footer (00).
4. WP-20 Integration, SEO and QA (all).
Merge order for section packages follows page order (10 to 19) to keep pin refresh behaviour easy to bisect.

## Shared interfaces (produced by WP-00, WP-01, WP-02; consumed by sections)
```ts
// src/content/story.ts (WP-00)
export type SectionId = 'hero'|'words'|'route'|'cart'|'dawn'|'receipt'|'roles'|'trust'|'film'|'signup'|'footer';
export type BeatId = 'b2200'|'b2330'|'b0216'|'b0306'|'b0307'|'b0553'|'b0553d'|'b0849'|'b0941'|'bnow';
export type RecordId = 'r2005'|'r2031'|'r0216'|'r0306'|'m0307'|'r0553a'|'r0553b'|'r0849';
export type DenimStatus = '진행 중'|'답변 필요'|'미송 대기';
export type Ledger = { requested: number; secured: number; delivered: number; received: number; unconfirmed: number | null; backorder: number | null; status: DenimStatus };
export type Phase = 'night'|'day';
export type Beat = { id: BeatId; clock: string; phase: Phase; ledger: Ledger; adds: RecordId[] };   // clock 'now' for bnow
export type StoryRecord = { id: RecordId; kind: 'record'|'message'; day: '10월 10일'|'10월 11일'; time: string; title: string; detail?: string; request: 'denim'|'cardigan'; movesLedger: boolean; section: SectionId };
export type RailMode = 'open'|'spine'|'hidden'|'pill'; export type PlateMode = 'full'|'compact'|'hidden'; export type PillMode = 'show'|'hidden';
export const BEAT_ORDER: readonly BeatId[]; export const BEATS: Readonly<Record<BeatId, Beat>>; export const RECORDS: Readonly<Record<RecordId, StoryRecord>>;
export const SECTION_ORDER: readonly SectionId[]; export const SECTION_DEFAULT_BEAT: Readonly<Record<SectionId, BeatId>>;
export const SECTION_CHROME: Readonly<Record<SectionId, { rail: RailMode; plate: PlateMode; pill: PillMode }>>;
export const DENIM_LABEL = '와이드 데님 팬츠 · 연청 · 27';

// src/lib/story/store.ts (WP-00)
export type VisitorRecord = { id: string; kind: 'answer-wait'|'signup'; time: string; meta: string; title: string; tag?: '예시' };
export type VisitorDraft = { lines: string[] } | null;
export type StoryState = { active: SectionId; beats: Partial<Record<SectionId, BeatId>>; visitor: VisitorRecord[]; draft: VisitorDraft };
export const story: { getState(): StoryState; getServerState(): StoryState; subscribe(fn: () => void): () => void; setActive(id: SectionId): void; reportBeat(section: SectionId, beat: BeatId): void; addVisitorRecord(input: Omit<VisitorRecord, 'id'>): void; setDraft(draft: VisitorDraft): void; resetVisitor(): void };

// src/lib/story/derive.ts (WP-00, pure, unit-tested)
export function beatIndex(id: BeatId): number;
export function currentBeatId(s: StoryState): BeatId;
export function currentLedger(s: StoryState): Ledger;            // applies 미송 대기 after a visitor answer-wait at b0941 or later
export function railEntries(s: StoryState): Array<{ type: 'story'; record: StoryRecord } | { type: 'visitor'; record: VisitorRecord }>;
export function chromeFor(s: StoryState): { rail: RailMode; plate: PlateMode; pill: PillMode; phase: Phase; clock: string };

// src/lib/story/use-story.ts (WP-00)
export function useStorySelector<T>(selector: (s: StoryState) => T): T;
export function useStoryBeats(section: SectionId, markers: ReadonlyArray<readonly [number, BeatId]>): (progress: number) => void;

// src/lib/gsap-plugins.ts (WP-00)
export const PIN_PRIORITY: { hero: 50; words: 40; route: 30; dawn: 20; film: 10 };
export const MQ: { desktopMotion: string; mobileMotion: string; reduced: string };
export function loadDrawSVG(): Promise<unknown>; export function loadMotionPath(): Promise<unknown>; export function loadScrambleText(): Promise<unknown>; export function loadFlip(): Promise<typeof import('gsap/Flip').Flip>; export function loadDraggable(): Promise<{ Draggable: typeof import('gsap/Draggable').Draggable }>;
export function requestScrollRefresh(): void;

// src/lib/device.ts (WP-00)
export function useLowPower(): boolean; export function useFinePointer(): boolean;

// src/components/section/SectionShell.tsx (WP-00, server)
// props: { id: SectionId; titleId: string; tone: 'night'|'day'|'dawn'; pad?: 'none'|'default'; className?: string; children: React.ReactNode }
// src/components/cta/CtaButton.tsx (WP-00): { href: string; children: string; tone: 'night'|'day'; variant?: 'primary'|'secondary'; size?: 'md'|'lg'; pending?: boolean; type?: 'link'|'submit'; form?: string }
// src/components/dot/QuantityDot.tsx (WP-00): { tone: 'lamp'|'ink'; size?: number; className?: string }
// src/components/icons/AppIcon.tsx (WP-00): { name: 'chevron'|'bag'|'store'|'check'|'clock'|'shirt'|'truck'|'pin'|'send'; size?: number; className?: string; title?: string }

// src/components/map (WP-01)
// MarketMap (server): { view: 'hero-desktop'|'hero-mobile'; layer: 'base'|'record'; route?: 'none'|'round'; idPrefix: string; className?: string }
export type MapBuildingId = 'diot'|'cheongpyeonghwa'|'nampyeonghwa'|'apm';
export function getMapView(view: 'hero-desktop'|'hero-mobile'): MapView;     // camera, viewBox, buildings (paths, lengths, door, roof, footprint), focus point, round route {d, length, stops}
export function unproject(view: MapView, sx: number, sy: number): [number, number];
export function pickBuilding(view: MapView, sx: number, sy: number): MapBuildingId | null;

// src/components/device (WP-01)
// Device (server): { screenWidth: number; label: string; children: React.ReactNode; className?: string }
// DeviceVideo (client): { clip: AppClip; still: AppStill; mode: 'in-view'|'on-demand'; playLabel: string; pauseLabel: string; onEnded?: () => void }
export const mediaManager: { register(id: string, el: HTMLVideoElement): () => void; play(id: string): Promise<boolean>; pause(id: string): void; pauseAll(): void };
```

## Section build recipe (every section package follows it)
1. Replace the placeholder src/components/sections/<id>/index.tsx with a Server Component that renders SectionShell, the h2 with id <id>-title, and every copy string in reading order (no-JS baseline equals the reduced-motion layout).
2. Put animation in client leaves (<Name>Motion.tsx) using useGSAP with gsap.matchMedia branches MQ.desktopMotion, MQ.mobileMotion, MQ.reduced; scope selectors to the section ref.
3. Report beats with const report = useStoryBeats('<id>', markers) from the section's own ScrollTrigger onUpdate (progress). Never write chrome state directly.
4. Lazy-load heavy leaves with next/dynamic (ssr false) inside a client wrapper, triggered by useInView with rootMargin 100%; call requestScrollRefresh() after mount.
5. Pins: pin an inner div, refreshPriority from PIN_PRIORITY, start 'top top', end '+=Nvh' as specified.
6. Tests: unit tests for any reducer or geometry; tests/e2e/<id>.spec.ts with three projects (desktop 1440x900, mobile 390x844, reduced motion) asserting copy, key interactions, the beat reported (read through the plate's accessible summary), and taking screenshots into test-results for review.
7. Visual review: compare screenshots against the spec section; run the design-taste pre-flight list for the section.
8. Run npm run lint, npm run typecheck, npm test, npm run test:e2e -- tests/e2e/<id>.spec.ts, npm run build.

## Testing and verification strategy
- Unit (Vitest, node env): story derivations, ledger rules (S8), proposal machine (S8), idempotency demo (S8), map camera math (WP-01), media manager logic (WP-01), font subset coverage (WP-00), copy guards (no dashes, no banned words) (WP-00).
- E2E (Playwright, @playwright/test): projects desktop-chromium (1440x900), mobile-webkit or mobile-chromium (390x844, isMobile, hasTouch), reduced-motion (desktop, reducedMotion reduce). webServer runs next build and next start on port 3100 with LEAD_DRY_RUN=1.
- Media gates: npm run media:audit (film colours) and npm run media:verify (every manifest path exists with expected dimensions).
- Performance: Lighthouse CI against the production server (WP-20), budgets from spec section 13.
- Manual: a real iPhone (Safari) pass for pins, video, tear swipe, IME; a keyboard-only pass; VoiceOver pass of S1, S2, S7, S8, S10 (WP-20 checklist).

## Work package summary
| WP | Title | Depends on |
|---|---|---|
| WP-00 | Foundation: deps, tokens, fonts, content, story engine, shell, placeholders, test infra | none |
| WP-01 | Shared visuals: market map + device + media manager | WP-00 |
| WP-02 | Record chrome: nav, record column, plate, mobile pill and sheet, phase sync, grain | WP-00 |
| WP-03 | Media pipeline: app clips, stills, film, chapters, audits | WP-00 |
| WP-10 | S1 hero | WP-00, WP-01 |
| WP-11 | S2 words pit | WP-00, WP-01 |
| WP-12 | S3 route | WP-00, WP-01 |
| WP-13 | S4 cart (hairline) | WP-00 |
| WP-14 | S5 dawn | WP-00 |
| WP-15 | S6 receipt | WP-00 |
| WP-16 | S7 roles seam | WP-00, WP-01, WP-03 |
| WP-17 | S8 trust board | WP-00, WP-01, WP-03 |
| WP-18 | S9 film | WP-00, WP-03 |
| WP-19 | S10 signup + S11 footer | WP-00 |
| WP-20 | Integration, SEO/OG, QA, release gates | all |

## Definition of done (release checklist)
- [ ] All packages merged in order; npm run lint, typecheck, test, build green.
- [ ] Playwright desktop, mobile and reduced-motion projects green, including WP-20 global suites (reverse scroll, resize, deep links, no dashes, no banned colours, keyboard path).
- [ ] Lighthouse mobile at or above the budgets; LCP under 2.5s on the Moto G Power profile.
- [ ] npm run media:audit and media:verify green; src/content/generated/film.json ready true.
- [ ] Lab routes deleted; no console errors or warnings on the home page.
- [ ] Client blockers answered or explicitly waived in writing: company name, consent retention text and privacy page.
- [ ] Manual iPhone, keyboard and VoiceOver passes recorded in docs/qa/2026-10-landing.md by WP-20.