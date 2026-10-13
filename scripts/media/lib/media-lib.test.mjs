// Unit tests for the pure parts of the media pipeline.
//
//   node --test 'scripts/media/**/*.test.mjs'
//
// Covers the colour-audit classifier (spec 11 thresholds), the colour
// conversion filter chosen for each source, the film source identity gate,
// the chapter mapping from video/src/timeline.ts and the chapter keyframes
// (every chapter tick seeks onto an IDR frame).

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUDIT, classifyPixel, countBanned, frameFails, rgbToHsv } from "./color-audit.mjs";
import { colorFilter, effectiveColor } from "./color.mjs";
import { chapterKeyframes, chaptersFromTimeline, chaptersWithoutKeyframe, checkFilmSource, isLegacyRender } from "./film.mjs";

const hex = (value) => {
  const n = Number.parseInt(value.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

describe("rgbToHsv", () => {
  it("converts primaries and greys", () => {
    assert.deepEqual(rgbToHsv(255, 0, 0), { h: 0, s: 1, v: 1 });
    assert.deepEqual(rgbToHsv(0, 255, 0), { h: 120, s: 1, v: 1 });
    assert.deepEqual(rgbToHsv(0, 0, 255), { h: 240, s: 1, v: 1 });
    assert.deepEqual(rgbToHsv(128, 128, 128), { h: 0, s: 0, v: 128 / 255 });
    assert.deepEqual(rgbToHsv(0, 0, 0), { h: 0, s: 0, v: 0 });
  });

  it("keeps hue in [0, 360)", () => {
    const { h } = rgbToHsv(...hex("#E42939"));
    assert.ok(h >= 350 && h < 360, `hue ${h}`);
  });
});

describe("classifyPixel (spec 4.1 and 11 banned ranges)", () => {
  it("flags the banned brand-adjacent colours", () => {
    assert.equal(classifyPixel(...hex("#E8572E")), "orange");
    assert.equal(classifyPixel(...hex("#FF5B35")), "orange");
    assert.equal(classifyPixel(...hex("#D9704F")), "orange");
    assert.equal(classifyPixel(...hex("#FEE500")), "orange");
    assert.equal(classifyPixel(...hex("#C6FF3A")), "lime");
  });

  it("passes every palette colour of the site and the film", () => {
    for (const ok of [
      "#07231C",
      "#093A32",
      "#0C483E",
      "#2E8C6B",
      "#B6D7C2",
      "#D9E9DC",
      "#F2FFE8",
      "#EDECE3",
      "#F5F4EE",
      "#E4E3DA",
      "#D7D7D7",
      "#101010",
      "#636363",
      "#FFFFFF",
    ]) {
      assert.equal(classifyPixel(...hex(ok)), null, ok);
    }
  });

  it("leaves the app's real red to the pixel rule (hue outside 8-60)", () => {
    assert.equal(classifyPixel(...hex("#E42939")), null);
    assert.equal(classifyPixel(...hex("#D22030")), null);
  });

  it("uses inclusive hue bounds and strict saturation and value bounds", () => {
    // hue exactly 8 and 60 count; just outside does not
    assert.equal(classifyPixel(255, 34, 0), "orange"); // h = 8
    assert.equal(classifyPixel(255, 255, 0), "orange"); // h = 60
    assert.equal(classifyPixel(255, 30, 0), null); // h ~ 7.06
    // dark or washed-out oranges are not banned
    assert.equal(classifyPixel(80, 40, 10), null); // v ~ 0.31
    assert.equal(classifyPixel(240, 200, 170), null); // s ~ 0.29
    // lime needs s > 0.5 and v > 0.6
    assert.equal(classifyPixel(170, 220, 120), null); // s ~ 0.45
    assert.equal(classifyPixel(130, 150, 40), null); // v ~ 0.59
    assert.equal(classifyPixel(160, 230, 40), "lime");
  });

  it("does not flag hues between the two ranges", () => {
    assert.equal(classifyPixel(230, 240, 40), null); // h ~ 63
  });
});

describe("countBanned and frameFails", () => {
  const pixels = (list, channels = 3) => {
    const data = new Uint8Array(list.length * channels);
    list.forEach((rgb, i) => {
      data.set(rgb, i * channels);
      if (channels === 4) data[i * channels + 3] = 255;
    });
    return data;
  };

  it("counts orange and lime pixels separately, for RGB and RGBA buffers", () => {
    const list = [hex("#E8572E"), hex("#C6FF3A"), hex("#0C483E"), hex("#E8572E")];
    assert.deepEqual(countBanned(pixels(list), 3), { orange: 2, lime: 1 });
    assert.deepEqual(countBanned(pixels(list, 4), 4), { orange: 2, lime: 1 });
  });

  it("fails a frame only above the pixel budget (orange and lime combined)", () => {
    assert.equal(AUDIT.maxPixels, 100);
    assert.equal(frameFails({ orange: 100, lime: 0 }), false);
    assert.equal(frameFails({ orange: 60, lime: 40 }), false);
    assert.equal(frameFails({ orange: 101, lime: 0 }), true);
    assert.equal(frameFails({ orange: 51, lime: 50 }), true);
  });
});

describe("colour conversion per source", () => {
  it("treats an untagged matrix as BT.601, as ffmpeg decodes it (Remotion renders)", () => {
    const remotion = { colorSpace: "unknown", colorPrimaries: "bt709", colorTransfer: "iec61966-2-1" };
    assert.deepEqual(effectiveColor(remotion), { space: "smpte170m", primaries: "bt709", trc: "iec61966-2-1" });
    assert.equal(
      colorFilter(remotion),
      "colorspace=space=bt709:primaries=bt709:trc=iec61966-2-1:range=tv:ispace=smpte170m:iprimaries=bt709:itrc=iec61966-2-1:irange=tv",
    );
  });

  it("converts Display P3 simulator footage to sRGB primaries", () => {
    const capture = { colorSpace: "bt709", colorPrimaries: "smpte432", colorTransfer: "iec61966-2-1" };
    assert.equal(
      colorFilter(capture),
      "colorspace=space=bt709:primaries=bt709:trc=iec61966-2-1:range=tv:ispace=bt709:iprimaries=smpte432:itrc=iec61966-2-1:irange=tv",
    );
  });

  it("needs no conversion for BT.709 sources", () => {
    assert.equal(colorFilter({ colorSpace: "bt709", colorPrimaries: "bt709", colorTransfer: "iec61966-2-1" }), null);
    assert.equal(colorFilter({ colorSpace: "bt709", colorPrimaries: "bt709", colorTransfer: "bt709" }), null);
  });

  it("assumes BT.709 primaries and an sRGB transfer when untagged", () => {
    assert.deepEqual(effectiveColor({}), { space: "smpte170m", primaries: "bt709", trc: "iec61966-2-1" });
  });
});

describe("film source gate", () => {
  const master = { width: 1920, height: 1080, frames: 1620, fps: 30, duration: 54.016, hasAudio: true };
  const expect = { width: 1920, height: 1080, frames: 1620, fps: 30, audio: true };

  it("accepts a render that matches the v2 timeline", () => {
    assert.deepEqual(checkFilmSource(master, expect), []);
  });

  it("rejects the v1 cut by its frame count", () => {
    const v1 = { ...master, frames: 555, duration: 18.517 };
    assert.deepEqual(checkFilmSource(v1, expect), [{ code: "length", message: "555 frames, expected 1620 (timeline)" }]);
  });

  it("falls back to the duration when the container has no frame count", () => {
    assert.deepEqual(checkFilmSource({ ...master, frames: null, duration: 54.1 }, expect), []);
    assert.deepEqual(checkFilmSource({ ...master, frames: null, duration: 52 }, expect), [
      { code: "length", message: "52.00 s, expected 54.00 s (timeline)" },
    ]);
  });

  it("rejects wrong size, frame rate and missing audio", () => {
    const wrong = { ...master, width: 1080, height: 1920, fps: 25, hasAudio: false };
    assert.deepEqual(
      checkFilmSource(wrong, expect).map((reason) => reason.code),
      ["size", "fps", "audio"],
    );
    assert.deepEqual(
      checkFilmSource(wrong, expect).map((reason) => reason.message),
      ["1080x1920, expected 1920x1080", "25 fps, expected 30", "no audio track"],
    );
  });

  it("never lets a muted loop carry audio requirements", () => {
    const loop = { width: 1920, height: 1080, frames: 210, fps: 30, duration: 7, hasAudio: false };
    assert.deepEqual(checkFilmSource(loop, { width: 1920, height: 1080, frames: 210, fps: 30, audio: false }), []);
  });

  it("recognises renamed v1 files", () => {
    assert.equal(isLegacyRender("agent-uncle-promo-16x9-v1.mp4"), true);
    assert.equal(isLegacyRender("agent-uncle-hero-loop-v1.mp4"), true);
    assert.equal(isLegacyRender("agent-uncle-promo-v2-16x9.mp4"), false);
    assert.equal(isLegacyRender("agent-uncle-promo-16x9.mp4"), false);
  });
});

describe("chaptersFromTimeline", () => {
  it("strips the number prefix and converts frames to seconds", () => {
    const timeline = {
      FPS: 30,
      MASTER: {
        total: 1620,
        chapters: [
          { from: 0, label: "00 연결" },
          { from: 225, label: "01 요청" },
          { from: 717, label: "04 미송" },
        ],
      },
    };
    assert.deepEqual(chaptersFromTimeline(timeline), {
      duration: 54,
      chapters: [
        { label: "연결", start: 0 },
        { label: "요청", start: 7.5 },
        { label: "미송", start: 23.9 },
      ],
    });
  });

  it("rejects chapters that are out of order or past the end", () => {
    const timeline = {
      FPS: 30,
      MASTER: {
        total: 300,
        chapters: [
          { from: 0, label: "00 연결" },
          { from: 400, label: "01 요청" },
        ],
      },
    };
    assert.throws(() => chaptersFromTimeline(timeline), /chapter 1/);
  });
});

describe("chapter keyframes", () => {
  const chapters = [
    { label: "연결", start: 0 },
    { label: "요청", start: 6.8 },
    { label: "수락", start: 13.3 },
  ];

  it("lists every chapter start for ffmpeg -force_key_frames", () => {
    assert.equal(chapterKeyframes(chapters), "0,6.8,13.3");
  });

  it("finds chapter starts with no keyframe within half a frame", () => {
    const keyframes = [0, 1.966667, 5.966667, 13.3, 15.3];
    assert.deepEqual(chaptersWithoutKeyframe(chapters, keyframes, 30), [{ label: "요청", start: 6.8 }]);
  });

  it("accepts a keyframe rounded by the container time base", () => {
    assert.deepEqual(chaptersWithoutKeyframe(chapters, [0, 6.800011, 13.299989], 30), []);
  });

  it("does not accept the neighbouring frame", () => {
    assert.deepEqual(chaptersWithoutKeyframe([{ label: "요청", start: 6.8 }], [6.8 + 1 / 30], 30), [{ label: "요청", start: 6.8 }]);
  });
});
