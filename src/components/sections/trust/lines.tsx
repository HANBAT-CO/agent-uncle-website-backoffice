import { Fragment } from "react";

const SENTENCE_END = /(?<=[.?!]) /;
const PHRASE_END = /(?<=[.,?!]) /;

const GLUE_PHRASES = [
  "다시 시도해 주세요",
  "연결 상태",
  "답변이 전달돼요",
  "상대방과 협의 후",
  "상대방이 확인한 뒤",
  "받지 않을게요",
  "확정할 수 있어요",
] as const;

export function sentenceLines(text: string): string[] {
  return text.split(SENTENCE_END);
}

export function phraseParts(text: string): string[] {
  return text.split(PHRASE_END);
}

function GluedText({ text }: { text: string }) {
  const parts: Array<{ text: string; glue: boolean }> = [];
  let rest = text;

  while (rest.length > 0) {
    const next = GLUE_PHRASES.reduce<{ phrase: string; index: number } | null>((best, phrase) => {
      const index = rest.indexOf(phrase);
      if (index < 0) return best;
      if (!best || index < best.index) return { phrase, index };
      return best;
    }, null);

    if (!next) {
      parts.push({ text: rest, glue: false });
      break;
    }
    if (next.index > 0) parts.push({ text: rest.slice(0, next.index), glue: false });
    parts.push({ text: next.phrase, glue: true });
    rest = rest.slice(next.index + next.phrase.length);
  }

  return parts.map((part, index) =>
    part.glue ? (
      <span key={`${part.text}-${index}`} className="whitespace-nowrap">
        {part.text}
      </span>
    ) : (
      <Fragment key={`${part.text}-${index}`}>{part.text}</Fragment>
    ),
  );
}

export function SentenceBlocks({ text }: { text: string }) {
  return sentenceLines(text).map((line, part) => (
    <Fragment key={line}>
      {part > 0 ? " " : null}
      <span className="block text-balance">
        <GluedText text={line} />
      </span>
    </Fragment>
  ));
}

export function PhraseSpans({ text }: { text: string }) {
  return phraseParts(text).map((phrase, part) => (
    <Fragment key={phrase}>
      {part > 0 ? " " : null}
      <span className="inline-block text-balance">
        <GluedText text={phrase} />
      </span>
    </Fragment>
  ));
}
