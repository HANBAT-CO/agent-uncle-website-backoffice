/**
 * Media manifest (spec 11). Real app footage and stills only, built by
 * scripts/media/build-media.mjs (WP-03) from .context/app-capture into
 * public/media; scripts/media/verify-manifest.mjs probes every path and size
 * listed here.
 *
 * Placement rule: phone media only in S7 and S8 (story time 09:41 and later),
 * the film only in S9. Every capture shows 9:41 in its status bar.
 */

import filmJson from "./generated/film.json";

export type ImageVariant = { width: number; height: number; avif: string; webp: string };

/**
 * Two widths, smallest first. Typed as an array, not a tuple: film.json carries
 * posters too, and TypeScript infers JSON arrays as T[] (WP-03 request).
 */
export type Poster = { variants: readonly ImageVariant[]; alt: string };

export type AppStillId =
  | "retailerHome0941"
  | "uncleHome0941"
  | "retailerDenimDetailFirst"
  | "uncleHomeFirst"
  | "chatHistoryFirst"
  | "chatHistoryRecords";

export type AppStill = Poster & {
  id: AppStillId;
  /** The 1320x2868 capture it was made from. */
  source: { width: 1320; height: 2868 };
};

export type AppClipId = "retailerDenimDetail" | "uncleHome" | "chatHistory";

export type AppClip = {
  id: AppClipId;
  /** AV1 WebM, listed first in <video>. */
  webm: string;
  /** H.264 High, faststart. */
  mp4: string;
  width: 720;
  height: 1564;
  /** Seconds. */
  duration: number;
  /** The still made from the clip's first frame (the <video poster>). */
  poster: AppStillId;
  /** Accessible description (aria-label on the video). */
  alt: string;
};

export type FilmChapter = { label: string; start: number };

export type FilmFiles = {
  /** 16:9 master with sound, 1920x1080. */
  master1080: string;
  /** 16:9 master with sound, 1280x720 (below 1280px wide). */
  master720: string;
  /** 9:16 social cut with sound, 720x1280 (below 768px wide). */
  social720: string;
  /** Muted brand-palette loop, 1280x720. */
  loop720: string;
  /** Muted brand-palette loop, 1920x1080. */
  loop1080: string;
  /** Last frame of the master. */
  posterEnd: Poster;
  /** Last frame of the 9:16 cut. */
  posterSocialEnd: Poster;
  /** The 16:9 loop at 0.1s: the film's pre-play frame. */
  posterLoop: Poster;
  /** Centre cover crop of the 16:9 loop at 0.1s: the mobile pre-play frame. */
  posterLoopSocial: Poster;
  /** chapter-{i}-480.avif at chapter start + 0.8s, in chapter order. */
  chapterStills: string[];
};

export type Film = {
  /** True only once the audited green v2 renders are encoded (release gate). */
  ready: boolean;
  /** Seconds. */
  duration: number;
  chapters: FilmChapter[];
  files: Partial<FilmFiles>;
};

const STILL_SOURCE = { width: 1320, height: 2868 } as const;

/** Height of a still resized from 1320x2868 to `width`: round(2868 * width / 1320). */
export function stillHeight(width: number): number {
  return Math.round((STILL_SOURCE.height * width) / STILL_SOURCE.width);
}

function variant(base: string, width: number, height: number): ImageVariant {
  return { width, height, avif: `${base}-${width}.avif`, webp: `${base}-${width}.webp` };
}

function still(id: AppStillId, file: string, alt: string): AppStill {
  const base = `/media/app/${file}`;
  return {
    id,
    alt,
    source: STILL_SOURCE,
    variants: [variant(base, 540, stillHeight(540)), variant(base, 1080, stillHeight(1080))],
  };
}

export const APP_STILLS: Readonly<Record<AppStillId, AppStill>> = {
  retailerHome0941: still(
    "retailerHome0941",
    "retailer-home-0941",
    "망원 셀렉트샵 홈 화면: 상대방 확인 대기 1건, 다음 미송 재확인 2026-10-13 와이드 데님 팬츠 남은 미송 4장, 최근 요청",
  ),
  uncleHome0941: still(
    "uncleHome0941",
    "uncle-home-0941",
    "동대문 박삼촌 홈 화면: 업무 중 · 요청 마감 23:30, 지금 확인할 일이 4건 있어요, 오늘 업무, 상대방 확인 대기 1건 와이드 데님 팬츠 연청 · 27 · 답변 필요",
  ),
  retailerDenimDetailFirst: still(
    "retailerDenimDetailFirst",
    "retailer-denim-detail-first",
    "망원 셀렉트샵 홈 화면: 지금 확인할 일이 1건 있어요, 내 사입 현황, 상대방 확인 대기 1건",
  ),
  uncleHomeFirst: still(
    "uncleHomeFirst",
    "uncle-home-first",
    "동대문 박삼촌 홈 화면: 업무 중 · 요청 마감 23:30, 지금 확인할 일이 4건 있어요, 오늘 업무",
  ),
  chatHistoryFirst: still(
    "chatHistoryFirst",
    "chat-history-first",
    "동대문 박삼촌과의 1:1 대화: 업무 기록 카드 아래에 보낼 메시지 ‘셔츠 7장 잘 받았어요! 남은 3장도 부탁드려요’",
  ),
  /** The chat clip's last frame: the night's records, scrolled up (09-chat at 23.0s). */
  chatHistoryRecords: still(
    "chatHistoryRecords",
    "chat-history-records",
    "동대문 박삼촌과의 1:1 대화에 쌓인 업무 기록: 20:31 요청을 수락했어요, 02:16 확보 5개 · 미송 3개 결과를 공유했어요, 03:06 확보 2개 · 미송 4개 결과를 공유했어요, 03:07 데님 연청 27은 2장만 있어서 먼저 챙겼어요, 05:53 2개 전달을 기록했어요",
  ),
};

function clip(id: AppClipId, file: string, duration: number, poster: AppStillId, alt: string): AppClip {
  const base = `/media/app/${file}`;
  return { id, webm: `${base}.webm`, mp4: `${base}.mp4`, width: 720, height: 1564, duration, poster, alt };
}

export const APP_CLIPS: Readonly<Record<AppClipId, AppClip>> = {
  /** 03-request-detail 0-17.62s: home, 사입 tab, denim detail, 처리 이력. */
  retailerDenimDetail: clip(
    "retailerDenimDetail",
    "retailer-denim-detail",
    17.62,
    "retailerDenimDetailFirst",
    "망원 셀렉트샵 앱: 홈에서 사입 탭으로 가 와이드 데님 팬츠 요청을 열고, 답변 필요, 누적 확보 2장, 누적 전달 2장, 남은 미송 4장과 처리 이력을 확인해요",
  ),
  /** 05-uncle-home 0-16.72s. */
  uncleHome: clip(
    "uncleHome",
    "uncle-home",
    16.72,
    "uncleHomeFirst",
    "동대문 박삼촌 앱: 업무 중 · 요청 마감 23:30 홈 화면을 내려 보고 거래처별 업무 탭을 확인해요",
  ),
  /**
   * 09-chat 14.0-23.1s: send, live reply, scroll up through the night's
   * records. It ends on the records (chatHistoryRecords), before the capture
   * goes back to the 채팅 list.
   */
  chatHistory: clip(
    "chatHistory",
    "chat-history",
    9.1,
    "chatHistoryFirst",
    "망원 셀렉트샵과 동대문 박삼촌의 1:1 대화: 메시지를 보내고 답장을 받은 뒤, 위로 올려 밤사이 쌓인 업무 기록 카드 20:31, 02:16, 03:06, 05:53을 확인해요",
  ),
};

function poster(base: string, alt: string, sizes: readonly [[number, number], [number, number]]): Poster {
  return { alt, variants: [variant(base, ...sizes[0]), variant(base, ...sizes[1])] };
}

/** Canonical public paths the media build writes into film.json `files` (spec 11). */
export const FILM_FILES: FilmFiles = {
  master1080: "/media/film/promo-16x9-1080.mp4",
  master720: "/media/film/promo-16x9-720.mp4",
  social720: "/media/film/promo-9x16-720.mp4",
  loop720: "/media/film/loop-720.mp4",
  loop1080: "/media/film/loop-1080.mp4",
  posterEnd: poster("/media/film/poster-end", "사입삼춘 홍보 영상의 마지막 장면", [
    [800, 450],
    [1600, 900],
  ]),
  posterSocialEnd: poster("/media/film/poster-9x16-end", "사입삼춘 홍보 영상의 마지막 장면", [
    [540, 960],
    [1080, 1920],
  ]),
  posterLoop: poster("/media/film/poster-loop", "깊은 초록 격자 배경 위에 요청 10 · 확보 0 · 전달 0 · 수령 0 숫자가 놓인 장면", [
    [800, 450],
    [1600, 900],
  ]),
  posterLoopSocial: poster("/media/film/poster-9x16-loop", "깊은 초록 격자 배경 위에 요청 10 · 확보 0 · 전달 0 · 수령 0 숫자가 세로 화면에 맞게 잘린 장면", [
    [540, 960],
    [1080, 1920],
  ]),
  chapterStills: Array.from({ length: 8 }, (_, index) => `/media/film/chapter-${index}-480.avif`),
};

/** Generated by WP-03 (dev fixture until the green v2 renders pass the colour audit). */
export const FILM: Film = filmJson;

/** srcSet strings for <picture> sources, e.g. sizes "(min-width: 1024px) 300px, 86vw". */
export function srcSets(image: Poster) {
  const [small, large] = image.variants;
  return {
    avif: `${small.avif} ${small.width}w, ${large.avif} ${large.width}w`,
    webp: `${small.webp} ${small.width}w, ${large.webp} ${large.width}w`,
    fallback: large.webp,
    width: large.width,
    height: large.height,
  };
}
