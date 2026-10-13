// Film rules shared by build-media.mjs and verify-manifest.mjs: which render
// may be used, and how the chapters come out of video/src/timeline.ts.

/** Em dash and en dash (spec: never in visible text). */
const DASHES = /[–—]/;

/**
 * Renders kept from the v1 (persimmon) cut. video/out renamed them with a
 * -v1 suffix when the green v2 renders took the canonical file names.
 * @param {string} name file name
 */
export function isLegacyRender(name) {
  return /-v1(?=[.-])/.test(name);
}

/**
 * @typedef {{ code: "size" | "length" | "fps" | "audio", message: string }} SourceReason
 */

/**
 * Identity gate for a film source: size, length (frame count from the
 * timeline), frame rate and audio. Returns the reasons it fails (empty when
 * it passes). A length that differs from the current timeline is how a v1
 * cut, or a render older than the timeline, is caught under any file name.
 * @param {{ width: number, height: number, frames: number | null, fps: number | null, duration: number, hasAudio: boolean }} probe
 * @param {{ width: number, height: number, frames: number, fps: number, audio: boolean }} expect
 * @returns {SourceReason[]}
 */
export function checkFilmSource(probe, expect) {
  /** @type {SourceReason[]} */
  const reasons = [];
  if (probe.width !== expect.width || probe.height !== expect.height) {
    reasons.push({ code: "size", message: `${probe.width}x${probe.height}, expected ${expect.width}x${expect.height}` });
  }
  if (probe.frames !== null) {
    if (probe.frames !== expect.frames) {
      reasons.push({ code: "length", message: `${probe.frames} frames, expected ${expect.frames} (timeline)` });
    }
  } else if (Math.abs(probe.duration - expect.frames / expect.fps) > 0.2) {
    reasons.push({
      code: "length",
      message: `${probe.duration.toFixed(2)} s, expected ${(expect.frames / expect.fps).toFixed(2)} s (timeline)`,
    });
  }
  if (probe.fps !== null && Math.abs(probe.fps - expect.fps) > 0.01) {
    reasons.push({ code: "fps", message: `${probe.fps} fps, expected ${expect.fps}` });
  }
  if (expect.audio && !probe.hasAudio) reasons.push({ code: "audio", message: "no audio track" });
  return reasons;
}

const round3 = (value) => Math.round(value * 1000) / 1000;

/**
 * Chapters for the film section (spec S9) from the Remotion timeline module:
 * MASTER.chapters with their "00 " prefixes stripped, start = from / FPS.
 * @param {{ FPS: number, MASTER: { total: number, chapters: { from: number, label: string }[] } }} timeline
 * @returns {{ duration: number, chapters: { label: string, start: number }[] }}
 */
export function chaptersFromTimeline(timeline) {
  const { FPS, MASTER } = timeline;
  if (!Number.isFinite(FPS) || FPS <= 0) throw new Error(`timeline FPS is ${FPS}`);
  const duration = round3(MASTER.total / FPS);
  const chapters = MASTER.chapters.map((chapter, index) => {
    const label = chapter.label.replace(/^\d+\s*/, "").trim();
    const start = round3(chapter.from / FPS);
    if (!label) throw new Error(`chapter ${index} has an empty label`);
    if (DASHES.test(label)) throw new Error(`chapter ${index} label contains a dash: ${label}`);
    if (start < 0 || start >= duration) throw new Error(`chapter ${index} starts at ${start}s, outside 0-${duration}s`);
    if (index > 0 && chapter.from <= MASTER.chapters[index - 1].from) {
      throw new Error(`chapter ${index} does not start after chapter ${index - 1}`);
    }
    return { label, start };
  });
  return { duration, chapters };
}

/**
 * ffmpeg `-force_key_frames` value for the chapter starts, so every chapter
 * tick (spec S9) seeks onto an IDR frame and paints at once instead of
 * decoding forward from the GOP's earlier keyframe.
 * @param {{ start: number }[]} chapters
 */
export function chapterKeyframes(chapters) {
  return chapters.map((chapter) => String(chapter.start)).join(",");
}

/**
 * Chapters whose start has no keyframe within half a frame (verify step).
 * @template {{ start: number }} T
 * @param {T[]} chapters
 * @param {number[]} keyframes keyframe times in seconds (ffprobe pts_time)
 * @param {number} fps
 * @returns {T[]}
 */
export function chaptersWithoutKeyframe(chapters, keyframes, fps) {
  const tolerance = 0.5 / fps;
  return chapters.filter((chapter) => !keyframes.some((time) => Math.abs(time - chapter.start) < tolerance));
}
