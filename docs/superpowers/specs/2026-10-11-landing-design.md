# 사입삼춘 랜딩 페이지: 최종 디자인 스펙 (밤의 사입 루트)

File: docs/superpowers/specs/2026-10-11-landing-design.md
Status: locked for build. Page language: Korean (lang="ko"). Every Korean string in this spec is final copy. Strings marked [app] are verbatim from the app or the 2026-10-11 capture. The page contains zero em dashes and zero en dashes; ranges use a hyphen.

Inputs this spec is grounded in (all paths relative to the repo root):
- Product brief: .context/brief/product.md
- Real footage and stills: .context/app-capture/videos, .context/app-capture/screenshots, .context/app-capture/README.md, seed harness .context/app-capture/tools/film_app.dart and film_v2.dart
- Research: .context/research/{webzibition,supahero,gdweb,refero,toolkit}/report.md and their screenshots
- Film remake: video/src (timeline.ts, theme.ts, HeroLoop.tsx), .context/video/v2-edl.md, outputs in video/out
- Foundation already in src/: Paperlogy via next/font/local (src/app/fonts/paperlogy.ts), Tailwind v4 brand tokens (src/app/globals.css), Lenis + GSAP (src/components/motion/SmoothScroll.tsx, src/lib/gsap.ts), lead action (src/app/actions/lead.ts, src/lib/lead/schema.ts), insert-only RLS table landing_leads (supabase/migrations/20261011230000_landing_leads.sql)

---

## 0. Decision record

### 0.1 Winner
night-route wins on combined totals (22.85 vs 21.875 vs 21.85). It is the only concept that builds one culturally specific world: one real Dongdaemun night of one real request, told in the demo's own on-screen timestamps, drawn in one hairline line language, with every interaction a product rule made physical.

### 0.2 Kept from night-route
- Scroll is the clock of one night. The thread is the real seeded request 와이드 데님 팬츠 · 연청 · 27, 요청 6 (망원 셀렉트샵 → 동대문 박삼촌, 데님하우스 · 청평화 1층 가-17).
- Framed hairline isometric night map with a bounded scanner lens over a record layer.
- 23:30 physics pit: loose chat re-cut into the app's real buttons.
- Route 02:16 APM → 03:06 청평화 where the ledger moves only on 업무 기록 cards and never on a chat bubble.
- Hairline 손수레 that physically cannot take a seventh bag and rests on the recorded 2/4.
- 05:53 dawn, the page's single theme switch (night to morning).
- Tearable receipt stub, 09:41 role seam with real home screens, film opening out of the dot, the visitor's 사전 신청 joining the log, the dot as the full stop of 사입삼춘.

### 0.3 Grafts adopted
From one-ledger:
- Record surfaces never change colour during the theme switch: the record plate and record cards are always paper #F5F4EE with ink #101010, so the numbers visibly do not move while the world relights.
- Monumental equation board (수령 ≤ 전달 ≤ 확보 in Paperlogy 900) with steppers that refuse impossible numbers using the app's own strings; replaces night-route's 4-cell bento.
- Film-drop timing for the dot: 420ms power2.in drop, 90ms squash, 380ms settle on cubic-bezier(.34,1.56,.64,1).
- Dashed ghost bags for hanging 미송 in the cart figure.
- Honest footnotes: 가입 후 역할 변경은 제공하지 않아요. and 예시예요. 이 페이지 안에서만 바뀌어요. on every interactive record surface.
- Proof index of real guardrail strings (no overwrite, no duplicates, no one-sided edits, kept input).
- Site-side refusals and form errors in ink with a 2px deep-green rule; red only inside real footage and screenshots.
- The silence line 답이 없다고 동의한 게 아니에요. and typographic quotes in the S2 headline.
- A confirmed path to 완료 that shows both sides acting (as a replay of the counterpart, never as the visitor switching roles).
From chaos-to-record:
- S2 vocabulary pills are real app words with glossary captions; the same glossary powers the record plate tooltips.
- 끊겨도 한 번만 idempotency micro-demo (offline retry ends in exactly one saved request).
- A labelled sample branch for 수량 차이 (what-if only, never written to the log).
- Footer list of the records this visit created.
- Test-first reducers for the steppers, the proposal flow and the story derivations.
- Media manager (one decoder at a time), low-power heuristic, IME safeguards, fixed-width digit cells.
- Visitor's record joins the log stamped with real local time.

### 0.4 Grafts rejected
- Slide-to-send gate: the app sends with a tap and a confirm dialog; a slider would teach a wrong interaction.
- One-ledger's 오버핏 셔츠 backbone for the whole page: its in-app records are stamped 09:37 to 09:39 and cannot carry a night. The shirt appears only where the footage is the shirt (the film, the chat device), framed as this morning's next request.
- ㅅ/ㅊ mark split and page-wide role relight: invents a brand meaning, alters the one-path mark, implies a role switch the app does not offer.
- Frame-accurate ledger ticks from footage: no footage drives the ledger in this design.
- Animated React Bits Noise: an idle infinite loop. Replaced with static CSS grain.
- Confirm modal in the lead form: friction. The live record card is the review.

### 0.5 Fatal flaws fixed
| Flaw (judges) | Fix in this spec |
|---|---|
| About 1300vh of pins | 600vh total on desktop (hero 100, words 120, route 180, dawn 120, film 80). Cart, receipt, roles, trust, form, footer are unpinned. Mobile has no pins. |
| Four always-on chrome zones; time strip tell | One record column (rail of record cards with the record plate at its foot) plus the nav. No place line, no date line, no HUD tick ruler. The clock lives inside the plate as the time of the record. |
| Templated bento | Equation board (S8). |
| Two requests on screen at once | The night is told by the denim's real records and objects only. Phone footage appears only at 09:41 and later, and only footage consistent with the denim's state (homes, denim detail, the pair's chat). The shirt flow lives in the film. |
| One-minute timestamp drifts | Every time used was read on screen (table 0.6). 08:47 becomes 08:49. |
| Saturday vs 토요일 밤 휴무 | No weekday in site copy; the partner-detail screen (shows 토요일 밤 휴무) is never used. |
| Red on site-built steppers | No red anywhere except inside real footage and screenshots. |
| Persistent map plane, rail Flips in four sections, one dot across 11 anchors: nothing testable alone | Each section owns its own map instance, its own dot, its own animation. Continuity is by matched start and end states. Chrome reads a derived store; sections only report beats. |
| Reverse scroll undefined | Beats, ledger and rail entries are pure functions of scroll position. Physics poses are recorded on freeze and replayed in reverse. The receipt resets when scrolled back above it. |
| Per-frame :root variable interpolation | A single html[data-phase] flip at a scroll threshold with 700ms CSS transitions. The sky gradient lives inside the dawn section only. |
| 3D-scaled large SVG map re-rasterising | Map at most 30KB gz, non-scaling strokes, scale at most 1.6, rotateX at most 10deg, will-change only while pinned, no rotateX on low-power devices. |
| Rail collides with content at 1024-1279 | No rail below 1280px; plate only. |

### 0.6 Data audit (read on screen on 2026-10-12)
Verified in .context/app-capture/screenshots and in frames of videos/03-request-detail_1080w30.mp4 (처리 이력) and videos/09-chat_1080w30.mp4 (chat scroll):
| Time | Record [app] | Request | Where verified |
|---|---|---|---|
| 10월 10일 20:05 | 새 사입 요청을 보냈어요 | denim | detail header 10월 10일 20:05; 처리 이력 |
| 10월 10일 20:31 | 요청을 수락했어요 | denim | chat card; 처리 이력 |
| 10월 11일 02:16 | 확보 5개 · 미송 3개 결과를 공유했어요 / 오트밀 3장은 아침 입고분으로 다시 확인해요. | cardigan | chat card |
| 10월 11일 03:06 | 확보 2개 · 미송 4개 결과를 공유했어요 / 연청 27은 월요일 재입고 예정이에요. | denim | chat card; 처리 이력 |
| 03:07 | bubble from 박삼촌: 데님 연청 27은 2장만 있어서 먼저 챙겼어요. 남은 4장은 월요일 재입고래요. | denim | chat |
| 10월 11일 05:53 | 2개 전달을 기록했어요 | denim | chat card; 처리 이력; 전달·수령 내역 수령 확인 · 10월 11일 05:53 |
| 10월 11일 05:53 | 5개 전달을 기록했어요 | cardigan | chat card |
| 10월 11일 08:49 | 2개 수령을 확인했어요 | denim | 처리 이력 |
| 09:41 | detail: 답변 필요; 누적 확보 2장, 전달 대기 0장, 누적 전달 2장, 남은 미송 4장; 2026-10-13 미송 재확인; CTA 미송 4장 답변하기 | denim | 06-request-detail.png |
| 09:41 | retailer home: 다음 미송 재확인 / 2026-10-13 / 와이드 데님 팬츠 / 남은 미송 4장 | denim | 04-home-scroll.png |
| 09:41 | uncle home: 업무 중 · 요청 마감 23:30; 상대방 확인 대기 1건 / 와이드 데님 팬츠 / 연청 · 27 · 답변 필요 | denim | 10-uncle-home.png |
| profile | 동대문 12년차 사입삼촌이에요. 밤 10시부터 새벽 5시까지 픽업해요. | 박삼촌 | 25-partner-detail.png (screen not shown; it also shows 토요일 밤 휴무) |
Seed-only values used as clearly labelled demo data: the 05:53 batch 2개 요청, 총 7개 (가디건 5 + 데님 2), the shop note 오전 11시 오픈 전 매장 앞 보관함, the four lens records (all seeded in film_app.dart and consistent with the 업무 tab footage). Never used: the 08:52 bubble (seed 08:52, likely displays 08:53, never on screen) and any cardigan receipt time.

---

## 1. Design read and dials

Reading this as: an experimental two-sided B2B product landing for Korean fashion retailers (소매업자) and Dongdaemun buying agents (사입삼촌), told as one real night of one real request, in a nocturnal map-and-ledger language drawn with hairline isometric strokes, leaning toward native SVG + GSAP ScrollTrigger scrolltelling on Lenis, Paperlogy display type, and a deep-green night that turns into an off-white paper morning. No design system; Radix primitives only inside the form, fully restyled.

Dials (desktop): DESIGN_VARIANCE 9, MOTION_INTENSITY 9, VISUAL_DENSITY 4. Mobile: 6 / 6 / 4.
- Variance 9: eleven sections, eleven layout families, none repeated (section table, 3.1).
- Motion 9: scroll is literally the clock; pins, physics, a figure, a shader and a seam are the content. Every motion has a one-line motive (6.4).
- Density 4: each section carries one idea, a headline of at most about 16 syllables per line and a body of at most 25 words. Numbers live in the record plate and the equation board.

Aesthetic families: night chapters use a Forest palette on deep green with mint light; morning chapters use Soft Structuralism on warm paper with deep-green ink. Materials: lit paper slips (record cards, the receipt, the plate) floating on dark ground at night; double-bezel paper sheets by day.

---

## 2. Truth model

Rules every package follows:
1. Pixel rule: inside a phone frame, only real pixels from .context/app-capture (stills or footage). Outside a phone frame, app strings may be set as typographic paper objects (record cards, slips, tokens) in the site's own material, never inside a phone frame and never imitating a screenshot.
2. Number rule: every number shown is either in table 0.6, derived from it (for example 미송 = 요청 − 확보), or explicitly labelled 예시 inside an interactive sample surface.
3. The night belongs to the denim. The shirt (오버핏 셔츠) appears only in the promo film and inside the chat footage in S8, where it is this morning's next request in the same 1:1 chat.
4. Red (#E42939, #D22030) appears only inside real footage and screenshots. Site-built statuses and errors are ink with a deep-green rule.
5. No weekday in site copy. 월요일 appears only inside the two verbatim 03:06 and 03:07 strings.
6. Honesty lines are placed where data appears: 지도 속 거래처와 수량은 데모 데이터예요. (S1), 예시 대화예요. (S2), 실제 앱 화면이에요. 데모 데이터로 촬영했어요. (S7), 예시예요. 이 페이지 안에서만 바뀌어요. (S8), 영상 속 화면은 실제 앱 화면이에요. 매장과 상품은 예시 데이터예요. (S9).
7. Never claim: push notifications (say 알림함), payments, settlement, business verification, store availability, launch dates, usage numbers, testimonials.
8. Middle dots only inside verbatim app strings or app-format labels ({상품} · {옵션}, {거래처} · 요청 {n}장, 업무 기록 · HH:MM).

---

## 3. Page architecture

### 3.1 Sections
| # | id (anchor) | Story time | Layout family | Desktop pin | Mobile |
|---|---|---|---|---|---|
| S1 | hero (#top) | 22:00 | Framed isometric night map with lens | 100vh dive | 46dvh map + chips, no pin |
| S2 | words | 23:30 | Physics pit re-cut into a two-column ledger | 120vh | 70vh pit + static list |
| S3 | route | 02:16-03:07 | Pinned route film on the map | 180vh | three stacked stop blocks |
| S4 | cart | 03:06 | Object stage: hairline figure + flanking cards | none | stacked, stepper |
| S5 | dawn | 05:53 | Atmosphere chamber: sky, horizon route, record ruler | 120vh | 160vh CSS band, vertical route |
| S6 | receipt | 08:49 | Editorial paper object: tilted slip + statement | none | full-width slip |
| S7 | roles | 09:41 | Draggable split seam between two real devices | none | segmented toggle, one device |
| S8 | trust | 09:41 | Equation board + proposal + chat device + history + proof index | none | stacked |
| S9 | film | none | Cinema reveal from the dot | 80vh | 9:16 frame |
| S10 | signup | 지금 | Document form + live record in the log | none | single column, sticky submit |
| S11 | footer | 지금 | Giant wordmark footer | none | two-line wordmark |

Nav anchors: 흐름 → #route, 역할 → #roles, 신뢰 → #trust, 영상 → #film, CTA 사전 신청 → #signup.

### 3.2 Pin budget
Desktop (min-width 1024px, no reduced motion): 600vh total. Pins use start 'top top', pin true, anticipatePin 1, invalidateOnRefresh true and refreshPriority hero 50, words 40, route 30, dawn 20, film 10 so parallel-built sections refresh in page order. Mobile and tablet below 1024px: zero pins. Reduced motion: zero pins.

### 3.3 Story engine (how the clock works)
- Beats (ordered): b2200, b2330, b0216, b0306, b0307, b0553, b0553d, b0849, b0941, bnow.
- Each beat defines: clock, phase (night/day), ledger for the denim, cumulative record ids.
| Beat | Clock | Phase | 요청/확보/전달/수령 | 미확인 or 남은 미송 | Status | Records added |
|---|---|---|---|---|---|---|
| b2200 | 22:00 | night | 6/0/0/0 | 미확인 6 | 진행 중 | r2005, r2031 |
| b2330 | 23:30 | night | 6/0/0/0 | 미확인 6 | 진행 중 | none |
| b0216 | 02:16 | night | 6/0/0/0 | 미확인 6 | 진행 중 | r0216 (cardigan) |
| b0306 | 03:06 | night | 6/2/0/0 | 남은 미송 4 | 답변 필요 | r0306 |
| b0307 | 03:07 | night | 6/2/0/0 | 남은 미송 4 | 답변 필요 | m0307 (bubble) |
| b0553 | 05:53 | night | 6/2/2/0 | 남은 미송 4 | 답변 필요 | r0553a, r0553b |
| b0553d | 05:53 | day | 6/2/2/0 | 남은 미송 4 | 답변 필요 | none |
| b0849 | 08:49 | day | 6/2/2/2 | 남은 미송 4 | 답변 필요 | r0849 |
| b0941 | 09:41 | day | 6/2/2/2 | 남은 미송 4 | 답변 필요 (미송 대기 after the visitor's sample 기다리기) | visitor records become visible |
| bnow | 지금 HH:MM (visitor local) | day | same | same | same | visitor records |
- A store holds: the active section (the section whose box contains the viewport's horizontal centre line; each section owns one ScrollTrigger from 'top center' to 'bottom center'), the beat each section last reported, visitor records, and the visitor's draft summary.
- The current beat is the beat reported by the active section, or that section's default beat. Default beats: hero b2200, words b2330, route b2330, cart b0307, dawn b0307, receipt b0553d, roles b0941, trust b0941, film b0941, signup bnow, footer bnow.
- Sections report beats from their own scroll progress with markers [progress, beat]; reporting is a pure function of progress, so scrolling back rewinds the HUD exactly.
- Visitor records are visible only when the current beat is b0941 or later and are persisted in sessionStorage (key au:visitor).

### 3.4 Chrome mode per section
| Section | Rail (min 1280px) | Plate | Mobile pill |
|---|---|---|---|
| hero, words, route, cart, dawn, receipt | open | full | show (hero: only after the CTAs leave view) |
| roles | spine | compact | show |
| trust | spine | hidden (the board shows the numbers) | hidden |
| film | hidden | hidden | hidden |
| signup | open (draft card lives here) | full, clock shows 지금 | hidden (form has its own sticky submit) |
| footer | pill 업무 기록 n | hidden | hidden |
Between 1024 and 1279px the rail never opens; the plate sits bottom-right in compact form. Below 1024px the rail and plate become the mobile pill and sheet.

---

## 4. Design system

### 4.1 Palette (green is the only key colour)
Night (S1-S5 start):
- Ground #07231C; plates #093A32; strong lines and filled night buttons #0C483E.
- Text #EDECE3 (about 14:1 on #07231C); secondary #B6D7C2 (about 10.7:1).
- Light that means something: mint #F2FFE8, used for the lens ring, bright map strokes, the dot as a lamp, connectors, record highlight outlines, primary CTA fill at night.
- Dim strokes: rgba(182,215,194,0.30) for map bases, rgba(182,215,194,0.16) for the stream and roads.
Morning (S5 end-S11):
- Canvas #EDECE3; sheets #F5F4EE; ink #101010; body #2D2D2D and #484848; captions #636363; dividers #D7D7D7; inputs #E4E3DA.
- Accent #0C483E for primary buttons, the dot, focus rings, bright strokes; weak green rgba(12,72,62,0.12) for badges and weak buttons; mint #F2FFE8 only for tinted guidance cards (미송 재확인, 수령 안내), as in the app.
Record surfaces (always, both phases): paper #F5F4EE, ink #101010, meta #636363. Record cards, the record plate, the receipt slip, the dawn confirm card and the lens readout never change colour.
Chrome by phase (html[data-phase]): nav pill night = #093A32 at 88% with blur 16 and mint text; day = #F5F4EE at 82% with blur 16 and ink text; --accent-live mint at night, #0C483E by day.
Logo: ㅅㅊ symbol always #111111. At night it sits on a 32px #F5F4EE rounded plate inside the nav.
Banned: orange, red-orange, persimmon, vermilion, lime (#C6FF3A, #E8572E, #FF5B35, #D9704F and any hue 8-60deg or 65-100deg with saturation above 0.5), purple, glows, gradient text. The only gradient is the S5 sky.
Contrast: WCAG AA everywhere; HUD text on night ground at least 7:1; mid-switch frames are checked at S5 62%.

### 4.2 Typography (Paperlogy only, static weights)
Files and loading (next/font/local, family declared Paperlogy):
- 400 Regular, KS X 1001 subset (existing paperlogy-400.woff2): body, captions, inputs. Preloaded.
- 800 ExtraBold display subset (new paperlogy-800-display.woff2, generated from DISPLAY_800 strings, about 30KB): H1 and H2 only. Preloaded.
- 700 Bold, KS X 1001 subset (existing): numbers, labels, buttons, UI titles, the live record card. Deferred (swap).
- 900 Black display subset (new paperlogy-900-display.woff2: 사입삼춘. digits 0-9, ≤, 장): footer wordmark and equation numerals. Deferred.
- 300, 500, 600 files are removed from the loader. A unit test fails if any DISPLAY_800 or DISPLAY_900 character is missing from its subset.
Scale:
- H1: 800, clamp(40px, 4.4vw, 68px), line-height 1.14, tracking -0.02em. 2 lines desktop, 3 lines mobile at 30px.
- H2: 800, clamp(30px, 3.4vw, 52px), line-height 1.18, -0.02em.
- H3: 700, 22px (app t3), line-height 1.4.
- Body: 400, 17px/1.65 desktop, 16px/1.65 mobile, max-width 34em (about 34 syllables).
- Caption and meta: 400, 13px/1.6 (app t7).
- Plate numbers: 700, 22px (app quantity tile size), unit 장 at 0.55em/400 in #636363.
- Plate clock: 700, 28px split-flap cells.
- Read-outs (cart): 700, clamp(32px, 4vw, 56px).
- Equation numerals: 900, clamp(96px, 15vw, 240px), line-height 1.
- Footer wordmark: 900, min(22vw, 320px) desktop, 19vw mobile, line-height 1.
Hangul rules: word-break keep-all (foundation), text-wrap balance on headings, line breaks by meaning (copy arrays define lines), tracking never tighter than -0.02em, no uppercase tracked labels, no eyebrows, no italic (Paperlogy has none). Big bold count next to small grey label is the app's core motif and is repeated on purpose.
Numerals: every changing number renders in fixed-width digit cells (inline-block 0.62em, centred) so nothing jitters.

### 4.3 Grid and spacing
- Breakpoints: sm 640, md 768, lg 1024, xl 1280, 2xl 1536.
- 12 columns, column gap 24px, side gutter var(--spacing-gutter) (24 to 48px), max content 1440px.
- Record column (min 1280px, night chapters and signup): fixed to the right, width var(--record-col) = clamp(272px, 22vw, 336px), top 96px, bottom 24px. Utility .stage-night limits section content to max-width calc(100vw - var(--record-col) - 3 * var(--spacing-gutter)) at min 1280px in S1-S6 and S10.
- Unpinned section padding: 128px top and bottom desktop, 80px mobile. Hero top padding at most 96px.
- Mobile collapse: every multi-column layout becomes one column below 768px with 24px gutters.

### 4.4 Shape and materials
- Radius lock: cards, sheets, record cards, slips, readouts 24px; inputs 16px; every button, chip, token and pill full radius; device bezel 56px outer and 44px screen; double-bezel shells 30px outer with 6px padding and 24px inner.
- Double-bezel (high-end): outer shell rgba(16,16,16,0.04) with a 1px rgba(16,16,16,0.06) ring and 6px padding; inner core #F5F4EE with inset 0 1px 0 rgba(255,255,255,0.6). Used for the film frame and the form sheet.
- Shadows: tinted only. Floating paper by day 0 18px 48px -12px rgba(7,35,28,0.22); cards 0 8px 24px rgba(16,16,16,0.08). At night paper objects get a 1px rgba(242,255,232,0.08) ring instead of a shadow.
- Grain: day phase only, static SVG fractal noise (feTurbulence baseFrequency 0.8, 2 octaves) as a data-URI background on a fixed, pointer-events none layer at opacity 0.035, z-index token grain (50). Removed under prefers-contrast: more. No animated grain.
- Glass: only the nav pill (backdrop blur 16) with an opaque fallback under prefers-reduced-transparency (foundation utility).

### 4.5 Iconography
- App icons only for product meaning, converted to React components with stroke currentColor, stroke-width 1.7, round caps and joins: figma_chevron, figma_bag, figma_store, figma_check, figma_clock, figma_shirt (from .context/brief/assets/icons); tds_truck, tds_pin, tds_send (filled mono, currentColor).
- Phosphor Light (already a dependency) only for media and form chrome: Play, Pause, SpeakerHigh, SpeakerSlash, WarningCircle. Weight light, size 20.
- Primary CTA trailing circle holds figma_chevron. Nothing hand-drawn.

### 4.6 The quantity dot
- One visual object with local instances (no global element): a 16px circle.
- lamp (night): fill #F2FFE8 plus a 1px #F2FFE8 ring at 30% opacity offset 4px (a halo ring, not a glow).
- ink (day): fill #0C483E.
- Instances: S1 on 청평화 1층; S3 riding the round; S5 riding the dawn route and inking from lamp to ink as it crosses the horizon; S6 tear grip; S7 seam handle; S9 film mask origin; S10 the submit button's trailing circle; S11 the full stop. Each section starts its dot where the previous section's dot ended on screen whenever they are adjacent (match cut).
- The dot never idles, pulses or loops.

### 4.7 Device (phone frame)
- CSS frame, no image: bezel #101010 with a 1px rgba(255,255,255,0.08) inner highlight, outer radius 56px at a 320px screen width (scale radii with width), screen radius 44px.
- Screen aspect 1320:2868 (footage 1080:2346 and 720:1564 are the same ratio).
- Dynamic Island drawn as a black pill at the capture geometry: width 29.24%, height 4.18%, left 35.45%, top 1.32% of the screen (386x120 at 468,38 on 1320x2868).
- Status bar 9:41 is part of the media and is only ever shown at story time 09:41 or later (S7, S8).

### 4.8 The market map
- Schematic, not to scale, single-stroke isometric drawing on the hairline kernel's pure geometry (Cam(45, 0.5, S), rings, prism, hull) so the map and the cart share one stroke grammar.
- Buildings as rounded prisms (silhouette plus one crease, no vertical corner lines) with at most four floor ticks each: APM (tall, west of the avenue), 청평화 (long and low on the north bank), 디오트 (medium, east), 남평화 (low, south bank). The 청계천 is two thin parallel lines; one avenue and one north road as single dim lines.
- Plates filled with the ground colour (#07231C) for honest occlusion; strokes 1px with vector-effect non-scaling-stroke.
- Two layers: base (dim strokes) and record (mint silhouettes and floor ticks plus door marks).
- Labels are DOM, never inside the SVG: 디오트, 청평화, 남평화, APM.
- Generated at build time into JSON per view (hero-desktop, hero-mobile) with path lengths, label anchors, door points, footprints, camera parameters and the round route.

---

## 5. Persistent chrome

### 5.1 Nav
- Fixed floating pill, single line, height 56px, top 16px, centred, max-width 960px.
- Contents: ㅅㅊ symbol (40px wide, #111111, on a paper plate at night) + 사입삼춘 (700, 17px) | 흐름 · 역할 · 신뢰 · 영상 (400, 15px; separated by space, not dots) | CTA 사전 신청 (pill, 40px tall, trailing circle).
- Phase-aware colours via html[data-phase] with 700ms transitions.
- Mobile: symbol + 사입삼춘 on the left, 사전 신청 on the right; links hidden (no hamburger).
- Accessibility: header landmark, nav aria-label 페이지 이동, links with visible focus rings.

### 5.2 Record column (min 1280px)
- aside aria-label 업무 기록, fixed right. Top: the rail, an ordered list of record entries, newest at the bottom like the app chat, older entries clipped under a 48px top fade mask (about six visible). Foot: the record plate.
- Record card [app format]: meta 업무 기록 · 03:06 (13px #636363), title (15px/700 ink), optional detail line (14px #2D2D2D), figma_chevron at right (16px #808080). Paper #F5F4EE, radius 24, padding 14px 16px, gap 8px. Cards are buttons: activating one scrolls (Lenis) to the section where it happened.
- Message bubble [app style]: #D7D7D7 with ink 14px text, radius 20, time 03:07 below in 12px (#B6D7C2 at night, #636363 by day).
- Visitor entries: same card; the sample answer carries a chip 예시; the signup entry uses meta 신청 기록 · HH:MM.
- Draft entry (signup section only): dashed 1px outline card that mirrors the form as the visitor types (see S10).
- Entry motion: new entries spring in from y+16 with opacity 0 to 1 over 700ms on the snap curve; existing entries shift up. Removed entries (reverse scroll) fade out over 240ms. Records that move the ledger (r0306, r0553a, r0849) get a 1px --accent-live outline that fades over 1.2s; cardigan records and bubbles never do.
- Modes: open, spine (56px strip with a vertical hairline and one 6px dot per entry; hover or focus peeks the rail for 2.4s), hidden, pill (업무 기록 n, opens the sheet). Mode changes are 700ms transforms, never layout.
- Live region: announces the newest entry title, debounced 800ms, only when entries are added.

### 5.3 Record plate
- Paper card, radius 24, padding 16px 20px, always #F5F4EE and ink.
- Row 1: split-flap clock HH:MM (React Bits SplitFlapText, restyled: Paperlogy 700 28px, flat paper tiles, 1px #D7D7D7 split line, no gradients or shadows) and the status chip (outlined ink pill, 12px): 진행 중, 답변 필요, or 미송 대기. In the signup section the clock shows the visitor's local time with the label 지금.
- Row 2: 와이드 데님 팬츠 · 연청 · 27 (13px #636363).
- Row 3: ledger cells 요청 6 ≥ 확보 2 ≥ 전달 2 ≥ 수령 2, then a gap and 남은 미송 4 (or 미확인 6 before 03:06). Labels 11px #636363 above numbers 22px/700 with unit 장.
- Numbers roll over 300ms (out-expo) in fixed digit cells; the ≥ glyphs (13px #BFBFBF) flash to #0C483E for 600ms after any change, showing the check still holds.
- Tooltips on each label (hover and keyboard focus, 13px, paper on ink): 요청 소매업자가 요청한 수량이에요. 확보 사입삼촌이 실제로 챙긴 누적 수량이에요. 전달 실제로 넘긴 누적 수량이에요. 수령 소매업자가 받은 것으로 확인한 수량이에요. 남은 미송 아직 못 챙겨서 재확인일에 다시 확인할 수량이에요. 미확인 사입삼촌이 아직 결과를 공유하지 않은 수량이에요.
- Compact (1024-1279px and in roles): clock + three numbers on one line, bottom-right, 280px wide.
- Visually hidden summary for screen readers: 와이드 데님 팬츠 기록: 요청 6장, 확보 2장, 전달 2장, 수령 2장, 남은 미송 4장.

### 5.4 Mobile record pill and sheet (below 1024px)
- Fixed bottom centre, above the safe area, 48px tall pill: clock, 확보 n · 남은 미송 n, and 기록 n. Paper in both phases.
- Tap opens a native dialog bottom sheet (focus-trapped, Esc and swipe-down close) with the full plate and the rail list.
- Hidden in trust, film, signup and footer, and in the hero until the hero CTAs leave the viewport.

### 5.5 Phase sync
- A client component writes html[data-phase] (night or day) and updates meta theme-color (#07231C night, #EDECE3 day) whenever the current beat's phase changes. The page starts with data-phase night in SSR.

---

## 6. Motion system

### 6.1 Engines and boundaries
- GSAP 3.15 + ScrollTrigger owns every pin, scrub, text split and dot path. Plugins loaded per section: DrawSVG (hero, route, roles), SplitText (words, footer), ScrambleText (words), MotionPath (route, dawn), Flip (words), Draggable + Inertia (roles).
- Lenis 1.3 owns scroll (foundation provider: autoRaf false, gsap.ticker drives lenis.raf, syncTouch false).
- Motion 14 (motion/react) only inside isolated leaves: TearTicket (S6), the proposal leaf (S8), the form (S10). Never in a GSAP tree; GSAP never animates an element Motion animates.
- matter-js only in S2. ogl only in S5 desktop. The hairline kernel owns its own loop in S4.
- No window scroll listeners, no React state for continuous values: pointer and scroll write CSS variables or gsap.quickTo.

### 6.2 Tokens (mirrored in src/lib/motion.ts and globals.css)
- record (any discrete state change: captions, badges, entries, label swaps, seam snap): 700ms cubic-bezier(.32,.72,0,1) (foundation snap).
- follow (continuous pointer input): spring k100 c18 m1; in GSAP gsap.quickTo 0.45s power3.out; in Motion useSpring stiffness 100 damping 18.
- roll (numbers): 300ms cubic-bezier(.16,1,.3,1), digit cells.
- flap: SplitFlapText 60ms per step.
- drop (dot landing): 420ms power2.in, squash 90ms (scaleX 1.3, scaleY 0.7), settle 380ms cubic-bezier(.34,1.56,.64,1).
- reveal (text lines): SplitText line masks yPercent 105 to 0, 700ms snap, stagger 60ms, once per direction.
- micro (press feedback): 160ms, scale 0.98.
- Scrubs use ease none with scrub 0.6 to 1. Nothing else is linear.

### 6.3 Scroll conventions
- Every animated section uses gsap.matchMedia with three branches: desktopMotion '(min-width: 1024px) and (prefers-reduced-motion: no-preference)', mobileMotion '(max-width: 1023px) and (prefers-reduced-motion: no-preference)', reduced '(prefers-reduced-motion: reduce)'.
- Pins only in desktopMotion. Pinned element is an inner plain div; the section element itself is never transformed.
- After any lazy island mounts, call the shared requestScrollRefresh() (debounced 120ms ScrollTrigger.refresh()). Also refresh after document.fonts.ready.
- Deep links (#signup, #film) on load: after the first refresh, re-scroll to the hash target with Lenis immediate.

### 6.4 Motivation ledger (one sentence each; anything without one is cut)
- Map draw-in: the market lights up where the story starts.
- Lens: there is a record under the market.
- Hero dive: we go into 청평화, where this request lives.
- Pile and re-cut: every ambiguous phrase has one explicit action in the app.
- Route and dot: the request physically moves between buildings.
- Ledger roll on cards only: records change numbers, messages do not.
- Cart split: 확보 and 미송 are a split of the same six.
- Dawn: delivery happens across the night into the morning.
- Tear: receipt is the shop's own act.
- Seam: one record, two people's to-dos.
- Refusing steppers: the numbers cannot contradict each other.
- Proposal replay: a change counts only when the other side confirms.
- Mask from the dot: the film's hero object is the page's dot.
- Draft card in the log: your request is written in the same record.
- Dot as the full stop: the story ends where the film ends.
Banned: marquees, idle loops, parallax for its own sake, scroll cues, custom cursors, fade-up on every element.

### 6.5 Reduced motion (a separate, tested experience)
- Lenis is never created (foundation). No pins, no scrubs, no physics, no WebGL, no Flip, no flaps, no shake.
- Sections render their final composed state. Sections report their final beat when 50% visible.
- Videos show posters with a play button; nothing autoplays.
- The hairline figure lands instantly and never tours; its stepper still works.
- The tear stub is a button; the seam is a static 50/50 split; the lens is replaced by building buttons.

### 6.6 Low-power heuristic
- lowPower = navigator.connection.saveData, or hardwareConcurrency 4 or less, or deviceMemory 4 or less.
- lowPower: no ogl sky (CSS gradient), physics bodies halved, map rotateX removed, video autoplay off (posters with play).

---

## 7. Sections

### S1 · hero · 22:00 청평화의 밤
Purpose: show the world (one night of the market) and the promise, with a real record above the fold.

Layout (desktop):
- Section background #07231C, min-height 100dvh. A frame inset 20px, radius 24px, 1px rgba(242,255,232,0.12) border holds the map.
- Map (hero-desktop view) fills the frame; 청평화 sits at about 44% x, 46% y of the stage area (stage = frame minus the record column at min 1280px).
- Text block bottom-left (left 64px, bottom 64px, max-width 640px): H1, sub, CTAs.
- The two record cards r2005 and r2031 float just above-right of the 청평화 building (proxies, see interaction).
- The dot (lamp) sits on 청평화 1층.
- Uncle chip on the avenue north end: 동대문 박삼촌 with the chip 업무 중 · 요청 마감 23:30 [app].
- Honesty line inside the frame, bottom-right of the stage area, 12px #B6D7C2.

Copy:
- H1 (2 lines): 사입 요청부터 상품 수령까지 / 함께 기록해요. [app one-liner]
- Sub: 밤사이 오간 요청, 확보, 미송, 전달을 소매업자와 사입삼촌이 같은 숫자로 확인해요.
- CTA primary: 사전 신청. CTA secondary: 영상 보기.
- Building labels: 디오트, 청평화, 남평화, APM.
- Uncle chip: 동대문 박삼촌 / 업무 중 · 요청 마감 23:30
- Honesty: 지도 속 거래처와 수량은 데모 데이터예요.
- Lens readouts [app list format, seeded demo data]:
  - 청평화: 데님하우스 · 청평화 1층 가-17 / 와이드 데님 팬츠 · 연청 · 27 / 망원 셀렉트샵 · 요청 6장 / 진행 중
  - APM: 니트공방 · APM 럭스 4층 413 / 코튼 크롭 가디건 · 오트밀 · FREE / 망원 셀렉트샵 · 요청 8장 / 진행 중
  - 남평화: 백스토리 · 남평화 3층 12호 / 캔버스 토트백 · 내추럴 / 성수 오브젝트 · 요청 15장 / 확인 대기
  - 디오트: 베이직랩 · 디오트 1층 A-03 / 골지 반팔 티셔츠 · 화이트 · FREE / 망원 셀렉트샵 · 요청 20장 / 완료
- Record cards: 업무 기록 · 20:05 / 새 사입 요청을 보냈어요; 업무 기록 · 20:31 / 요청을 수락했어요 [app]

Interaction:
- Load: H1, sub and CTAs are server-rendered and painted immediately with no entrance animation (LCP). The map is server-rendered fully drawn.
- Draw-in (desktopMotion and not lowPower only): an inline head script adds html.js-draw before first paint; map strokes start hidden via stroke-dasharray/dashoffset from precomputed lengths. After hydration on idle (300ms timeout), DrawSVG 0 to 100% over 900ms on the snap curve, staggered by world distance from 청평화 at 40ms per 10 units; floor ticks fade in last (300ms); record cards spring in from y+16 (700ms, 120ms apart); the dot scales 0 to 1 (400ms).
- Lens (desktop, pointer fine): a 200px circle (1px mint ring at 50%, inner 8px grid at 6% mint) follows the pointer within the stage area via gsap.quickTo (0.45s power3.out) writing --lx and --ly. The record layer (second SVG) is revealed through mask-image radial-gradient(circle 100px at var(--lx) var(--ly), #000 98%, transparent 100%). The picked building comes from unprojecting the pointer onto the ground plane and testing rest footprints (never moving geometry); nearest within 12 world units, else none. The readout card (paper, radius 24, 4 lines) sits 24px right of the lens and swaps with the record clock (700ms, 8px slide). Rest state: the lens sits on 청평화 showing the denim record; when the pointer leaves the stage the lens glides back to 청평화 (700ms). Building labels are buttons: click or focus moves the lens there.
- Dive (pin +=100vh, scrub 0.6): 0-60% frame clip-path inset(20px round 24px) to inset(0 round 0); map wrapper scale 1 to 1.6 and rotateX 0 to 10deg (perspective 1200px, transform-origin at 청평화's projected point; no rotateX on lowPower); base-layer buildings other than 청평화 fade to 35%. 0-40% text block y 0 to -64 and opacity 1 to 0. 0-10% lens fades out. 20-70% record card proxies tween from their hero positions to the rail slots measured at refresh (min 1280px); between 1024 and 1279px they fade out. At the end of the pin, proxies hide and the rail's own entries show at identical positions (proxy swap); reverse scroll swaps back.
- Story: reports b2200 throughout.

Mobile (below 768px):
- Frame inset 12px, radius 20px; map hero-mobile view (cropped to 청평화 and APM) occupying 46dvh.
- Below the map: a chip row 디오트 / 청평화 / 남평화 / APM (role radiogroup) that moves a static lens and swaps the readout (700ms). Default 청평화.
- H1 at 30px on 3 lines (사입 요청부터 / 상품 수령까지 / 함께 기록해요.), sub 15px, primary CTA full-width pill, secondary as a text link. All visible without scrolling at 390x844.
- No pin, no record cards (they are in the pill and sheet), honesty line 11px inside the map frame bottom-left.

Reduced motion: no draw-in, no dive, no lens follow; lens static on the selected building, building buttons and chips switch it.

Assets: generated map JSON (S1/S2/S3 views); app icons; brand symbol public/brand/saip-samchun-symbol.svg.
References: San Rita https://sanrita.ca (framed map that dives, scanner lens; .context/research/webzibition/sheets/san-rita2.jpg); 나인원랩스 (one frame unifies scenes; .context/research/gdweb/gallery-nineonelabs-0.jpg); Flagship https://www.flagship.ai (real UI pinned to a drawn place; .context/research/supahero/shots/flagship--01-load.jpg); Codrops ScrollMap.
Acceptance:
- LCP element is the H1; no layout shift when fonts swap (CLS under 0.05).
- At 1440x900 the H1 is 2 lines, CTAs visible, the map composition leaves the record column area free of buildings.
- Moving the pointer over 청평화 shows the denim readout within 700ms; leaving returns the lens to 청평화.
- Tab reaches the four building buttons and moves the lens; Enter on 사전 신청 scrolls to #signup.
- Scrolling down and back up returns proxies and rail entries to identical positions (no duplicates).
- 390x844: H1 3 lines, CTA above the fold, chips switch the readout.

### S2 · words · 23:30 요청 마감
Purpose: the problem. Loose talk is not a record; each ambiguous phrase has one explicit action in the app.

Layout (desktop): night plate #07231C; behind it a static dimmed map (hero-desktop view at 25% opacity, transformed exactly like the hero's end state) so the cut from S1 is continuous. H2 top-left in the stage area; the pit occupies the lower 62% of the stage; after the re-cut, a two-column ledger replaces the pit.
Copy:
- H2 (karaoke fill): ‘확인했어요’는 수락이 아니에요.
- Body: 채팅 한마디가 수락이나 수령으로 오해되지 않게, 사입삼춘은 수락, 전달, 수령 확인을 서로 다른 버튼으로 기록해요.
- Caption under the pit: 예시 대화예요.
- Phrase bubbles (app 'theirs' bubble style): ‘확인했어요’, ‘3장 보냈어요’, ‘2장밖에 안 왔는데요’, ‘남은 건 언제 와요?’, ‘그거 바꾸기로 했잖아요’, ‘…’ (an empty bubble meaning no reply).
- Vocabulary pills (outlined mint) with glossary shown while held or focused:
  - 누적 확보: 사입삼촌이 지금까지 실제로 챙긴 수량이에요.
  - 전달 대기: 확보했지만 아직 넘기지 않은 수량이에요.
  - 남은 미송: 아직 못 챙겨서 다시 확인할 수량이에요.
  - 재확인일: 미송을 다시 확인하기로 한 날이에요.
  - 회차: 한 요청을 나눠서 전달한 차례예요.
  - 처리 이력: 누가 언제 무엇을 바꿨는지 전후가 함께 남아요.
- Ledger (left phrase dimmed, right the real control or record [app]):
  1. ‘확인했어요’ → 요청 수락 (action token)
  2. ‘3장 보냈어요’ → 실제 전달한 수량 기록 (action token)
  3. ‘2장밖에 안 왔는데요’ → 상품이나 수량이 달라요 (record token)
  4. ‘남은 건 언제 와요?’ → 2026-10-13 미송 재확인 (record token)
  5. ‘그거 바꾸기로 했잖아요’ → 상대방에게 확인 요청 (action token)
  6. ‘…’ → 미송 4장 기다리기 확정 (action token), annotation under the row: 답이 없다고 동의한 게 아니에요.
- Closing line: 대화는 대화로 남고, 업무는 버튼으로 기록돼요.
Token styles: action token = full pill, mint #F2FFE8 fill, #07231C text, 700; record token = full pill, 1.5px mint outline, mint text.
Interaction (desktop pin +=120vh, scrub 0.8):
- Enter (section within one viewport): dynamic-import matter-js. 12 DOM bodies (6 bubbles, 6 pills) fall in two waves 250ms apart; gravity y 1.1, restitution 0.25, friction 0.5, frictionAir 0.02, chamfer = half height, start angle within plus or minus 25deg; enableSleeping; DOM transforms written in afterUpdate (translate3d + rotate). Physics runs in real time, not scrubbed. Runner stops when the section leaves the viewport.
- MouseConstraint (pointer fine only, stiffness 0.2): grab and throw; remove its wheel listeners so Lenis keeps scrolling; native cursor stays.
- 0-35%: H2 SplitText chars fill from rgba(237,236,227,0.2) to #EDECE3.
- 40%: freeze (Body.setStatic on all), record each body's pose.
- 40-50%: vocabulary pills drop out (y +24, opacity 0, stagger 40ms).
- 50-85%: each phrase bubble tweens from its recorded pose to the right-column slot (rotation to 0) while a dim copy of its phrase fades in at the left slot; at 70% of each flight ScrambleText (Hangul charset 사입삼촌확보미송전달수령요청, 600ms) turns the phrase into the token label and the skin crossfades from bubble grey to the token style; a 1px mint connector draws left to right (DrawSVG).
- 85-100%: closing line fades in. Reverse scrub replays exactly; scrubbing back below 40% returns pills to recorded poses (no physics restart). Scrolling above the section resets to the pre-fall state so re-entry replays the fall.
- Story: reports b2330.
Mobile: no pin; 70vh pit with 8 bodies (6 bubbles, 2 pills: 누적 확보, 재확인일), no MouseConstraint (touch never captured); physics runs once on entry. Below the pit, the ledger list (phrase above, token below) reveals on view (line masks).
Reduced motion: no physics; bubbles and pills sit in a hand-composed static heap (percent coordinates in copy data); the ledger list is static; H2 fully inked.
Assets: none raster; DOM only.
References: 리커너스 https://www.reconers.com (DOM physics pile of Korean pills; .context/research/gdweb/reconers-f-v6.jpg); 네이버 한글한글 아름답게 (fill instead of fade; .context/research/gdweb/naver-hangeul-d-v2.jpg); Lusion (pile the pointer shoves; .context/research/refero/video-lusion-sheet.jpg); Copilot (chips that become real structure).
Acceptance:
- 60fps on a 2020 MacBook Air with 12 bodies; runner stops off-screen (verified via a paused counter).
- Fast reverse scroll through the pin never leaves a pill stranded mid-flight.
- Screen readers get the ledger as a list (the falling pills are aria-hidden duplicates).
- Mobile vertical scrolling over the pit is never blocked.

### S3 · route · 02:16 → 03:06 상가를 도는 밤
Purpose: the round. 확보 is recorded as it happens, per request; the ledger moves on records, not on messages.

Layout (desktop): pinned stage on the hero-desktop map geometry with the round route; the camera starts at the S2 end state (scale 1.6 on 청평화) and eases to the round framing (scale 1.0 on APM and 청평화) in the first 15%. Captions bottom-left (subtitle size). Record column at right receives entries.
Copy:
- H2 (top-left, line mask reveal at entry): 상가를 돌며, 확보한 만큼 기록해요.
- Stop A caption: ‘밤 10시부터 새벽 5시까지 픽업해요.’ attributed 동대문 박삼촌 프로필, second line 초대 코드를 주고받으면 요청과 대화를 시작할 수 있어요. [app]
- Stop B: time 02:16, place 니트공방 · APM 럭스 4층 413, map tag 확보 5 · 미송 3, caption 요청마다 숫자가 따로 쌓여요.
- Stop C: time 03:06, place 데님하우스 · 청평화 1층 가-17, map tag 확보 2 · 미송 4, caption 이번에 추가로 확보한 수량을 더해서 공유해요.
- Stop D: time 03:07, caption 대화는 숫자를 바꾸지 않아요.
Interaction (pin +=180vh, scrub 1):
- The route is a dashed mint line (1.5px, dash 2 6) revealed through an SVG mask whose solid path is DrawSVG-scrubbed; the lamp dot rides the solid path with MotionPathPlugin (ease none within each segment).
- Stops at 0-20% (A), 20-55% (B), 55-85% (C), 85-100% (D). Caption swaps on threshold crossing: the old caption goes to 20% and lifts 24px, the new rises from +24px (700ms snap), reversible.
- Map tags pop at arrival (scale 0.8 to 1 with the overshoot curve, 400ms); APM 4th floor tick and 청평화 1st floor tick take the bright stroke on arrival.
- Beat markers: [0, b2330], [0.32, b0216], [0.66, b0306], [0.90, b0307]. The rail adds r0216 (no ledger change), r0306 (ledger 확보 0→2, 미확인 → 남은 미송 4, status 답변 필요, mint outline), m0307 (no change).
Mobile: no pin; three blocks (02:16, 03:06, 03:07), each with a static crop of the route (hero-mobile view, dot placed at the stop), the time and place, the caption and the record card (or bubble); each block reports its beat when its centre crosses the viewport centre.
Reduced motion: route fully drawn, dot at 청평화, all captions stacked in order, beats reported per block.
Assets: map JSON (round route and stops).
References: Codrops ScrollMap (route draws stop by stop); 쏘카 브랜드 (subtitle-sized Korean over a scrubbed route; .context/research/gdweb/vidsheet-socar-brand.jpg); Madar (one persistent line; .context/research/supahero/sheets/_frames-madar.jpg); .txt rail (.context/research/webzibition/sheets/dottxt-motion.jpg).
Acceptance:
- At 02:16 the plate numbers do not change; at 03:06 확보 rolls to 2 and 남은 미송 shows 4; at 03:07 nothing in the plate changes.
- Scrolling back from 03:07 to 02:16 removes m0307 and r0306 and restores 확보 0.
- Captions are all present in the DOM in order.

### S4 · cart · 03:06 확보 2 · 미송 4
Purpose: make the split physical. Six bags; two secured, four still owed with a date. Exploring is not recording.

Layout (desktop, unpinned): night plate #093A32 (equals the hairline plate). H2 and body top-left (cols 1-6 of the stage). Below: mint card (left, about 240px), the figure stage (centre, 5:4 box about 480px wide), the home card (right, about 240px). Read-out under the figure, the stepper under the read-out.
Copy:
- H2: 확보는 확보대로, 미송은 날짜와 함께.
- Body: 찾은 만큼 먼저 확보로 기록하고, 남은 수량은 재확인일과 사유를 붙여 미송으로 남겨요. 재확인일이 지나면 사입삼촌의 알림함에 ‘미송을 재확인해 주세요’가 떠요.
- Read-out (rest): 확보 2 · 미송 4, sub-line 요청 6장.
- Exploring note (grey): 미리 보기예요. 기록은 확보 2 · 미송 4 그대로예요.
- Figure caption: 손수레 위 봉투는 확보, 걸린 봉투는 아직 미송이에요.
- Mint card [app]: 2026-10-13 미송 재확인 / 확보한 상품은 먼저 전달할 수 있어요. 남은 미송의 처리 방법을 답변해 주세요.
- Home card [app]: 다음 미송 재확인 / 2026-10-13 / 와이드 데님 팬츠 / 남은 미송 4장 (while exploring, the last line turns grey and shows 남은 미송 n장).
- Stepper label: 확보 수량 미리 보기 (− n +).
Interaction: the hairline figure (section 8). Pointer height sets the cut; bags change state with 700ms staggered tweens; the read-out and the home card follow in grey and return to ink at rest. The record plate never changes here. Tour plays once on desktop at 50% visibility when no pointer is present. Stepper drives the same unseen pointer.
Story: reports b0307.
Mobile: H2, body, figure full width, stepper, read-out, the two cards stacked; tour plays once on first view.
Reduced motion: rest pose, no tour, stepper works with instant landing.
Assets: src/vendor/hairline/kernel.mjs, src/vendor/hairline/figures/cart.js.
References: hairline (https://hairline.lucasmarkes.com, lab notes lucasmarkes.com/lab/hairline; .context/research/toolkit/screens/scratch-hairline.png); Zipline (payload on a tether).
Acceptance: section 8 acceptance; read-out text matches the figure on every settle; plate shows 확보 2 · 남은 미송 4 throughout.

### S5 · dawn · 05:53 새벽 전달, 밤에서 아침으로
Purpose: delivery in 회차, and the page's one theme switch, motivated by the 사입 day cycle.

Layout (desktop): full-viewport chamber. Background: ogl full-screen quad. Left third: the paper confirm card. A horizontal route from the left edge (청평화) to the destination node at right. Bottom: the record ruler with a fixed centre playhead.
Copy:
- H2 (top-left, appears at 0%): 전달은 회차로 기록해요.
- Body: 실제로 물품을 전달한 뒤 전달한 수량만 기록해요. 같은 배송지로 가는 요청은 한 번에 기록하고, 남은 수량은 전달할 목록에 유지돼요.
- Confirm card (paper object, real string format, seeded numbers): 물품을 전달했나요? / 2개 요청, 총 7개 전달을 기록해요. 소매업자의 수령 확인은 별도로 진행돼요. / buttons 취소 and 확인 [app].
- Destination node: 망원 셀렉트샵 / 서울 마포구 포은로 82 1층 / 오전 11시 오픈 전 매장 앞 보관함 (demo profile note).
- Ruler: hour ticks 20 to 11 with labels at 20, 22, 00, 02, 04, 06, 08, 10; event marks 20:05, 20:31, 02:16, 03:06; active slot 1차 · 05:53 with 2장; at the right end a dashed slot 다음 회차 with 남은 미송 4장.
Interaction (pin +=120vh, scrub 1):
- Sky: ogl fragment shader, uniform uProgress from the pin; vertical ramp #07231C → #093A32 → #0C483E → #B6D7C2 → #F2FFE8 → #EDECE3 with the horizon band rising as progress grows; 4x4 ordered (Bayer) dither of plus or minus 1/255 to prevent banding; DPR capped at 1.5; requestAnimationFrame only while the pin is active (ScrollTrigger onToggle), cancelled off-screen; lazy-loaded when S4 enters; static CSS gradient fallback under lowPower, no WebGL, or context loss.
- 0-30%: the confirm card rises (y 24 to 0); 확인 shows its pressed state at 25%; at 30% the card compresses into the ruler's 1차 slot (scale and translate, 700ms snap, reversible). Beat b0553: rail adds r0553a (mint outline, 전달 0→2) and r0553b.
- 30-70%: the dot rides the route west to the destination (MotionPath); as it crosses the horizon line (about 55%) its fill tweens lamp to ink.
- 62%: beat b0553d: html[data-phase] flips to day; nav and chrome transition over 700ms; grain fades in. Record surfaces do not change.
- Ruler translates with progress so 05:53 sits under the playhead at 30%; the active slot scales 1 to 1.25.
- 70-100%: sky lands on #EDECE3; the destination node and the dashed 다음 회차 slot stay.
- Beat markers: [0, b0307], [0.30, b0553], [0.62, b0553d].
Mobile: no pin, no WebGL; a 160vh CSS gradient band (same stops) with grain; the route is a vertical line along the left edge; the dot descends with CSS animation-timeline view() (IntersectionObserver fallback stepping it at 25/50/75%); the card and a two-slot horizontal scroll-snap ruler stack; the phase flips when the band's middle crosses the viewport centre, with a 600ms crossfade.
Reduced motion: two static bands (night band with the card, day band with the destination node) split by a horizon rule; instant phase flip.
Assets: shader as a TypeScript template string (no loader).
References: United Carriers (atmosphere dive into a light section; .context/research/webzibition/frames/united-carriers-f2.jpg); THE LOOKBACK (tick ruler with a fixed playhead; .context/research/webzibition/sheets/lookback-b.jpg); End Speciesism (vehicle narrator).
Acceptance:
- data-phase is night above 62% of the pin and day below, both directions.
- The plate keeps identical pixels across the flip (screenshot diff of the plate region before and after the flip is 0 except for changed digits).
- WebGL loop count is zero when the section is off-screen.
- Mid-switch contrast check at 62% passes AA for nav text.

### S6 · receipt · 08:49 이번에 받은 2장이 맞나요?
Purpose: delivery is not receipt until the shop confirms; a difference opens a problem.

Layout (desktop, unpinned): paper slip in cols 1-5 of the stage, tilted; H2 and body in cols 6-9, vertically centred against the slip.
Copy:
- H2: 전달과 수령은 따로 확인해요.
- Body: 사입삼촌이 전달을 기록해도, 소매업자가 받은 수량을 직접 확인해야 수령으로 남아요. 수량이 다르면 바로 문제로 열려요.
- Slip [app strings, denim numbers]: title 상품 수령 확인; heading 이번에 받은 2장이 맞나요?; card 동대문 박삼촌 · 와이드 데님 팬츠 / 연청 · 27 · 전체 받을 수량 6장; section 전달 회차 with one row in two columns: 1차 · 10월 11일 05:53 | 2장 · 이번 확인; rows 누적 전달 2장 and 남은 미송 4장; mint card 상품·옵션·수량을 비교해 주세요 / 이번 전달분만 확인해요. 남은 미송과 다른 전달분은 계속 확인할 수 있어요.; row link 상품이나 수량이 달라요; stub CTA 2장 수령 확인.
- After tearing: badge 수령 확인 (weak green) on the slip.
- What-if panel (opened by 상품이나 수량이 달라요): label 예시예요. 실제 기록에는 남지 않아요.; field 실제 받은 수량 (stepper 0-2); when below 2: helper 수량 차이 설명 (일치하면 선택), the ghost record (dashed card) 수령 수량 차이를 알렸어요: 실제 1개 · 기록 2개 [app format], the issue line 문제 확인 중 → 조치 완료 · 해결 확인 대기 → 해결 확인 [app labels] with 해결은 소매업자만 확인할 수 있어요., note 차이를 해결하기 전에는 요청이 완료되지 않아요.; button 돌아가기.
Interaction:
- Entrance (scroll-linked, no pin, desktopMotion): over the slip's entry (its top from 100% to 40% of the viewport) the slip rotates -3deg to 0 and rises 12vh to 0.
- Tear: React Bits TearTicket (restyled: background #F5F4EE, ink text, perforation #D7D7D7, horizontal stub on the right). Drag the stub past 60% of its width or press its button. On tear: badge pops (scale 0.8 to 1, 400ms), the section reports b0849 (rail adds r0849, plate 수령 0→2 with mint outline, clock 08:49).
- Auto-tear: if the slip's bottom leaves the top of the viewport untorn, the same tear plays (900ms) so scroll-only readers keep a true story.
- Reset: when the section's top goes below the viewport bottom (scrolled back above it), the stub resets untorn and the section reports b0553d.
- The dot (ink) is the grip at the perforation's left end.
- What-if panel: Motion layout + AnimatePresence (700ms snap); never touches the store.
- GSAP animates only the outer wrapper; TearTicket and the panel are a separate Motion client leaf.
Mobile: no tilt, full-width slip; tear by horizontal swipe on the stub (stub touch-action pan-x, slip pan-y) and a visible button inside the stub; auto-tear on leave.
Reduced motion: no tilt or slide; the stub is a normal button; badge and plate update instantly.
Assets: src/components/rb/TearTicket.tsx (copied from .context/scratch-toolkit/src/components/TearTicket.tsx).
References: Grail (paper sheet slides up tilted and straightens; .context/research/webzibition/sheets/grail-motion.jpg); React Bits TearTicket (verified with Korean); Andre Font (hand-cut paper plates).
Acceptance: tear by drag, by button and by keyboard (Enter on the stub button) all report b0849 once; reverse scroll resets; the what-if panel never adds a rail entry.

### S7 · roles · 09:41 같은 요청, 각자의 할 일
Purpose: role duality with real screens. The 9:41 status bars appear only now, when the story clock reaches 09:41.

Layout (desktop, unpinned): H2 and body top (cols 1-7); a device row centred: two devices (screen width 300px at 1440) separated by a seam handle; role labels above each device; footnote below.
Copy:
- H2: 같은 요청, 각자의 할 일.
- Body: 같은 와이드 데님 팬츠가 소매업자 홈에는 ‘다음 미송 재확인’으로, 사입삼촌 홈에는 ‘상대방 확인 대기’로 보여요. 기록은 하나, 할 일은 각자예요.
- Left label: 소매업자 / 사입을 요청하고 받은 상품을 확인해요. [app] ; device caption 망원 셀렉트샵의 홈; play button 기록 열어 보기.
- Right label: 사입삼촌 / 요청을 받아 상품을 확보하고 전달해요. [app] ; device caption 동대문 박삼촌의 홈; play button 홈 화면 재생.
- Pause label: 멈춤.
- Footnote: 초대 코드로 연결한 거래처끼리만 요청과 대화를 주고받아요. 역할은 가입할 때 한 번 고르고, 가입 후 역할 변경은 제공하지 않아요.
- Media caption: 실제 앱 화면이에요. 데모 데이터로 촬영했어요.
- Seam slider aria-label: 소매업자 화면과 사입삼촌 화면 나누기. Mobile toggle: 소매업자 / 사입삼촌.
Interaction:
- Devices show stills: retailer 04-home-scroll (다음 미송 재확인 card visible), uncle 10-uncle-home (상대방 확인 대기 card visible).
- On entry: DrawSVG draws a 1.5px #0C483E rounded outline around the denim card on each device (800ms): retailer box x 2.7%-97.3%, y 38.8%-56.3% of the screen; uncle box x 2.7%-97.3%, y 66.9%-86.1%; then a 1px dashed #0C483E connector across the seam joins the two boxes.
- Seam: GSAP Draggable type x, bounds 25%-75% of the row, InertiaPlugin; the ink dot is the handle (44px hit area). Each device's clip-path inset follows the seam; each label's opacity follows its side's share. Keyboard: role slider, arrows 5%, Home/End to bounds, aria-valuenow in percent with aria-valuetext 소매업자 화면 n퍼센트.
- Play: 기록 열어 보기 plays retailerDenimDetail (03-request-detail, 17.6s: home → 사입 tab → denim detail → 처리 이력); 홈 화면 재생 plays uncleHome (05-uncle-home, 16.7s). Crossfade still to video (300ms); at the end, crossfade back to the still. Media manager allows one video at a time.
- Chrome: rail spine, compact plate. Story: b0941.
Mobile: segmented control (radiogroup) with the dot as the moving thumb; one device at 86vw (max 360px); switching crossfades devices (700ms snap) and redraws the outline; play buttons under the device.
Reduced motion: devices side by side (desktop) or stacked (mobile), outlines static, no seam drag, play on demand only.
Assets: stills retailer-home-0941, uncle-home-0941; clips retailer-denim-detail, uncle-home (section 11).
References: NITEX (50/50 demand vs supply; .context/research/supahero/sheets/_frames-nitex.jpg); basement.studio (persona view); Light in the Darkness (one switch relights a scene; .context/research/supahero/shots/light-in-the-darkness--x-toggle-evil.jpg); 토스 브랜드 스토리.
Acceptance: outlines land on the denim cards at 1440 and 390 widths (within 4px); keyboard slider works; only one video plays at a time; videos pause below 25% visibility.

### S8 · trust · 같은 숫자를 함께 봐요
Purpose: the trust mechanics, made testable: invariants, proposals that need the other side, history, guardrails.

Layout (desktop, unpinned, day). Four rows:
1. H2 + lead (cols 1-6), then the equation row spanning 12 columns.
2. Proposal block (cols 1-7, paper sheet) | chat device (cols 8-12).
3. 처리 이력 strip (full width).
4. Proof index 2x2 (typographic, whitespace only, no cards, no rules).
Copy:
- H2: 같은 숫자를 함께 봐요.
- Lead: 앱과 서버가 숫자를 함께 확인해요. 받은 수량이 전달보다, 전달이 확보보다 많아질 수 없어요.
- Context line: 와이드 데님 팬츠 · 연청 · 27 · 요청 6장 · 남은 미송 n장
- Equation: 수령 2 ≤ 전달 2 ≤ 확보 2; role tags under numerals: 소매업자가 확인 (수령), 사입삼촌이 기록 (전달, 확보); stepper labels 수령 확인, 누적 전달, 누적 확보 [app].
- Sample label: 예시예요. 이 페이지 안에서만 바뀌어요. Reset link: 기록한 숫자로 되돌리기.
- Refusals [app]:
  - 확보 + beyond 요청 6: 확보·전달·수령·취소 수량을 다시 확인해 주세요.
  - 확보 −: 누적 확보 수량을 줄이려면 오류 정정을 이용해 주세요.
  - 전달 + beyond 확보: 전달 가능한 수량을 넘을 수 없어요.
  - 전달 −: 원래 기록과 정정 사유를 남기고 상대방이 확인한 뒤 반영해요.
  - 수령 + beyond 전달: 수령 수량은 전달 수량보다 클 수 없어요.
  - 수령 −: 이미 확인한 전달분이에요. 차이는 문제 알리기를 이용해 주세요.
- Proposal block: H3 취소는 상대가 확인해야 확정돼요.; pane label 망원 셀렉트샵 화면; question 남은 미송 4장을 어떻게 할까요? [app]; rows 확보 완료 2장 / 남은 미송 4장; note 기다리기를 확정하면 사입삼촌에게 답변이 전달돼요. 취소는 상대방과 협의 후 확정돼요. [app]; buttons 미송 4장 기다리기 확정 / 미송 취소 요청 [app].
  - Wait outcome: badge 확정 and the visitor record 업무 기록 · HH:MM / 미송을 기다리기로 했어요 [app] with chip 예시; plate status becomes 미송 대기.
  - Cancel outcome: card 취소 · 상대 확인 대기 [app]; ledger line 요청 6 · 확보 2 · 전달 2 · 수령 2 · 취소 0 [app format]; 이번 취소 수량 4장; 사유·협의할 처리 방법: 남은 미송 4장은 이번에는 받지 않을게요. (예시); proposer button 제안 철회 [app]; disabled confirm with 상대방이 확인해야 확정할 수 있어요. [app]; button 확정되는 과정 보기.
  - Replay (counterpart pane labelled 동대문 박삼촌 화면, buttons 취소 내용 확인·확정 and 제안 거절 [app], non-interactive): the confirm button shows a pressed state, the sheet 협의한 내용을 확정할까요? / 변경 전후 내용과 수량을 확인해 주세요. 확정 후 최신 기록에 반영돼요. [app] appears, status becomes 취소 · 확정, the ledger line rolls 취소 0 → 4, the request status reads 완료 with 요청 처리를 마쳤어요. [app] and the log line 협의한 변경·취소·정정을 확정했어요 [app]. A reset link 처음으로 returns to the question. The replay never writes to the rail.
- Chat device caption: 1:1 대화에는 업무 기록 카드가 메시지와 따로 쌓여요.
- 처리 이력 strip (verified [app] titles and times, oldest left): 10월 10일 20:05 새 사입 요청을 보냈어요 · 10월 10일 20:31 요청을 수락했어요 · 10월 11일 03:06 확보 2개 · 미송 4개 결과를 공유했어요 · 10월 11일 05:53 2개 전달을 기록했어요 · 10월 11일 08:49 2개 수령을 확인했어요 (each as a block on a dashed rule, date and time above, title below; no dots between blocks). Caption: 고친 기록도 덮어쓰지 않고 정정으로 남겨요.
- Proof index:
  - 덮어쓰지 않아요 / ‘다른 작업으로 내용이 변경됐어요. 최신 내용을 확인하고 다시 시도해 주세요.’
  - 두 번 생기지 않아요 / 연결이 끊겨 다시 보내도 같은 요청은 한 번만 남아요. + demo: switch 연결 끊기, button 요청 보내기, counters 보낸 횟수 n / 저장된 요청 m건, error when offline ‘서버에 연결하지 못했어요. 입력을 유지했으니 연결 상태를 확인하고 다시 시도해 주세요.’
  - 혼자 고칠 수 없어요 / ‘다른 계정의 기록을 덮어쓸 수 없어요.’
  - 쓰던 내용이 남아요 / ‘초안은 나만 볼 수 있어요.’ 보내기 전 요청은 입력하는 동안 자동으로 저장돼요.
Interaction:
- Equation numerals roll from 0 to the recorded values on entry (300ms each, 120ms apart). Steppers (56px pill rows, 48px targets): an allowed press rolls the digit; a refused press shakes the value pill on x [0,-6,6,-4,4,0] over 360ms, dims the pressed control to 0.4 for 1.2s, and shows the refusal under it (ink with a 2px #0C483E left rule, y 8 to 0 over 300ms, role alert). The ≤ between two equal values takes the bright stroke (#0C483E) to show a limit reached.
- Proposal block: Motion leaf with a test-first state machine (ask → waiting | cancelPending → replay → completed; 제안 철회 returns to ask). The proposal glyph uses React Bits StatusMark (pending to done, doneColor #0C483E, custom Korean label, size 20).
- Chat device plays chatHistory (09-chat 14.0-27.47s: typing, send, live reply, scroll up through 02:16, 03:06, 03:07, 05:53) when at least 50% visible; poster chat-history-first.
- Idempotency demo: local reducer {online, attempts, saved, opId}; online send → saved 1; offline send → error, attempts +1; retry online with the same opId → saved stays 1.
- Chrome: rail spine, plate hidden, mobile pill hidden. Story: b0941.
Mobile: equation stacks vertically (수령 2 / ≤ / 전달 2 / ≤ / 확보 2) with steppers to the right; proposal block full width; device at 80vw; history as a vertical list; proof index one column.
Reduced motion: no roll or shake; refusals appear instantly; the replay shows its final state with the steps listed; the device shows the poster with a play button.
Assets: clip chat-history; StatusMark copied from .context/scratch-toolkit/src/components/StatusMark.tsx.
References: one-ledger equation board; Heart Aerospace (monumental number; .context/research/refero/heart-sheet.jpg); .txt (log as proof); theverge StoryStream (blocks on a dashed rule); 코어플랫폼 (tokens set in Korean sentences; .context/research/gdweb/gallery-coreplatform-0.jpg).
Acceptance: every refusal string appears for its exact illegal move (unit tests); 완료 appears only via the replay; the replay and the board never write to the rail; the wait choice writes exactly one visitor record (persisted across reload in the same tab).

### S9 · film · 요청부터 수령까지, 영상으로 봐요
Purpose: the promo film, opened by the page's dot.

Layout (desktop): day canvas. Pinned stage: a 16px ink dot at centre; after the reveal, a 16:9 card (86vw, max 1200px) in a double-bezel shell; H2 above-left, controls and chapter ticks below, caption under.
Copy:
- H2: 요청부터 수령까지, 영상으로 봐요.
- Play: 영상 보기 (same label as the hero secondary CTA). Sound: 소리 켜기 / 소리 끄기. Pause: 멈춤.
- Chapter ticks (from the final video/src/timeline.ts MASTER.chapters, number prefixes stripped): 연결 / 요청 / 수락 / 확보 / 미송 / 전달 / 수령 / 기록.
- Caption: 영상 속 화면은 실제 앱 화면이에요. 매장과 상품은 예시 데이터예요.
- Details summary (accessible text): 영상 내용 / 망원 셀렉트샵이 오버핏 셔츠 10장을 요청하고, 동대문 박삼촌이 수락해 7장을 확보해요. 남은 3장은 2026-10-12 미송 재확인으로 남고, 7장 전달과 수령 확인이 1:1 대화에 업무 기록으로 쌓여요.
Interaction (pin +=80vh, scrub 0.6 over 0-70%):
- 0-45%: clip-path circle(8px at centre) to circle(75% at 50% 50%) revealing the muted brand-palette hero loop (green field iso grid), which starts playing at 20% and loops.
- 45-70%: the clip morphs to inset(0 round 24px) at the card size inside the double-bezel shell.
- 영상 보기 swaps the loop for the 16:9 master (preload metadata on hover or focus) and plays with sound (explicit gesture); the sound toggle stays visible. Chapter ticks seek the master to chapter start times and play. Hover or focus on a tick shows its still above it.
- The film pauses below 25% visibility. When the master ends, the frame returns to the loop poster and the play button reads 영상 보기.
- Chrome hidden (rail, plate, pill). Story: b0941.
Mobile: no pin; the 9:16 cut in a 9:16 frame (max-height 86dvh, width min(86vw, 420px)) with the loop's first frame as poster; tap to play inline with sound; a fullscreen button calls webkitEnterFullscreen on iOS.
Reduced motion: no mask, no autoplay; poster (outro frame) with a play button; details summary open by default.
Assets: section 11 film files; only green v2 renders that pass the colour audit.
References: The Romans (media chip expands to full bleed); Renault Le Défilé (film shrinks into a tile; .context/research/supahero/sheets/_frames-renault.jpg); K72 (video pill synced with reel); Cevox reel outro (.context/video-ref/analysis.md).
Acceptance: no orange or lime frame in any shipped film file (audit); play with sound only after a click; chapters seek within 0.5s of their timeline start.

### S10 · signup · 사전 신청과 도입 문의
Purpose: the single conversion intent. Sending a lead mirrors sending a 사입 요청: your record is written in the same log.

Layout (desktop, unpinned, day): H2 and body top-left; the form in a double-bezel paper sheet in cols 1-6 of the stage; at min 1280px the visitor's draft card lives at the bottom of the open rail (record column); between 1024 and 1279px a live record card sits in cols 8-12 beside the form (sticky top 120px).
Copy:
- H2: 사전 신청과 도입 문의를 받아요.
- Body: 역할과 연락처를 남겨 주시면 사입삼춘 소식과 도입 안내를 전해 드릴게요.
- Autosave note [app]: 입력한 정보는 자동으로 저장돼요.
- Role legend [app]: 어떤 일을 하고 계신가요?
- Role cards: 소매업자 / 사입을 요청하고 받은 상품을 확인해요. [app]; 사입삼촌 / 요청을 받아 상품을 확보하고 전달해요. [app]; 기타 / 도입이나 제휴를 문의해요.
- Fields: 이름·담당자명 [app label]; business name label by role: 매장명·쇼핑몰명 (선택) [app] for 소매업자, 활동명·업체명 (선택) [app] for 사입삼촌, 회사·단체명 (선택) for 기타; 연락처 with helper 전화번호나 이메일을 적어 주세요. and a text button 이메일로 입력 / 전화번호로 입력; 사입 시장 (선택) [app] chips 동대문 / 남대문 / 기타; 문의 내용 (선택) with helper 도입 시기, 거래처 수처럼 궁금한 점을 적어 주세요.
- Consent: [필수] 개인정보 수집·이용에 동의해요 + disclosure 자세히 보기: 수집 항목 역할, 이름·담당자명, 매장명·업체명, 연락처, 사입 시장, 문의 내용 / 이용 목적 사전 신청 안내와 도입 문의 답변 / 보유 기간 신청일로부터 1년, 동의를 철회하면 바로 파기해요. (retention text is a launch blocker until the client confirms it; see 16).
- Submit: 사전 신청. Pending: 보내는 중.
- Draft card (rail or side card): meta 신청 기록 · 지금, title 사전 신청 작성 중, lines 역할: … / 매장명·쇼핑몰명: … / 연락처: … / 사입 시장: … ; empty line 역할: 선택 전.
- Success card: meta 신청 기록 · HH:MM (visitor local), title 사전 신청을 보냈어요, line 남겨 주신 연락처로 안내드릴게요.
- Errors: field errors use the foundation's LEAD_MESSAGES (어떤 일을 하고 계신지 선택해 주세요. / 이름을 입력해 주세요. / 연락처를 확인해 주세요. / 개인정보 수집·이용에 동의해 주세요. and the length messages); server failure banner uses LEAD_MESSAGES.retry 잠시 후 다시 시도해 주세요.; network failure (offline, action fetch rejects, stale action id after one retry) uses the app string 서버에 연결하지 못했어요. 입력을 유지했으니 연결 상태를 확인하고 다시 시도해 주세요.
Interaction: see section 10. Entering the section switches the plate clock to the visitor's local time with label 지금 (the demo night is over). On success the draft card in the rail becomes the success card in place (700ms), the section adds the visitor record, the mobile sheet count increments.
Mobile: one column; the live card appears only after success; sticky bottom bar (safe-area) with the submit button (form attribute) while the form is in view and not yet sent; inputs 16px text; inputmode tel by default, email after 이메일로 입력.
Reduced motion: no transitions; Treadmill replaced by the static text 보내는 중.
Assets: LDRS Treadmill; Radix-based form primitives (restyled); app icons store and bag on role cards.
References: the app's 새 사입 요청 form and 요청을 보낼까요? summary (.context/app-capture/screenshots/09-new-request-confirm.png); .txt (the log the reader joins).
Acceptance: section 10 acceptance.

### S11 · footer · 사입삼춘.
Purpose: close the story where the film ends, and remind that the record continues.

Layout: day canvas; wordmark full width at the top; below: line and callback card (left), visit log (middle), links and legal (right). Mobile stacks.
Copy:
- Wordmark: 사입삼춘. (the period is the dot)
- Line [app one-liner]: 사입 요청부터 상품 수령까지 함께 기록해요.
- Callback card [app]: 다음 미송 재확인 / 2026-10-13 / 와이드 데님 팬츠 / 남은 미송 4장
- Visit log (only if present): heading 이 페이지에서 남긴 기록; rows from visitor records (업무 기록 · HH:MM 미송을 기다리기로 했어요 with 예시; 신청 기록 · HH:MM 사전 신청을 보냈어요).
- Links: 흐름 / 역할 / 신뢰 / 영상 / 사전 신청; 개인정보 처리방침 only when /privacy exists.
- Company: © 2026 HANBAT & CO. (pending client confirmation).
- ㅅㅊ symbol #111111 at 112px width.
Interaction: when the footer top reaches 80% of the viewport: wordmark syllables rise from line masks (yPercent 100 to 0, 700ms, stagger 50ms); the ink dot drops from 40vh above into the period slot with the drop token (420ms power2.in, squash 90ms, settle 380ms overshoot); the line types on by syllable (18ms stagger). Rail becomes the pill 업무 기록 n (min 1280px).
Mobile: wordmark at 19vw on one line; links in two columns.
Reduced motion: static wordmark with the dot in place.
References: Cevox reel outro (.context/video-ref/analysis.md); basement.studio (BSMNT.26 giant footer wordmark; .context/research/refero/basement-sheet.jpg); film outro in video/out stills.
Acceptance: wordmark never overflows at 320-1920px widths; the dot lands exactly in the period position (within 2px) at 1440 and 390; the visit log matches sessionStorage.

---

## 8. Hairline figure: cart (손수레)

Name: cart. A custom figure on the vendored hairline kernel (the npm package cannot mount custom figures).

Concept line (skill format): Cart. A two-wheel market hand truck tipped back on its wheels carries six tied 사입 봉투. The pointer's height sets how many are secured: bags below the cut settle stacked on the toe plate against the frame; bags above it lift off and hang as dashed ghosts on dashed tethers rising out of the frame, the top tether carrying a punched hang-tag (the 재확인일, said with geometry). Read-out 2·4 at rest. Tour: low, middle, near the top, leave.

Telling features:
- Cart: two wheels with hub creases, an axle, two upright rails joined by a closed handle loop, a thin toe plate, the whole frame tipped back 8deg, one strap across the secured stack.
- Bag: a rounded solid with a gathered neck and a knot crease (silhouette plus one crease, rule 09).
- Ghost bag: the same silhouette drawn as a dashed guide (dash class, no fill), painted behind solids (rule 06).
- Hang-tag: a small rounded plate with three punched dots on the topmost tether.

Behaviour:
- Hit test (rule 01): fixed screen bands from the rest pose. Contract with the host: cut n = clamp(round((288 - y) / 36), 0, 6) for pointer y in viewBox units. So y 288 = 0 secured, y 72 = 6 secured.
- Clocks (rule 08): the cut is a continuous spring (k100, c18, m1); each bag's secured/hanging state is a 700ms tween on (.32,.72,0,1), delayed |i − cut| × 40ms (rule 02).
- Clamp (rule 03): the cut is clamped to 0..6; there is no seventh position. Camera fitted with fit() to the most extreme pose (all six hanging at the maximum gap) so nothing leaves the 400x320 frame at range maximum.
- Accent (rule 04): exactly one bright stroke: the knot of the topmost secured bag; when none is secured, the toe plate's front edge.
- Rest (rule 05): two bags on the cart, four ghosts hanging in a slight fan, cart tipped back, knot of bag 2 bright. It is the recorded truth and the thumbnail.
- Cost (rule 07): all motion in register(stage, tick); tick returns true only while moving.
- Quiet (rule 10): no letters or digits in the SVG. read.textContent writes the short form n·m (for example 2·4) and rest.
Figure fields:
- name: cart
- means: A market hand truck: bags under the pointer settle on the cart as secured stock; bags above hang as dashed ghosts, still owed.
- rules: [1, 3, 5, 6, 8]
- range (hanging gap, world units): [8, 14, 22]; production mounts with 14.
- tour: [[200, 252], [200, 180], [200, 112], null] (1, 3, then 5 secured, then leave to rest).
- Frame: Cam(45, 0.5, S about 1.8), centred near (200, 166) with fit, at most 200 lines, silhouette reads at 240px wide.
Theme (CSS variables on the stage; plate equals the section background #093A32):
- --hairline-plate #093A32; --hairline-hi #F2FFE8; --hairline-edge #EDECE3; --hairline-mid color-mix(in srgb, #B6D7C2 60%, #093A32); --hairline-lo color-mix(in srgb, #B6D7C2 25%, #093A32); --hairline-stroke 1.
Build:
1. Run the hairline-create skill with this concept (skip the concept prompt; object and gesture are chosen). Write cart.js in a working folder (.context/hairline/cart/).
2. Iterate node ~/.claude/skills/hairline-create/look.mjs cart.js --answer x,y,z --edge x,y,z until it exits 0; answer the look.md questions from the sheet (does it read as a hand truck at 160 and 240px; do bags read as tied bags, not blocks).
3. Copy cart.js verbatim to src/vendor/hairline/figures/cart.js and append nothing but 'export {};' if the bundler needs a module marker.
Host (client component CartFigure):
- Sets globalThis.HL (from src/vendor/hairline/kernel.mjs) and globalThis.hairline = (f) => registry.set(f.name, f), dynamic-imports the figure when the section is within 1.5 viewports, calls HL.inject(document), creates stage[data-hairline] and HL.mk('svg', {viewBox: '0 0 400 320'}), mounts with fig.mount({stage, svg, read}, 14). The read object is a getter/setter that mirrors writes into React state (reference: .context/scratch-toolkit/src/app/hairline/CustomFigure.tsx).
- Starts HL.tour(stage, fig.tour) once at 50% visibility when no pointer is present (desktop) or on first view (mobile); not under reduced motion. Cleanup: tour.stop(); handle.destroy(); svg.remove().
- Stepper (all viewports, keyboard accessible): on change to n, stop the current tour and start HL.tour(stage, [[200, 288 - 36 * n]]) without a trailing null so the unseen pointer holds at n. If the kernel's tour does not hold its last stop (verify), dispatch synthetic pointermove events on the stage at the mapped client coordinates instead.
- Read-out (React, outside the SVG): ink 확보 2 · 미송 4 at rest; grey 확보 n · 미송 (6 - n) while exploring, numbers rolling over 300ms; aria-live polite. The stage has role img with aria-label updated on settle: 손수레 위 봉투 n개는 확보, 걸린 봉투 m개는 미송.
Acceptance: look.mjs exits 0; validate passes; rest pose equals 2/4; pointer above the top band reads 6·0, below the bottom band 0·6, never 7; reduced motion lands instantly; destroy leaves the SVG empty.

---

## 9. Component picks

Libraries (versions as installed or verified):
- gsap 3.15 + @gsap/react 2.1.2: ScrollTrigger, SplitText, DrawSVG, MotionPath, ScrambleText, Flip, Draggable, Inertia (all free in npm). Registered once in src/lib/gsap.ts; per-section plugins lazy-loaded from src/lib/gsap-plugins.ts.
- lenis 1.3.26: foundation provider.
- motion 14.1 (motion/react): only in S6, S8 proposal leaf, S10 form. Re-pin motion@^14.1.0 if any registry install downgrades it.
- matter-js 0.20 (+ @types/matter-js 0.20.2): S2 only, lazy.
- ogl 1.0.11: S5 sky only, lazy, desktop.
- Vendored hairline kernel: src/vendor/hairline/kernel.mjs (+ kernel.d.mts) copied from .context/scratch-toolkit/src/vendor/hairline/, kernel body sha256 3a19aa2640ba8c6c306184d05fddfbd4f3323a6ebd9217dd3cbb38e9db74991c; used by the map build script (pure geometry) and the cart figure.
React Bits (copied from the verified scratch build .context/scratch-toolkit/src/components/, restyled, never default state):
- SplitFlapText: the plate clock. Motive: time flips forward only when a record is written. Fixes kept: setTimeout instead of window.setTimeout; font overridden to Paperlogy; flat paper tiles.
- TearTicket: the 수령 stub. Motive: receipt is the shop's physical act.
- StatusMark: proposal status glyph (pending to done). Motive: a proposal becomes a record only when confirmed.
- FallingText: reference code only for S2 (it lacks the second phase).
LDRS 1.1.9: Treadmill (import { Treadmill } from 'ldrs/react' plus 'ldrs/react/Treadmill.css'), 22px, mint #F2FFE8 inside the submit's deep-green trailing circle. Motive: a conveyor while the request travels.
Form primitives: shadcn-style wrappers written by hand on @radix-ui/react-radio-group, @radix-ui/react-checkbox, @radix-ui/react-label; Input and Textarea are native elements. No shadcn init (it would rewrite globals.css).
Icons: app SVGs as React components; Phosphor Light for media and form chrome.
Rejected: three, R3F, drei, rapier (no meshes needed; rapier wasm about 814KB gz); React Bits TextPressure and VariableProximity (need variable axes); React Bits Noise (animated loop); all cursor components; Aurora, LightRays, Prism, glass cards, MagicBento, Lanyard, PillNav; Aceternity UI, Magic UI; MUI, Mantine, HeroUI; jsrepo; marquees.

---

## 10. Lead form (Supabase)

Backend (existing): server action submitLead in src/app/actions/lead.ts inserts into public.landing_leads with the publishable key under insert-only RLS (columns role, name, business_name, contact, market, message, source, utm, consent, user_agent). Validation in src/lib/lead/schema.ts (zod), honeypot homepage_url, fill-time check form_fill_ms (minimum 2500ms), utm capture via LeadFormGuards.

Field mapping:
| UI | name | Column | Rule |
|---|---|---|---|
| 어떤 일을 하고 계신가요? (radio cards) | role | role | required: retailer, uncle, other |
| 이름·담당자명 | name | name | required, 1-60 code points |
| 매장명·쇼핑몰명 / 활동명·업체명 / 회사·단체명 (선택) | business_name | business_name | optional, up to 80 |
| 연락처 | contact | contact | required, 5-120 code points, at least one letter, digit or @ |
| 사입 시장 (선택) | market | market | optional: 동대문, 남대문, 기타 |
| 문의 내용 (선택) | message | message | optional, up to 1000 |
| [필수] 개인정보 수집·이용에 동의해요 | consent | consent | required true |
| hidden | homepage_url, form_fill_ms, source=landing-signup, utm_* | source, utm | LeadFormGuards |

UX:
- Labels above inputs, helper below, error below helper. No placeholder-as-label.
- Inputs: height 56px, radius 16, fill #E4E3DA, 1px transparent border, text 16px (no iOS zoom), focus ring 2px #0C483E with 2px offset; error state adds a 2px #0C483E left rule and ink error text with a Phosphor WarningCircle; never red.
- Role radio cards: radius 24, #F5F4EE, icon (store for 소매업자, bag for 사입삼촌, none for 기타), selected = 1.5px #0C483E border + figma_check; changing role swaps the business-name label with a 200ms crossfade.
- Market chips: full pills; selected = #0C483E fill with #F5F4EE text.
- Inputs are controlled; the draft autosaves to sessionStorage (key au:lead-draft, debounced 400ms; consent never persisted) and restores on load, so React's automatic form reset after an action never loses input. The autosave note is therefore true.
- Client checks on blur and submit mirror the schema without importing zod (messages from src/lib/lead/constants.ts).
- Submit is direct (no modal). Pending: the button keeps its width, label 보내는 중, Treadmill in the trailing circle, all inputs readOnly.
- The action call is wrapped: a rejected call (offline, network) or a stale action id (one silent retry) returns an error state with the network string; inputs remain.
- Success: aria-live announces LEAD_MESSAGES.success; draft card becomes the success card; story.addVisitorRecord({kind: 'signup'}); sessionStorage draft cleared; fields reset to empty; the form shows a compact 다시 신청하기 link.
- Rate limit: best-effort in-memory token bucket in the action (5 submissions per 10 minutes per x-forwarded-for IP; on exceed return LEAD_MESSAGES.retry), documented as per-instance only; DB CHECKs cap field sizes.
- Lenis: data-lenis-prevent on the textarea only; Korean IME composition must not lose characters in Safari and Chrome.
- Test hook: when LEAD_DRY_RUN=1 the action validates and returns success without inserting (e2e only).

---

## 11. Media and video placement

Rule: phone footage appears only in S7 and S8 (story time 09:41 and later); the film in S9. No footage in S1-S6.

App clips (H.264 High, yuv420p, CRF 26, GOP 15, faststart, no audio, 720x1564; plus AV1 WebM CRF 38 GOP 15 as the first source):
| id | Source | Trim | Output | Used in |
|---|---|---|---|---|
| retailerDenimDetail | .context/app-capture/videos/03-request-detail_1080w30.mp4 | 0-17.62s | public/media/app/retailer-denim-detail.{webm,mp4} | S7 retailer play |
| uncleHome | .context/app-capture/videos/05-uncle-home_1080w30.mp4 | 0-16.72s | public/media/app/uncle-home.{webm,mp4} | S7 uncle play |
| chatHistory | .context/app-capture/videos/09-chat_1080w30.mp4 | 14.0-27.47s | public/media/app/chat-history.{webm,mp4} | S8 device |
Stills (sharp, AVIF q60 4:4:4 + WebP q82, widths 540 and 1080, from 1320x2868 PNG):
| id | Source | Output base |
|---|---|---|
| retailerHome0941 | screenshots/04-home-scroll.png | public/media/app/retailer-home-0941 |
| uncleHome0941 | screenshots/10-uncle-home.png | public/media/app/uncle-home-0941 |
| retailerDenimDetailFirst | frame 0.1s of 03-request-detail | public/media/app/retailer-denim-detail-first |
| uncleHomeFirst | frame 0.1s of 05-uncle-home | public/media/app/uncle-home-first |
| chatHistoryFirst | frame 14.0s of 09-chat | public/media/app/chat-history-first |
Film (from video/out, green v2 renders only):
- Inputs, first match wins: master agent-uncle-promo-v2-16x9.mp4; social agent-uncle-promo-v2-9x16.mp4; loop agent-uncle-hero-loop-v2-brand.mp4 (if absent, render it read-only with npx remotion render HeroLoop out/agent-uncle-hero-loop-v2-brand.mp4 --props='{"palette":"brand"}' --muted from video/, else fall back to agent-uncle-hero-loop-v2.mp4).
- Outputs: public/media/film/promo-16x9-1080.mp4 (CRF 23, AAC 128k), promo-16x9-720.mp4 (CRF 25), promo-9x16-720.mp4 (720x1280, CRF 24, AAC), loop-720.mp4 and loop-1080.mp4 (muted, CRF 24), poster-end-{800,1600}.{avif,webp} (last frame of the master), poster-9x16-end-{540,1080}.{avif,webp}, chapter-{0..7}-480.avif (chapter start + 0.8s).
- Chapters: read MASTER.chapters and FPS from video/src/timeline.ts at media build time (Node type stripping), strip the 00 prefix, write src/content/generated/film.json {ready: true, duration, chapters: [{label, start}], files}.
- Colour audit (blocking): sample 2 frames per second of every film output; a frame fails when more than 100 pixels match orange (hue 8-60deg, saturation above 0.35, value above 0.35) or lime (hue 65-100deg, saturation above 0.5, value above 0.6). Any failure blocks release. The v1 files (persimmon) currently in video/out must never be copied.
Playback policy: preload none (clips) and metadata (film on hover/focus); posters always; one decoder at a time (media manager); pause below 25% visibility; autoplay only muted, only in view, never under reduced motion, Save-Data or lowPower; play() rejections fall back to poster + play button.

---

## 12. SEO, metadata, OG

- Title: 사입삼춘 | 사입 요청부터 상품 수령까지 함께 기록해요 (foundation site.title). Description: 사입 요청부터 상품 수령까지 함께 기록해요. Canonical /. Robots index, follow (the smoke page's noindex is removed).
- metadataBase from NEXT_PUBLIC_SITE_URL (foundation).
- OG image (next/og, 1200x630): ground #07231C; the hero map silhouette from the map JSON as an inline SVG data URI in rgba(182,215,194,0.30) with 청평화 in #F2FFE8; the ㅅㅊ symbol on a #F5F4EE plate; 사입삼춘. in Paperlogy 900 (#EDECE3) with the period as a #F2FFE8 dot; the one-liner in 400. Fonts from src/app/fonts/og (TTF subsets).
- JSON-LD: one WebSite object {name 사입삼춘, alternateName Agent Uncle, url, inLanguage ko-KR, description}. No Organization until client question Q1 is answered; no SoftwareApplication offers or ratings.
- robots.ts allows all; sitemap.ts lists /.
- Semantics: one h1 (hero), one h2 per section, h3 inside S8 and S10; landmarks header, main, aside (업무 기록), footer; skip link (foundation).

---

## 13. Performance budget

- LCP under 2.5s on a mid-range Android over 4G (target 1.8s); desktop under 1.2s. LCP element: the hero H1 (server text, Paperlogy 800 display subset preloaded). The hero ships no image and no video.
- CLS under 0.05: fixed chrome; reserved boxes for devices, slips, videos (aspect-ratio); metric-adjusted fallback font.
- INP under 200ms: pointer handlers rAF-throttled writing CSS variables; reducers only on discrete input; no per-frame React renders.
- Initial client JS: at most 85KB gzip beyond the Next/React runtime (GSAP core + ScrollTrigger + SplitText about 47KB, Lenis 8KB, DrawSVG 3KB, hero lens leaf, chrome with SplitFlap, story store). Everything else lazy via IntersectionObserver with rootMargin 100%: matter-js + ScrambleText + Flip (S2, about 40KB), MotionPath (S3, S5), kernel + cart (S4, about 12KB), ogl + shader (S5, about 25KB, desktop only), Motion + TearTicket (S6), Draggable + Inertia (S7, about 18KB), proposal leaf + StatusMark (S8), form leaf + Radix + LDRS (S10).
- Fonts: preloaded 400 (about 116KB) + 800 display subset (about 30KB). Deferred 700 (about 116KB) and 900 subset (about 6KB).
- Media: each app clip at most 1.8MB (H.264), stills at most 120KB each (AVIF 1080w), film master loaded only on play; total below-the-fold image weight at most 900KB.
- Map SVG at most 30KB gzip inline; paths at most 600.
- Off-screen: physics runner stopped, ogl loop cancelled, hairline loop asleep, videos paused, ScrollTriggers killed on unmount (useGSAP cleanup).
- Verification: Lighthouse mobile and desktop on a production build; WebPageTest Moto G Power 4G; Chrome performance trace at 4x CPU throttle scrolling the whole page (no long task over 100ms while scrolling except lazy chunk evaluation).

---

## 14. Accessibility budget

- WCAG 2.2 AA. Text contrast at least 4.5:1 (large text 3:1); night HUD text at least 7:1.
- Every interaction has a keyboard path: building buttons (lens), the S2 ledger list (static equivalent of the pile), cart stepper, tear button, seam slider (role slider), steppers, proposal buttons, film controls, form.
- Focus visible everywhere (2px ring, mint at night, #0C483E by day, 3px offset).
- Pinned sections never trap focus; DOM order equals reading order; all captions of a pinned sequence exist in the DOM.
- Live regions: rail newest entry (polite, debounced), cart read-out (polite), steppers refusal (alert), form status (polite).
- Text equivalents: map (figure with a caption listing the four buildings and the denim record), cart (role img with updated aria-label), videos (aria-label from media alt + the film's details summary), equation (numbers are text).
- prefers-reduced-motion: the full experience in 6.5. prefers-contrast more: grain off, glass opaque, dim strokes raised to 60%.
- Touch targets at least 44px. No custom cursor; the native cursor is always visible.

---

## 15. Global acceptance criteria

- Zero em dashes and zero en dashes in rendered text (scan of rendered DOM and of src/content).
- No banned colours in src (grep for E8572E, FF5B35, C6FF3A, D9704F, orange, amber, lime) and no #E42939 or #D22030 in site styles.
- No eyebrow labels, no section numbers, no scroll cues, no marquees, no decorative dots, no custom cursors.
- Every visible number traces to table 0.6, its derivations, or a 예시-labelled sample surface.
- One CTA label per intent: 사전 신청 (signup), 영상 보기 (watch).
- Reverse scroll from the footer to the top restores every beat (plate, rail, phase) exactly; fast scrolling (Home/End keys) leaves no orphaned animation.
- Deep links #route, #roles, #trust, #film, #signup land on their sections after load.
- Reduced-motion run: all content visible, no pins, every interaction usable.
- Mobile 390x844 and 360x780: no horizontal overflow, hero CTA above the fold, no blocked vertical scroll anywhere.
- npm run lint, npm run typecheck, npm test, npm run build pass; Playwright suites pass in desktop, mobile and reduced-motion projects.
- Lighthouse mobile: Performance at least 85, Accessibility at least 95, Best Practices at least 95, SEO 100.
- Film colour audit passes and film.json ready is true.

---

## 16. Risks and open client questions

Risks:
- Promo film: video/out currently holds v1 persimmon renders. Mitigation: the colour audit gate; build against a dev fixture until the green v2 renders land.
- Scope: five pins, physics, a shader, a figure, a seam. Mitigation: isolated packages, derived store, mobile without pins; if the S5 sky slips, the CSS gradient path ships everywhere.
- iOS Safari: pins with Lenis, video autoplay in Low Power Mode, IME in the form. Mitigation: syncTouch false, posters with play, controlled inputs, a real-device test.
- Map legibility at 375px. Mitigation: dedicated hero-mobile view and a look pass.
- Paperlogy display subset drift when copy changes. Mitigation: the subset test fails the build.
- Demo-data quirks: Saturday night vs 토요일 밤 휴무, 수요일 vs 2026-10-12 in the shirt's reason (film only). Mitigation: no weekday in site copy, partner-detail screen never used.
Open client questions (launch blockers marked):
1. Public company name HANBAT & CO. for the footer (blocker for the footer line).
2. Consent retention period text and the 개인정보 처리방침 page (blocker for the form going live; proposed default in S10).
3. Whether Agent Uncle may appear (used only in JSON-LD alternateName).
4. Tone check of the S2 example phrases (illustrative market chat, labelled 예시 대화예요.).

---

## 17. Spec self-review log
- Placeholders: none in copy except the two flagged client items (company name, retention text), each with a concrete default and a blocker flag.
- Contradictions resolved: 08:47 → 08:49; dawn footage (shirt batch 총 10개) removed so the 2개 요청, 총 7개 card stands alone; S3 shirt footage removed; hero 9:41 home footage removed from the 22:00 scene; rail vs live summary card resolved by putting the draft in the rail; red vs app badges resolved by the pixel rule.
- Ambiguity resolved: beat table, section defaults, chrome modes per section, pin priorities, refusal per illegal move, cart band contract (288 - 36n), media file names and fallbacks.
- Scope: 600vh pins; S4, S6, S7, S8 unpinned; 10 section packages.

---

## 18. Implementation record (2026-10-12)

Sources: .context/final/requests-all.json, .context/outstanding.json (knownGaps), .context/global/shared.json. Where this section and an earlier clause disagree, this section describes what was built. Format per item: clause changed: what was built. Why.

### 18.1 Accepted deviations

hero
- 4.1 dim strokes (0.30 / 0.16): the hero raises base silhouettes and door marks to 0.46 (about 3.3:1 on #07231C), creases to 0.26 and floor ticks to 78%, easing back to 0.30 / 0.16 over pin 0.6-1.0. The resting map meets 3:1 and the S2 match cut keeps one brightness; prefers-contrast: more is untouched.
- S1 Dive (text block 0-40%): the text block rises and fades over 0-20% of the pin. The scaling dot and 남평화 never cross half-visible text.
- S1 Layout: the map is cover-fitted and lifted so the lens and dot stay 16px above the text block; on frames at or below a 7:5 aspect it lifts further so 남평화 clears the H1.
- S1 Lens readout (24px right of the lens, 8px slide): a unit-tested placement solver tries west, east, above, then below, and never covers the H1, sub, CTAs or record cards; at rest it sits west of 청평화, and it fades and jumps instead of sliding across text. A fixed right-hand card covered 디오트 and the record cards, and on 남평화 landed under the H1.
- 0.5 (will-change only while pinned): will-change is never set on the map during the dive. With it Chromium rasterised at scale 1 and stretched the layer; without it strokes stay 1px and sharp at scale 1.6 with the tilt.
- 14 (DOM order equals reading order): deliberate exception on phones. DOM and focus order is H1, sub, CTAs, then map and chips, while the map and chips sit visually above the H1 (audit issue 16, option a), so screen readers meet the H1 before any building control.

words
- S2 accessibility: the pit is not aria-hidden as a whole. The six phrase bubbles are aria-hidden duplicates; the vocabulary pills stay focusable buttons with aria-describedby to their glossary line, since focusable controls inside aria-hidden fail WCAG 4.1.2.
- S2 pill size: desktop pills use the app's 'theirs' bubble proportions scaled 1.3 (1024px), 1.5 (1440px) and 1.75 (1800px); phones keep the exact app size. Twelve bodies then form a readable heap in a roughly 900px pit.
- 6.1 / S2 connector (DrawSVG, Flip): the 1px mint connector is a scrubbed scaleX from the left and flights are computed from timeline progress, so words loads neither DrawSVG nor Flip. Same look, and no tweens are added to a built scrubbed timeline after an async plugin load.
- 6.6 (physics bodies halved): low-power devices with motion get the six phrase bubbles only (no vocabulary pills or glossary); reduced motion always shows all 12. Which devices count as low power: 18.2 item 4.

route
- S3 Layout (camera start): the camera still starts on the S2 end-state frame (scale 1.6, tilt 10deg about 청평화's roof), but the drawing comes up from 25% to 100% while the section enters (scene top at 70% of the viewport to the pin start), so the pin opens on a lit map. The lamp still switches on at 0.10.
- S3 pinned figure: the figure's mask fades the top 18vh and the bottom 22vh, so map strokes never run under the nav or the caption stack.
- S3 Interaction (stops 0-20 / 20-55 / 55-85 / 85-100%): caption ranges are 0-32 / 32-66 / 66-90 / 90-100%, so each caption swaps on the beat it names (markers 0.32 / 0.66 / 0.90). The old ranges ran the caption clock ahead of the plate, tags and rail.
- S3 timing: leg 1 draws 0.15-0.32 to APM, the lamp holds at APM until APM_DEPARTURE 0.42, leg 2 draws 0.42-0.66 to 청평화, and a x1.06 camera push on 청평화 runs 0.66-0.84. Arrivals land exactly on the 02:16 and 03:06 beats, and the push marks the stop where the ledger moves.
- S3 route line: a solid mint line (35%, 1.5px) sits under the 2/6 dashed route, revealed by the same mask, so the walked path reads between dashes.
- S3 end framing (scale 1.0): the camera settles at a fitted scale (about 0.78 of the S2 cover box at 1440x900, 0.92 at 1920x1080) so APM, 청평화, the round and both tags sit between heading and captions. Labels and door tags keep their true size while the camera scales.
- S3 landing: #route deep links and nav jumps land at pin progress 0.15 (settled framing, lamp lit) through a negative scroll-margin-top that the chrome's jumpTarget honours.
- 14 keyboard path: on desktop, PageDown, PageUp and Space never step over a whole stop; they rest at 0.15 / 0.37 / 0.84 / 0.95 where a native page would skip one, so 03:06 gets a resting frame.

cart
- 8 Theme (--hairline-edge #EDECE3): --hairline-edge is color-mix(in srgb, #B6D7C2 82%, #093A32). With #EDECE3 the single mint accent (hairline rule 04) could not be told from the silhouettes.
- S4 tour (at 50% visibility): the tour starts only once the read-out and its 미리 보기예요. note are fully on screen, greys the whole preview line and lasts about 3.5s, so a passive scroll never shows a tour value beside the plate's 2/4 without the note.
- S4 home card: its last line (남은 미송 4장) is ink #101010 at rest where the app shows grey, so the exploring grey #636363 (5.6:1) reads as a change.
- 8 Host stepper: uses the spec's synthetic pointermove fallback, not HL.tour. The kernel tour holds only after a 1.2-2.6s delay, keeps the loop awake and does nothing under reduced motion, where the stepper must still work.

dawn
- 4.4 radius lock (every button full radius): the confirm card's 취소 and 확인 use the app dialog's 12px radius (--radius-button), because the card reproduces the app's dialog.
- S5 text on the sky: heading, body, route, ruler and destination switch from night to day colours one by one as the horizon reaches each, not all at the 62% phase flip. Each crossover dips to about 3.6:1 for about 10px of scroll; the 0.56, 0.62 and 0.66 frames pass AA (e2e).
- S5 30-70% dot inking: lamp to ink is a short tween (0.012 of the pin) centred on 0.548, inside the 0.50-0.60 window. A longer crossfade made the dot vanish into the mid-luminance sky.

receipt
- S6 Auto-tear (slip bottom leaves the viewport top): a wide slip tears when its top reaches 64px from the viewport top (or once scrolled through on a viewport shorter than the slip); a phone-width slip tears when its bottom reaches 60% of the viewport. No auto-tear while the what-if sample is open or keyboard focus is inside the section; closing the sample past the line waits for the next deliberate forward scroll. The old line fired after roles had taken the beat, so scroll-only readers never saw 08:49.
- S6 what-if (desktop): the sample opens beside the slip in the copy column (cols 6-9) and the copy steps aside while it is open, removing the dead band beside it. Open fix: the copy is hidden with visibility, which drops the section's h2 from the accessibility tree while the sample is open.
- S6 Mobile (stub touch-action pan-x): stub and slip use pan-y pinch-zoom. pan-x would block vertical page scrolling over the stub (15); a sideways swipe still tears.
- S6 Mobile layout: below a 420px slip width the slip is vertical, the stub a strip under the body holding the full-width 2장 수령 확인 button with the ink dot at the perforation's left end. A right-hand stub left a 240px body that cannot fit the two-column 전달 회차 row.
- S6 story wiring: beat reporting, auto-tear and reset live in the always-loaded ReceiptProvider on two 1px ScrollTriggers, not in the lazy Motion leaf or an IntersectionObserver, so the story holds before Motion loads and on End, Home and deep-link jumps that skip the section.

roles
- S7 entry draw (on entry): outlines and connector draw when the denim cards reach the viewport, not at section entry. At 1440x900 a 'stage top 70%' start put both cards below the fold, so the draw played unseen.
- S7 labels: label opacity follows each side's share but bottoms out at 0.7, so the ink role text keeps AA on #EDECE3.
- S7 keyboard: the seam slider also takes Page Up / Page Down in steps of 10 (APG slider pattern).
- S7 controls: desktop play buttons and device captions align to each device's outer side, so the seam never clips a button at the 25/75 bounds. Between 1024px and about 1440px the stage shifts left to clear the compact plate; open: at 1024x768 the screens shrink to about 216px (target 240px or more).

trust
- S8 and 11 chat clip (09-chat 14.0-27.47s, rest still chat-history-first): the clip is 14.0-23.1s (9.1s) and ends on the scrolled-up denim records; at rest, after the clip ends, under reduced motion and on low power the device shows the new still chat-history-records. The old tail returned to the 채팅 list (남평화 정삼촌 with red badges), and the old still showed the shirt chat with the keyboard up beside the 2 ≤ 2 ≤ 2 board.
- S8 chat device labels: play 대화 재생 (trust.chatPlay; S8 named none, same register as S7's 홈 화면 재생), pause 멈춤.
- S8 StatusMark: where its label would be green at the source's 0.6 opacity (badge 확정, request status 완료) the text renders at full contrast beside the glyph.
- S8 chat context line 09:37부터는 같은 대화에 이어진 셔츠 요청이에요. (added under the device): needs client confirmation. With the records still at rest the line is true only while the clip plays; proposed rewording: 재생하면 09:37부터 같은 대화에 이어진 셔츠 요청이 나와요.

film
- S9 Mobile (loop's first frame as poster): the 9:16 frame uses poster-9x16-loop, a centre cover crop of the 16:9 loop at 0.1s, so Save-Data and late decode show the same green grid frame.
- S9 chapter ticks: hidden below 768px. The 9:16 cut (29.5s) has no chapter times in film.json, so master times would seek it wrongly.
- S9 mobile controls: below 768px sound and fullscreen are 44px icon chips whose labels (소리 켜기 / 소리 끄기, 전체 화면으로 보기) stay as visually hidden accessible names; from 768px the labels are visible text.
- S9 playback: pressing 영상 보기 or a tick before the card has settled (pin progress below 0.70) first scrolls to the settled point; closing the reveal pauses a running film, so no sound plays from a dot.
- S9 landing: in desktop motion an inline scroll-margin-top makes #film, the hero 영상 보기 CTA and the nav 영상 link land on the settled card, not mid-reveal.

signup
- 10 Lenis (data-lenis-prevent on the textarea): the message field contains its scroll (overscroll contain, Lenis prevented) only while it overflows. Unconditionally it trapped page scrolling on phones, breaking 15's no blocked vertical scroll.
- S10 Mobile submit: the in-flow submit sits under the consent row at every width. Below 768px the sticky bar starts only once the first role card clears it, then hands over instantly to the form's own button when that button reaches the same box; the nav 사전 신청 steps aside while the form button is on screen.

footer
- S11 Mobile (19vw, one line, wordmark at the top): below 768px the wordmark is two lines (사입 / 삼춘.) at min(40vw, 32svh) and stacks last, above the legal line, so the page's end frame always holds it whole; DOM order is unchanged (the h2 still opens the landmark). With the wordmark on top its lower line ended sliced under the nav.
- S11 size: from 768px the one-line wordmark (min(22vw, 320px)) is also capped by viewport height, so at the end of the page it clears the nav on 1280x800, 1366x768, 1023x768 and similar.
- S11 Interaction (footer top at 80%): syllables clear of the record column rise as the wordmark top reaches 85% (사입삼 from 1024px to about 1600px, all four elsewhere); the finale (remaining syllables, drop, one-liner) plays at footer top 45% and slot bottom 92%; below 768px each line rises at 90% and the dot drops at slot bottom 92%. Every start is clamp()ed so tall screens (1080x1920, 3840x2160) still play. At 80% the dot landed below the fold, behind the open rail or under the mobile submit bar.
- S11 Layout: from 1280px the ㅅㅊ symbol and the © line sit bottom-left, clear of the fixed 업무 기록 n pill.

chrome
- 5.4 pill count (기록 n): counts 업무 기록 only; the 03:07 message is excluded, because messages are not records.
- 5.4 pill before 03:06: reads 확보 0 · 미확인 6, matching the plate's 미확인 before any result is shared.
- 5.2 rail times: entry times sit on a paper chip and cards carry a hairline, so no rail text sits on the raw ground while the sky changes; contrast holds at dawn 0.55 and 0.60.
- 6.3 jumps: jumpTarget lands where a native fragment jump does (top minus scroll-margin-top), so the nav, the rail and deep links reach the same frame; route and film reach into their pins with an inline negative margin.

motion / shared
- 6.6 low-power heuristic: a hardwareConcurrency of 4 on iOS and iPadOS is treated as unknown (WebKit clamp). Needs client confirmation: 18.2 item 4.
- 4.8 and 0.5 strokes: map.css divides stroke widths and route dashes by --map-scale. Non-scaling strokes cancel only the viewBox scale; a CSS scale on an HTML ancestor widened them 1.61x at scale 1.6.
- 13 fonts: the 800 display subset is 5.2 KB (estimated about 30 KB) and the 900 subset 2.5 KB.

media
- 11 colour: app clips and first-frame stills are converted from the capture's Display P3 to BT.709; film encodes are converted from Remotion's untagged BT.601 and tagged BT.709. Posters match the decoded first frame within about 2-3 levels in Chromium and WebKit.
- 11 film inputs (agent-uncle-promo-v2-*.mp4): video/out holds the green v2 renders under canonical names (agent-uncle-promo-16x9.mp4, agent-uncle-promo-9x16.mp4, agent-uncle-hero-loop.mp4) and the persimmon cut as -v1. A canonical render is accepted only if it is not -v1, its frame count equals MASTER.total / SOCIAL.total in timeline.ts, it has audio and it passes the colour audit.
- 11 brand loop: rendered read-only from video/ into node_modules/.cache/agent-uncle-media/hero-loop-brand.mp4, not into video/out, so video/ stays untouched.
- 11 chat clip trim: see trust.

Reviewed and not adopted (the earlier clause stands; orchestrator may reopen): S1 pin stays +=100vh (a pin about 30% shorter was proposed); S1 draw-in idle timeout stays 300ms (about 1200ms was proposed; the cost is one 52ms task at 4x CPU); S3 keeps LAMP_ON 0.10, caption D at 0.90 and the 180vh pin; S4 keeps both 2026-10-13 cards ([app] strings, the repeated date is the section's point); S5 keeps +=120vh with the 70-100% landing tail; S9 H2 aligns with the card's left edge, not the page gutter.

### 18.2 Open client decisions / launch blockers

1. Retention text and privacy page (blocker for the form going live). src/content/legal.ts ships the unconfirmed RETENTION_DEFAULT 신청일로부터 1년, 동의를 철회하면 바로 파기해요. src/app/privacy/page.tsx does not exist and PRIVACY_PAGE.exists is false, so the footer's 개인정보 처리방침 link is hidden. Before any public deploy: the client confirms the retention text, then add src/app/privacy/page.tsx naming the automatically stored user_agent, source and utm_* (the consent disclosure lists only form fields) and flip PRIVACY_PAGE.exists in the same change; the LEGAL_BLOCKERS release gate stays until then. Also outstanding: the manual staging insert (one real row, then deleted). Live checks use contact e2e-check@invalid (stored with source e2e) and delete the row afterwards.
2. Footer company name (blocker for the footer line). COMPANY.line © 2026 HANBAT & CO. in src/content/legal.ts renders as a placeholder pending confirmation (16, question 1). JSON-LD carries no Organization until then.
3. Signup conversion disclosure (needs client decision). The flow audit found the form heavy: at 1440x900 the sheet holds 7 controls and 사전 신청 sits about 1300px below the section top. Suggestion: one native details disclosure below 연락처 holding the optional business-name field, 사입 시장 and 문의 내용, so role, 이름·담당자명, 연락처, consent and submit fit above the fold, plus optionally a body line tied to the night-to-morning story. Needs client copy for the label (a 더 적기-style string, not final copy) and a S10 field-layout decision; if approved, the label goes into src/content/copy.ts and the signup unit wires the disclosure and keeps the draft card in sync. Until then S10 stands.
4. iPhone low-power heuristic (needs client confirmation). WebKit (every iOS and iPadOS browser) reports navigator.hardwareConcurrency as 4 below 8 logical cores and 8 above, so the literal 6.6 rule put every real iPhone on the low-power path (no map tilt, six bubbles only in S2, no film loop or chat autoplay). src/lib/device.ts now treats a 4 on iOS / iPadOS (iPhone, iPad or iPod UA, or a Mac UA with touch points) as unknown; Save-Data, deviceMemory and real core counts elsewhere still count, and the inline js-draw script in src/app/layout.tsx mirrors the rule. iPhones and iPads now get the full path (12 pit bodies, map tilt, film loop, chat autoplay); iOS Low Power Mode still rejects play() and players fall back to posters. Not verified on a real iPhone (Playwright WebKit on the build Mac reads 8). Decision: adopt as the new 6.6 (lowPower = Save-Data, or deviceMemory 4 or less, or hardwareConcurrency 4 or less except a clamped 4 from iOS / iPadOS WebKit) or revert to the literal rule; a pass on an older real iPhone is advised before launch.
5. Higgsfield credit top-up for AI motion plates (needs client decision). Stage 1 spent 10 credits (5 Nano Banana Pro style refs) and left the account at 0 (free plan); Stage 2 has not run. The shipped v2 film is code-built in Remotion around real app footage and cost 0 credits. AI plates need a top-up of about 227 credits for the recommended 720p plan (lean 4s shots about 164, leanest fast 720p about 120, 1080p about 429); a Style #3 pick adds a 2-credit frame-test regen. Decision: top up and run Stage 2, or ship the code-built film. Source: .context/video/stage1.md.
6. App bug seen while filming (agent-uncle app, for the app team). Right after tapping 추가 확보 N장 공유, the form flashes the red error 다른 작업으로 요청이 변경됐어요. 뒤로 돌아가 최신 수량을 확인해 주세요. for about 7 frames (about 0.2s; 06r-acquisition-reply-on 19.50-19.73s, 06-acquisition 21.70-21.90s), then navigates to the updated detail; the share does succeed, so the page likely reacts to its own version bump before it pops. The promo cuts from the pressed button (19.47s) straight to the detail (19.77s); nothing is faked. Action: file a ticket in the agent-uncle repo. Source: .context/app-capture/README.md.
7. App-repo follow-up for the lead table. public.landing_leads was applied to the live Supabase project on 2026-10-12 through the Management API, outside the migration history that the app repo (agent-uncle) owns. The app team copies supabase/migrations/20261011230000_landing_leads.sql into agent-uncle/supabase/migrations/ (optionally renamed to the next 12-digit version, for example 202610110006_landing_leads.sql), then runs supabase db push (the SQL is idempotent) or supabase migration repair --status applied <version>. This repo never runs db push, db reset or migration up against the shared project. See supabase/README.md.

Spec 16 questions 3 (Agent Uncle in JSON-LD) and 4 (tone of the S2 phrases) stay open as written. Engineering items still open at this record, not client decisions (tracked in .context/final/requests-all.json): resting input boundary 1.17:1 against #F5F4EE (WCAG 1.4.11: add a 3:1 border or accept the fill-only style), the nav 사전 신청 CTA while signup is active, long-lived Cache-Control for /media, the film loop HUD (전달 and 수령 roll through values no record produced; 요청 10 · 확보 7 beside the denim 6 / 2), initial JS 107.8 KB gzip against the 85 KB budget (Lighthouse mobile 95), and two lead-action review findings (the timing check returns success without inserting; insert errors log details and hint).
