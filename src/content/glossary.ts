/**
 * App vocabulary with one-line meanings (spec S2 vocabulary pills and 5.3
 * plate tooltips). The same glossary powers both: a word means the same thing
 * in the 23:30 pit and in the record plate.
 */

export type VocabTerm = "누적 확보" | "전달 대기" | "남은 미송" | "재확인일" | "회차" | "처리 이력";

/** S2 vocabulary pills: caption shown while the pill is held or focused. */
export const VOCAB: ReadonlyArray<{ term: VocabTerm; gloss: string }> = [
  { term: "누적 확보", gloss: "사입삼촌이 지금까지 실제로 챙긴 수량이에요." },
  { term: "전달 대기", gloss: "확보했지만 아직 넘기지 않은 수량이에요." },
  { term: "남은 미송", gloss: "아직 못 챙겨서 다시 확인할 수량이에요." },
  { term: "재확인일", gloss: "미송을 다시 확인하기로 한 날이에요." },
  { term: "회차", gloss: "한 요청을 나눠서 전달한 차례예요." },
  { term: "처리 이력", gloss: "누가 언제 무엇을 바꿨는지 전후가 함께 남아요." },
];

export function glossFor(term: VocabTerm): string {
  const entry = VOCAB.find((item) => item.term === term);
  if (!entry) throw new Error(`No gloss for ${term}`);
  return entry.gloss;
}

export type PlateField = "requested" | "secured" | "delivered" | "received" | "backorder" | "unconfirmed";

/** Record plate tooltips (hover and keyboard focus), keyed like copy.plate.labels. */
export const PLATE_TOOLTIPS: Readonly<Record<PlateField, string>> = {
  requested: "소매업자가 요청한 수량이에요.",
  secured: "사입삼촌이 실제로 챙긴 누적 수량이에요.",
  delivered: "실제로 넘긴 누적 수량이에요.",
  received: "소매업자가 받은 것으로 확인한 수량이에요.",
  backorder: "아직 못 챙겨서 재확인일에 다시 확인할 수량이에요.",
  unconfirmed: "사입삼촌이 아직 결과를 공유하지 않은 수량이에요.",
};
