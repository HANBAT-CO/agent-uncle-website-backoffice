/**
 * Every visible string on the landing page, verbatim from
 * docs/superpowers/specs/2026-10-11-landing-design.md section 7 (sections),
 * 5 (chrome) and 10 (form). Strings marked [app] in the spec are the app's own
 * words: never paraphrase them. Headings are arrays of lines (line breaks by
 * meaning); join them with a space where a single line is wanted.
 *
 * Rules (enforced by src/content/content.test.ts):
 * - zero em dashes and zero en dashes; ranges use a hyphen
 * - middle dots only inside app formats ({상품} · {옵션}, 업무 기록 · HH:MM, ...)
 * - never 푸시, 결제, 정산, 인증된 or 출시일 (spec 2, truth model)
 * - weight 800 is only for strings in DISPLAY_800, weight 900 only for
 *   DISPLAY_900: those faces are subsets (npm run fonts:display regenerates them)
 *
 * This file is loaded by scripts/fonts/display-text.mjs through Node type
 * stripping: keep it free of value imports, path aliases and enums.
 *
 * Templates use {name} slots; fill them with fill() below.
 */

/** Replace {name} slots in a template. Unknown slots are left as written. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (slot: string, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : slot,
  );
}

/** Nav anchors (spec 3.1). The CTA label is the page's one label for the signup intent. */
export const nav = {
  label: "페이지 이동",
  brand: "사입삼춘",
  skip: "본문으로 건너뛰기",
  links: [
    { label: "흐름", href: "#route" },
    { label: "역할", href: "#roles" },
    { label: "신뢰", href: "#trust" },
    { label: "영상", href: "#film" },
  ],
  cta: { label: "사전 신청", href: "#signup" },
} as const;

/** Building labels are DOM, never inside the map SVG (spec 4.8). Order as in the hero chip row. */
export const map = {
  buildings: {
    diot: "디오트",
    cheongpyeonghwa: "청평화",
    nampyeonghwa: "남평화",
    apm: "APM",
  },
  order: ["diot", "cheongpyeonghwa", "nampyeonghwa", "apm"],
  /** Text equivalent of the drawn map (spec 14), built only from strings on this page. */
  caption: "디오트, 청평화, 남평화, APM. 청평화 1층 가-17 데님하우스에 와이드 데님 팬츠 · 연청 · 27 요청 6장이 있어요.",
} as const;

export const hero = {
  /** Desktop: 2 lines. */
  h1: ["사입 요청부터 상품 수령까지", "함께 기록해요."],
  /** Below 768px: 3 lines at 30px. */
  h1Mobile: ["사입 요청부터", "상품 수령까지", "함께 기록해요."],
  sub: "사입삼춘은 소매업자와 사입삼촌이 요청, 확보, 미송, 전달, 수령을 함께 기록하는 사입 관리 앱이에요.",
  ctaPrimary: { label: "사전 신청", href: "#signup" },
  ctaSecondary: { label: "영상 보기", href: "#film" },
  uncle: { name: "동대문 박삼촌", chip: "업무 중 · 요청 마감 23:30" },
  honesty: "지도 속 거래처와 수량은 데모 데이터예요.",
  /** Lens readouts [app list format, seeded demo data]: place / item / shop · request / status. */
  lens: {
    cheongpyeonghwa: {
      place: "데님하우스 · 청평화 1층 가-17",
      item: "와이드 데님 팬츠 · 연청 · 27",
      request: "망원 셀렉트샵 · 요청 6장",
      status: "진행 중",
    },
    apm: {
      place: "니트공방 · APM 럭스 4층 413",
      item: "코튼 크롭 가디건 · 오트밀 · FREE",
      request: "망원 셀렉트샵 · 요청 8장",
      status: "진행 중",
    },
    nampyeonghwa: {
      place: "백스토리 · 남평화 3층 12호",
      item: "캔버스 토트백 · 내추럴",
      request: "성수 오브젝트 · 요청 15장",
      status: "확인 대기",
    },
    diot: {
      place: "베이직랩 · 디오트 1층 A-03",
      item: "골지 반팔 티셔츠 · 화이트 · FREE",
      request: "망원 셀렉트샵 · 요청 20장",
      status: "완료",
    },
  },
  /** Mobile chip row (role radiogroup) label. */
  chipsLabel: "상가 선택",
} as const;

export const words = {
  h2: ["‘확인했어요’는", "수락이 아니에요."],
  body: "채팅 한마디가 수락이나 수령으로 오해되지 않게, 사입삼춘은 수락, 전달, 수령 확인을 서로 다른 버튼으로 기록해요.",
  caption: "예시 대화예요.",
  /** Phrase bubbles (app 'theirs' bubble). '…' is the empty bubble: no reply. */
  bubbles: ["확인했어요", "3장 보냈어요", "2장밖에 안 왔는데요", "남은 건 언제 와요?", "그거 바꾸기로 했잖아요", "…"],
  /** Vocabulary pills; their captions live in src/content/glossary.ts (VOCAB). */
  vocab: ["누적 확보", "전달 대기", "남은 미송", "재확인일", "회차", "처리 이력"],
  /** Mobile pit keeps two pills. */
  vocabMobile: ["누적 확보", "재확인일"],
  /** Left: the phrase (dimmed, quoted). Right: the real control (action) or record [app]. */
  ledger: [
    { phrase: "‘확인했어요’", token: "요청 수락", kind: "action" },
    { phrase: "‘3장 보냈어요’", token: "실제 전달한 수량 기록", kind: "action" },
    { phrase: "‘2장밖에 안 왔는데요’", token: "상품이나 수량이 달라요", kind: "record" },
    { phrase: "‘남은 건 언제 와요?’", token: "2026-10-13 미송 재확인", kind: "record" },
    { phrase: "‘그거 바꾸기로 했잖아요’", token: "상대방에게 확인 요청", kind: "action" },
    {
      phrase: "‘…’",
      /** Read instead of the bare ellipsis, which screen readers skip. */
      srPhrase: "답이 없는 채팅",
      token: "미송 4장 기다리기 확정",
      kind: "action",
      note: "답이 없다고 동의한 게 아니에요.",
    },
  ],
  /** Visually hidden text standing in for the arrow between phrase and token, by token kind. */
  arrowAction: "대신 앱에서 누르는 버튼:",
  arrowRecord: "대신 앱에 남는 기록:",
  closing: "대화는 대화로 남고, 업무는 버튼으로 기록돼요.",
} as const;

export const route = {
  h2: ["상가를 돌며,", "확보한 만큼 기록해요."],
  /** Captions A to D (spec S3), all present in the DOM in order. Records come from RECORDS. */
  stops: [
    {
      id: "A",
      quote: "‘밤 10시부터 새벽 5시까지 픽업해요.’",
      attribution: "동대문 박삼촌 프로필",
      caption: "초대 코드를 주고받으면 요청과 대화를 시작할 수 있어요.",
    },
    {
      id: "B",
      time: "02:16",
      place: "니트공방 · APM 럭스 4층 413",
      /** The request this record belongs to (app list format; the hero lens's APM item). */
      item: hero.lens.apm.item,
      tag: "확보 5 · 미송 3",
      caption: "요청마다 숫자가 따로 쌓여요.",
      record: "r0216",
    },
    {
      id: "C",
      time: "03:06",
      place: "데님하우스 · 청평화 1층 가-17",
      item: hero.lens.cheongpyeonghwa.item,
      tag: "확보 2 · 미송 4",
      caption: "이번에 추가로 확보한 수량을 더해서 공유해요.",
      record: "r0306",
    },
    {
      id: "D",
      time: "03:07",
      caption: "대화는 숫자를 바꾸지 않아요.",
      record: "m0307",
    },
  ],
  /** The route map's text equivalent opens with this; the two stops and their results follow. */
  mapCaption: "박삼촌이 APM에 들렀다가 청평화로 간 길이에요.",
} as const;

export const cart = {
  h2: ["확보는 확보대로,", "미송은 날짜와 함께."],
  body: "찾은 만큼 먼저 확보로 기록하고, 남은 수량은 재확인일과 사유를 붙여 미송으로 남겨요. 재확인일이 지나면 사입삼촌의 알림함에 ‘미송을 재확인해 주세요’가 떠요.",
  readout: {
    /** Rest (the recorded truth). */
    rest: "확보 2 · 미송 4",
    /** While exploring (grey). */
    explore: "확보 {secured} · 미송 {backorder}",
    sub: "요청 6장",
    note: "미리 보기예요. 기록은 확보 2 · 미송 4 그대로예요.",
  },
  figureCaption: "손수레 위 봉투는 확보, 걸린 봉투는 아직 미송이에요.",
  /** Stage aria-label, updated on settle. */
  figureLabel: "손수레 위 봉투 {secured}개는 확보, 걸린 봉투 {backorder}개는 미송",
  /** [app] mint card */
  mintCard: {
    title: "2026-10-13 미송 재확인",
    body: "확보한 상품은 먼저 전달할 수 있어요. 남은 미송의 처리 방법을 답변해 주세요.",
    /** Bound phrases of the body that never break inside (spec 4.2, line breaks by meaning). Each is verbatim in body. */
    bodyPhrases: ["전달할 수 있어요.", "남은 미송의", "처리 방법을", "답변해 주세요."],
  },
  /** [app] retailer home card; the last line follows the explored value in grey. */
  homeCard: {
    title: "다음 미송 재확인",
    date: "2026-10-13",
    item: "와이드 데님 팬츠",
    backorder: "남은 미송 4장",
    backorderExplore: "남은 미송 {backorder}장",
  },
  stepper: {
    label: "확보 수량 미리 보기",
    decrement: "확보 수량 줄이기",
    increment: "확보 수량 늘리기",
  },
} as const;

export const dawn = {
  h2: ["전달은 회차로 기록해요."],
  body: "실제로 물품을 전달한 뒤 전달한 수량만 기록해요. 같은 배송지로 가는 요청은 한 번에 기록하고, 남은 수량은 전달할 목록에 유지돼요.",
  /** Paper object in the app's dialog format, seeded numbers. Buttons are inert. */
  confirm: {
    title: "물품을 전달했나요?",
    body: "2개 요청, 총 7개 전달을 기록해요. 소매업자의 수령 확인은 별도로 진행돼요.",
    cancel: "취소",
    confirm: "확인",
    groupLabel: "전달 확인 예시",
  },
  /** Demo profile note. */
  destination: {
    /** Accessible name of the destination card [app word]. */
    groupLabel: "배송지",
    name: "망원 셀렉트샵",
    address: "서울 마포구 포은로 82 1층",
    note: "오전 11시 오픈 전 매장 앞 보관함",
  },
  /** Honesty line (spec 0.6: the 05:53 batch and the shop note are seed-only demo data). */
  demo: "매장과 수량은 데모 데이터예요.",
  ruler: {
    /** Hour labels; ticks run every hour from 20 to 11. */
    labels: ["20", "22", "00", "02", "04", "06", "08", "10"],
    marks: ["20:05", "20:31", "02:16", "03:06", "05:53"],
    active: { label: "1차 · 05:53", quantity: "2장" },
    next: { label: "다음 회차", quantity: "남은 미송 4장" },
    /** Accessible name of the two-slot row (a scroll-snap row below 1024px) [app label]. */
    slotsLabel: "전달 회차",
  },
} as const;

export const receipt = {
  h2: ["전달과 수령은 따로 확인해요."],
  body: "사입삼촌이 전달을 기록해도, 소매업자가 받은 수량을 직접 확인해야 수령으로 남아요. 수량이 다르면 바로 문제로 열려요.",
  /** [app] strings with the denim numbers. */
  slip: {
    title: "상품 수령 확인",
    heading: "이번에 받은 2장이 맞나요?",
    card: ["동대문 박삼촌 · 와이드 데님 팬츠", "연청 · 27 · 전체 받을 수량 6장"],
    batchesLabel: "전달 회차",
    /** One row, two columns. quantityConfirmed replaces quantity once the stub is torn [app label]. */
    batch: { round: "1차 · 10월 11일 05:53", quantity: "2장 · 이번 확인", quantityConfirmed: "2장 · 수령 확인됨" },
    rows: [
      { label: "누적 전달", value: "2장" },
      { label: "남은 미송", value: "4장" },
    ],
    mint: {
      title: "상품·옵션·수량을 비교해 주세요",
      body: "이번 전달분만 확인해요. 남은 미송과 다른 전달분은 계속 확인할 수 있어요.",
    },
    issue: "상품이나 수량이 달라요",
    /** Replaces the issue row once torn: a delivery is confirmed only once [app]. */
    issueClosed: "이미 확인한 전달분이에요. 차이는 문제 알리기를 이용해 주세요.",
    stub: "2장 수령 확인",
    badge: "수령 확인",
  },
  /** Sample branch; never written to the log. */
  whatIf: {
    label: "예시예요. 실제 기록에는 남지 않아요.",
    field: "실제 받은 수량",
    /** Label of the app's optional reason field; shown whenever the sample is open. */
    helper: "수량 차이 설명 (일치하면 선택)",
    /** With a difference the reason becomes required [app]. */
    reasonRequired: "수량 차이의 상황을 입력해 주세요.",
    ghost: "수령 수량 차이를 알렸어요: 실제 {actual}개 · 기록 2개",
    steps: ["문제 확인 중", "조치 완료 · 해결 확인 대기", "해결 확인"],
    stepArrow: "→",
    resolver: "해결은 소매업자만 확인할 수 있어요.",
    note: "차이를 해결하기 전에는 요청이 완료되지 않아요.",
    back: "돌아가기",
  },
} as const;

export const roles = {
  h2: ["같은 요청, 각자의 할 일."],
  body: "같은 와이드 데님 팬츠가 소매업자 홈에는 ‘다음 미송 재확인’으로, 사입삼촌 홈에는 ‘상대방 확인 대기’로 보여요. 기록은 하나, 할 일은 각자예요.",
  retailer: {
    role: "소매업자",
    line: "사입을 요청하고 받은 상품을 확인해요.",
    caption: "망원 셀렉트샵의 홈",
    play: "기록 열어 보기",
  },
  uncle: {
    role: "사입삼촌",
    line: "요청을 받아 상품을 확보하고 전달해요.",
    caption: "동대문 박삼촌의 홈",
    play: "홈 화면 재생",
  },
  pause: "멈춤",
  footnote:
    "초대 코드로 연결한 거래처끼리만 요청과 대화를 주고받아요. 역할은 가입할 때 한 번 고르고, 가입 후 역할 변경은 제공하지 않아요.",
  mediaCaption: "실제 앱 화면이에요. 데모 데이터로 촬영했어요.",
  seam: {
    label: "소매업자 화면과 사입삼촌 화면 나누기",
    valueText: "소매업자 화면 {percent}퍼센트",
  },
  /** Mobile segmented control. */
  toggle: { label: "역할별 화면", options: ["소매업자", "사입삼촌"] },
} as const;

export const trust = {
  h2: ["같은 숫자를 함께 봐요."],
  /** Lines by meaning (spec 4.2): one sentence per line at every width; wraps only at a comma. */
  lead: ["앱과 서버가 숫자를 함께 확인해요.", "받은 수량이 전달보다, 전달이 확보보다 많아질 수 없어요."],
  context: "와이드 데님 팬츠 · 연청 · 27 · 요청 6장 · 남은 미송 {backorder}장",
  equation: {
    received: "수령",
    delivered: "전달",
    secured: "확보",
    leq: "≤",
    /** Role tags under the numerals. */
    tags: { received: "소매업자가 확인", delivered: "사입삼촌이 기록", secured: "사입삼촌이 기록" },
    /** [app] stepper labels */
    steppers: { received: "수령 확인", delivered: "누적 전달", secured: "누적 확보" },
    increment: "{label} 늘리기",
    decrement: "{label} 줄이기",
    /** Screen readers only, after an allowed press or the reset: 누적 확보 3장. */
    announce: "{label} {count}장",
    announceReset: "기록한 숫자로 되돌렸어요.",
  },
  sample: "예시예요. 이 페이지 안에서만 바뀌어요.",
  reset: "기록한 숫자로 되돌리기",
  /** [app] refusals, one per illegal move. */
  refusals: {
    securedUp: "확보·전달·수령·취소 수량을 다시 확인해 주세요.",
    securedDown: "누적 확보 수량을 줄이려면 오류 정정을 이용해 주세요.",
    deliveredUp: "전달 가능한 수량을 넘을 수 없어요.",
    deliveredDown: "원래 기록과 정정 사유를 남기고 상대방이 확인한 뒤 반영해요.",
    receivedUp: "수령 수량은 전달 수량보다 클 수 없어요.",
    receivedDown: "이미 확인한 전달분이에요. 차이는 문제 알리기를 이용해 주세요.",
  },
  proposal: {
    h3: "취소는 상대가 확인해야 확정돼요.",
    retailerPane: "망원 셀렉트샵 화면",
    question: "남은 미송 4장을 어떻게 할까요?",
    rows: [
      { label: "확보 완료", value: "2장" },
      { label: "남은 미송", value: "4장" },
    ],
    note: "기다리기를 확정하면 사입삼촌에게 답변이 전달돼요. 취소는 상대방과 협의 후 확정돼요.",
    wait: "미송 4장 기다리기 확정",
    cancel: "미송 취소 요청",
    /**
     * [app] The counterpart pane before a cancel: 동대문 박삼촌's home at 09:41
     * (10-uncle-home.png, table 0.6). After 기다리기 only the product line
     * stays (no uncle-side 미송 대기 string is verified), dimmed.
     */
    counterpartIdle: {
      status: "상대방 확인 대기",
      product: "와이드 데님 팬츠",
      option: "연청 · 27",
      reply: "답변 필요",
    },
    waitOutcome: {
      badge: "확정",
      title: "미송을 기다리기로 했어요",
      chip: "예시",
    },
    cancelOutcome: {
      status: "취소 · 상대 확인 대기",
      ledger: "요청 6 · 확보 2 · 전달 2 · 수령 2 · 취소 {cancelled}",
      quantity: "이번 취소 수량 4장",
      reasonLabel: "사유·협의할 처리 방법",
      reason: "남은 미송 4장은 이번에는 받지 않을게요. (예시)",
      withdraw: "제안 철회",
      confirmDisabled: "상대방이 확인해야 확정할 수 있어요.",
      showReplay: "확정되는 과정 보기",
    },
    /** Counterpart pane, non-interactive; never writes to the rail. */
    replay: {
      pane: "동대문 박삼촌 화면",
      confirm: "취소 내용 확인·확정",
      reject: "제안 거절",
      sheetTitle: "협의한 내용을 확정할까요?",
      sheetBody: "변경 전후 내용과 수량을 확인해 주세요. 확정 후 최신 기록에 반영돼요.",
      status: "취소 · 확정",
      done: "완료",
      doneLine: "요청 처리를 마쳤어요.",
      log: "협의한 변경·취소·정정을 확정했어요",
      restart: "처음으로",
    },
  },
  chatCaption: "1:1 대화에는 업무 기록 카드가 메시지와 따로 쌓여요.",
  /**
   * Under the chat device (spec 0.4, 2 rules 3 and 6): frames the shirt records
   * as this morning's next request in the same chat, and the footage honesty
   * line (S7's, reworded into one sentence). One sentence per line at every width.
   */
  chatContext: ["재생하면 09:37부터 같은 대화에 이어진 셔츠 요청이 나와요.", "실제 앱 화면을 데모 데이터로 촬영했어요."],
  /** Play label of the chat device (same register as S7 홈 화면 재생). */
  chatPlay: "대화 재생",
  /** 처리 이력 strip: these records, oldest left, titles from RECORDS. */
  history: {
    /** [app] the request detail's section title, then the app-format product line. */
    label: "처리 이력",
    item: "와이드 데님 팬츠 · 연청 · 27",
    records: ["r2005", "r2031", "r0306", "r0553a", "r0849"],
    /** Spec S8 verbatim. */
    caption: "고친 기록도 덮어쓰지 않고 정정으로 남겨요.",
  },
  /**
   * Proof index: each item is the claim, the app's own string (quote) and the
   * site's one-line explanation (body). 두 번 생기지 않아요 carries the demo,
   * whose offline error is its app string.
   */
  proof: [
    {
      title: "덮어쓰지 않아요",
      quote: "‘다른 작업으로 내용이 변경됐어요. 최신 내용을 확인하고 다시 시도해 주세요.’",
      body: "보고 있던 기록이 그사이 바뀌면 저장하지 않아요. 그래서 늘 최신 숫자를 보고 기록해요.",
    },
    { title: "두 번 생기지 않아요", body: "연결이 끊겨 다시 보내도 같은 요청은 한 번만 남아요." },
    {
      title: "혼자 고칠 수 없어요",
      quote: "‘다른 계정의 기록을 덮어쓸 수 없어요.’",
      body: "고칠 때는 원래 기록과 사유를 남기고, 상대방이 확인해야 반영돼요.",
    },
    { title: "쓰던 내용이 남아요", quote: "‘초안은 나만 볼 수 있어요.’", body: "보내기 전 요청은 입력하는 동안 자동으로 저장돼요." },
  ],
  idempotency: {
    switch: "연결 끊기",
    send: "요청 보내기",
    attempts: "보낸 횟수 {count}번",
    saved: "저장된 요청 {count}건",
    offline: "서버에 연결하지 못했어요. 입력을 유지했으니 연결 상태를 확인하고 다시 시도해 주세요.",
  },
} as const;

export const film = {
  h2: ["요청부터 수령까지,", "영상으로 봐요."],
  /** Same label as the hero secondary CTA (one label per intent). */
  play: "영상 보기",
  soundOn: "소리 켜기",
  soundOff: "소리 끄기",
  pause: "멈춤",
  fullscreen: "전체 화면으로 보기",
  chaptersLabel: "영상 구간",
  /** From video/src/timeline.ts MASTER.chapters (number prefixes stripped); FILM.chapters is authoritative. */
  chapters: ["연결", "요청", "수락", "확보", "미송", "전달", "수령", "기록"],
  /** Visually hidden after each tick label, so a tick reads 수락 구간부터 보기, not the app action 수락. */
  chapterAction: "구간부터 보기",
  /** Alt of the end poster: the outro card's own words (shown only right after the film ends). */
  posterAlt: "사입삼춘. 사입 요청부터 상품 수령까지 함께 기록해요.",
  /** The muted loop's own pause (WCAG 2.2.2), the accessible name of the icon button on the frame. */
  loopPause: "미리보기 멈춤",
  loopPlay: "미리보기 재생",
  caption: "영상 속 화면은 실제 앱 화면이에요. 매장과 상품은 예시 데이터예요.",
  details: {
    summary: "영상 내용",
    /**
     * Follows the v2 film (S06B: 남은 미송 3장을 어떻게 할까요? → 미송 3장 기다리기 확정, 미송 대기),
     * which postdates spec S9's string. Every fact is an app string in the footage.
     * The last sentence is the soundtrack (video/src/components/Soundtrack.tsx: a percussion bed
     * and sound effects, no speech), so readers know there is nothing to caption.
     */
    body: "망원 셀렉트샵이 오버핏 셔츠 10장을 요청하고, 동대문 박삼촌이 수락해 7장을 확보해요. 남은 미송 3장은 2026-10-12에 다시 확인하기로 하고, 소매업자는 미송을 기다리기로 답해요. 7장 전달과 수령 확인까지 1:1 대화에 업무 기록으로 쌓여요. 영상에는 대사 없이 음악과 효과음만 나와요.",
  },
} as const;

export const signup = {
  h2: ["사전 신청과", "도입 문의를 받아요."],
  body: "역할과 연락처를 남겨 주시면 사입삼춘 소식과 도입 안내를 전해 드릴게요.",
  /** [app] */
  autosave: "입력한 정보는 자동으로 저장돼요.",
  /** [app] */
  roleLegend: "어떤 일을 하고 계신가요?",
  roles: {
    retailer: { title: "소매업자", line: "사입을 요청하고 받은 상품을 확인해요." },
    uncle: { title: "사입삼촌", line: "요청을 받아 상품을 확보하고 전달해요." },
    other: { title: "기타", line: "도입이나 제휴를 문의해요." },
  },
  fields: {
    name: { label: "이름·담당자명" },
    /** Label by role; `short` is the draft card's line label. */
    business: {
      retailer: { label: "매장명·쇼핑몰명 (선택)", short: "매장명·쇼핑몰명" },
      uncle: { label: "활동명·업체명 (선택)", short: "활동명·업체명" },
      other: { label: "회사·단체명 (선택)", short: "회사·단체명" },
    },
    contact: {
      label: "연락처",
      helper: "전화번호나 이메일을 적어 주세요.",
      toEmail: "이메일로 입력",
      toPhone: "전화번호로 입력",
    },
    market: { label: "사입 시장 (선택)", options: ["동대문", "남대문", "기타"] },
    message: { label: "문의 내용 (선택)", helper: "도입 시기, 거래처 수처럼 궁금한 점을 적어 주세요." },
  },
  /** The business-name length error, named after the label on screen (every `short` ends in 명, so 은). */
  businessTooLong: "{label}은 80자까지 입력할 수 있어요.",
  submit: "사전 신청",
  pending: "보내는 중",
  again: "다시 신청하기",
  /** Draft card in the rail (or the side card at 1024-1279px). Lines read "{label}: {value}". */
  draft: {
    meta: "신청 기록 · 지금",
    title: "사전 신청 작성 중",
    line: "{label}: {value}",
    labels: { role: "역할", contact: "연락처", market: "사입 시장" },
    empty: "선택 전",
  },
  success: {
    meta: "신청 기록 · {time}",
    title: "사전 신청을 보냈어요",
    line: "남겨 주신 연락처로 안내드릴게요.",
  },
  /** [app] network failure (offline, rejected action, stale action id after one retry). */
  networkError: "서버에 연결하지 못했어요. 입력을 유지했으니 연결 상태를 확인하고 다시 시도해 주세요.",
} as const;

export const footer = {
  /** The period is the dot (QuantityDot ink lands in it). */
  wordmark: "사입삼춘",
  /** The wordmark's two lines below 768px and on screens 500px tall or less (사입 / 삼춘.); joined they are `wordmark`. */
  wordmarkLines: ["사입", "삼춘"],
  period: ".",
  /** [app one-liner] */
  line: "사입 요청부터 상품 수령까지 함께 기록해요.",
  /** [app] callback card */
  callback: {
    title: "다음 미송 재확인",
    date: "2026-10-13",
    item: "와이드 데님 팬츠",
    backorder: "남은 미송 4장",
  },
  visitLog: { heading: "이 페이지에서 남긴 기록" },
  linksLabel: "페이지 바로가기",
  links: [
    { label: "흐름", href: "#route" },
    { label: "역할", href: "#roles" },
    { label: "신뢰", href: "#trust" },
    { label: "영상", href: "#film" },
    { label: "사전 신청", href: "#signup" },
  ],
} as const;

/** Record chrome (spec 5.2 to 5.4). */
export const plate = {
  /** aside landmark name and the record rail's name. */
  label: "업무 기록",
  skip: "업무 기록으로 건너뛰기",
  item: "와이드 데님 팬츠 · 연청 · 27",
  labels: {
    requested: "요청",
    secured: "확보",
    delivered: "전달",
    received: "수령",
    backorder: "남은 미송",
    unconfirmed: "미확인",
  },
  unit: "장",
  geq: "≥",
  /** Clock label in the signup section (visitor's local time). */
  now: "지금",
  /** Visually hidden summary; {rest} is 남은 미송 or 미확인. */
  summary: "와이드 데님 팬츠 기록: 요청 {requested}장, 확보 {secured}장, 전달 {delivered}장, 수령 {received}장, {rest} {restValue}장.",
  recordMeta: "업무 기록 · {time}",
  signupMeta: "신청 기록 · {time}",
  sampleChip: "예시",
  pill: {
    summary: "확보 {secured} · 남은 미송 {backorder}",
    /** Before 03:06 nothing is shared yet, so the rest is 미확인. */
    summaryUnconfirmed: "확보 {secured} · 미확인 {unconfirmed}",
    count: "기록 {count}",
    /** Footer rail mode (min 1280px). */
    open: "업무 기록 {count}",
  },
  sheet: { close: "닫기" },
} as const;

/** Paperlogy 800 display subset: the H1 lines and every H2 (spec 4.2). */
export const DISPLAY_800: readonly string[] = [
  ...hero.h1,
  ...hero.h1Mobile,
  ...words.h2,
  ...route.h2,
  ...cart.h2,
  ...dawn.h2,
  ...receipt.h2,
  ...roles.h2,
  ...trust.h2,
  ...film.h2,
  ...signup.h2,
];

/** Paperlogy 900 display subset: the footer wordmark and the equation numerals. */
export const DISPLAY_900: readonly string[] = [
  `${footer.wordmark}${footer.period}`,
  "0123456789",
  trust.equation.leq,
  plate.unit,
];
