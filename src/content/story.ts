/**
 * The night the page tells: one real request (와이드 데님 팬츠 · 연청 · 27, 요청 6)
 * from 망원 셀렉트샵 to 동대문 박삼촌, read off the app capture on 2026-10-12.
 *
 * Source of truth: docs/superpowers/specs/2026-10-11-landing-design.md
 * - table 0.6 (data audit): every record title, day and time below
 * - table 3.3 (story engine): beats, clocks, phases, ledgers, records added
 * - table 3.4 (chrome mode per section)
 *
 * Pure data, no imports with side effects. Sections never write chrome state;
 * they report beats (src/lib/story/use-story.ts) and the chrome derives the
 * rest (src/lib/story/derive.ts).
 */

export type SectionId =
  | "hero"
  | "words"
  | "route"
  | "cart"
  | "dawn"
  | "receipt"
  | "roles"
  | "trust"
  | "film"
  | "signup"
  | "footer";

export type BeatId = "b2200" | "b2330" | "b0216" | "b0306" | "b0307" | "b0553" | "b0553d" | "b0849" | "b0941" | "bnow";

export type RecordId = "r2005" | "r2031" | "r0216" | "r0306" | "m0307" | "r0553a" | "r0553b" | "r0849";

export type DenimStatus = "진행 중" | "답변 필요" | "미송 대기";

/** The denim request's numbers at a beat. Exactly one of unconfirmed / backorder is set. */
export type Ledger = {
  requested: number;
  secured: number;
  delivered: number;
  received: number;
  /** 미확인: before the uncle shares any result (요청 - 확보 while nothing is shared). */
  unconfirmed: number | null;
  /** 남은 미송: 요청 - 확보 once a result is shared. */
  backorder: number | null;
  status: DenimStatus;
};

export type Phase = "night" | "day";

export type Beat = {
  id: BeatId;
  /** HH:MM, or "now" for bnow (the consumer renders the visitor's local time). */
  clock: string;
  phase: Phase;
  ledger: Ledger;
  /** Records that appear at this beat (cumulative with every earlier beat). */
  adds: RecordId[];
};

export type StoryRecord = {
  id: RecordId;
  /** record = 업무 기록 card, message = chat bubble (never moves the ledger). */
  kind: "record" | "message";
  day: "10월 10일" | "10월 11일";
  time: string;
  title: string;
  detail?: string;
  request: "denim" | "cardigan";
  /** True only for records that change the denim ledger (mint outline on enter). */
  movesLedger: boolean;
  /** Section where the record happens; rail cards scroll there. */
  section: SectionId;
};

export type RailMode = "open" | "spine" | "hidden" | "pill";
export type PlateMode = "full" | "compact" | "hidden";
export type PillMode = "show" | "hidden";

export type SectionChrome = { rail: RailMode; plate: PlateMode; pill: PillMode };

export const DENIM_LABEL = "와이드 데님 팬츠 · 연청 · 27";

export const SECTION_ORDER = [
  "hero",
  "words",
  "route",
  "cart",
  "dawn",
  "receipt",
  "roles",
  "trust",
  "film",
  "signup",
  "footer",
] as const satisfies readonly SectionId[];

export const BEAT_ORDER = [
  "b2200",
  "b2330",
  "b0216",
  "b0306",
  "b0307",
  "b0553",
  "b0553d",
  "b0849",
  "b0941",
  "bnow",
] as const satisfies readonly BeatId[];

const OPEN: Ledger = {
  requested: 6,
  secured: 0,
  delivered: 0,
  received: 0,
  unconfirmed: 6,
  backorder: null,
  status: "진행 중",
};

const SECURED: Ledger = {
  requested: 6,
  secured: 2,
  delivered: 0,
  received: 0,
  unconfirmed: null,
  backorder: 4,
  status: "답변 필요",
};

const DELIVERED: Ledger = { ...SECURED, delivered: 2 };

const RECEIVED: Ledger = { ...DELIVERED, received: 2 };

export const BEATS: Readonly<Record<BeatId, Beat>> = {
  b2200: { id: "b2200", clock: "22:00", phase: "night", ledger: OPEN, adds: ["r2005", "r2031"] },
  b2330: { id: "b2330", clock: "23:30", phase: "night", ledger: OPEN, adds: [] },
  b0216: { id: "b0216", clock: "02:16", phase: "night", ledger: OPEN, adds: ["r0216"] },
  b0306: { id: "b0306", clock: "03:06", phase: "night", ledger: SECURED, adds: ["r0306"] },
  b0307: { id: "b0307", clock: "03:07", phase: "night", ledger: SECURED, adds: ["m0307"] },
  b0553: { id: "b0553", clock: "05:53", phase: "night", ledger: DELIVERED, adds: ["r0553a", "r0553b"] },
  b0553d: { id: "b0553d", clock: "05:53", phase: "day", ledger: DELIVERED, adds: [] },
  b0849: { id: "b0849", clock: "08:49", phase: "day", ledger: RECEIVED, adds: ["r0849"] },
  b0941: { id: "b0941", clock: "09:41", phase: "day", ledger: RECEIVED, adds: [] },
  bnow: { id: "bnow", clock: "now", phase: "day", ledger: RECEIVED, adds: [] },
};

/** Verbatim app strings (table 0.6). Middle dots are part of the app format. */
export const RECORDS: Readonly<Record<RecordId, StoryRecord>> = {
  r2005: {
    id: "r2005",
    kind: "record",
    day: "10월 10일",
    time: "20:05",
    title: "새 사입 요청을 보냈어요",
    request: "denim",
    movesLedger: false,
    section: "hero",
  },
  r2031: {
    id: "r2031",
    kind: "record",
    day: "10월 10일",
    time: "20:31",
    title: "요청을 수락했어요",
    request: "denim",
    movesLedger: false,
    section: "hero",
  },
  r0216: {
    id: "r0216",
    kind: "record",
    day: "10월 11일",
    time: "02:16",
    title: "확보 5개 · 미송 3개 결과를 공유했어요",
    detail: "오트밀 3장은 아침 입고분으로 다시 확인해요.",
    request: "cardigan",
    movesLedger: false,
    section: "route",
  },
  r0306: {
    id: "r0306",
    kind: "record",
    day: "10월 11일",
    time: "03:06",
    title: "확보 2개 · 미송 4개 결과를 공유했어요",
    detail: "연청 27은 월요일 재입고 예정이에요.",
    request: "denim",
    movesLedger: true,
    section: "route",
  },
  m0307: {
    id: "m0307",
    kind: "message",
    day: "10월 11일",
    time: "03:07",
    title: "데님 연청 27은 2장만 있어서 먼저 챙겼어요. 남은 4장은 월요일 재입고래요.",
    request: "denim",
    movesLedger: false,
    section: "route",
  },
  r0553a: {
    id: "r0553a",
    kind: "record",
    day: "10월 11일",
    time: "05:53",
    title: "2개 전달을 기록했어요",
    request: "denim",
    movesLedger: true,
    section: "dawn",
  },
  r0553b: {
    id: "r0553b",
    kind: "record",
    day: "10월 11일",
    time: "05:53",
    title: "5개 전달을 기록했어요",
    request: "cardigan",
    movesLedger: false,
    section: "dawn",
  },
  r0849: {
    id: "r0849",
    kind: "record",
    day: "10월 11일",
    time: "08:49",
    title: "2개 수령을 확인했어요",
    request: "denim",
    movesLedger: true,
    section: "receipt",
  },
};

/** Beat a section stands for until it reports one of its own (spec 3.3). */
export const SECTION_DEFAULT_BEAT: Readonly<Record<SectionId, BeatId>> = {
  hero: "b2200",
  words: "b2330",
  route: "b2330",
  cart: "b0307",
  dawn: "b0307",
  receipt: "b0553d",
  roles: "b0941",
  trust: "b0941",
  film: "b0941",
  signup: "bnow",
  footer: "bnow",
};

const NIGHT_CHROME: SectionChrome = { rail: "open", plate: "full", pill: "show" };

/** Chrome mode per section (spec 3.4). The rail only exists at min 1280px. */
export const SECTION_CHROME: Readonly<Record<SectionId, SectionChrome>> = {
  hero: NIGHT_CHROME,
  words: NIGHT_CHROME,
  route: NIGHT_CHROME,
  cart: NIGHT_CHROME,
  dawn: NIGHT_CHROME,
  receipt: NIGHT_CHROME,
  roles: { rail: "spine", plate: "compact", pill: "show" },
  trust: { rail: "spine", plate: "hidden", pill: "hidden" },
  film: { rail: "hidden", plate: "hidden", pill: "hidden" },
  signup: { rail: "open", plate: "full", pill: "hidden" },
  footer: { rail: "pill", plate: "hidden", pill: "hidden" },
};
