// Colour handling for the media pipeline.
//
// Every output is BT.709 primaries and BT.709 matrix in limited range, with
// the source's transfer (sRGB for every current source), tagged explicitly,
// so browsers render video frames and the AVIF/WebP stills cut from them with
// the same colours (a <video> poster must not jump when playback starts).
//
// Two kinds of sources need a conversion first:
// - The app capture (.context/app-capture/videos) is tagged Display P3
//   primaries (smpte432) with an sRGB transfer: the simulator recorder works
//   in P3. Colour-managed players convert it to the display; we convert it to
//   sRGB primaries once, at encode time, so non-managed players agree.
// - The Remotion renders (video/out) leave the YUV matrix untagged and were
//   encoded with BT.601 coefficients (verified: the #0C483E field decodes to
//   11,71,62 with BT.601 and 5,64,63 with BT.709). ffmpeg reads an untagged
//   matrix as BT.601 too, so that is the effective input matrix.

const KNOWN_SPACES = new Set(["bt709", "smpte170m", "bt470bg", "smpte240m", "fcc", "bt2020nc", "bt2020ncl"]);
const KNOWN_PRIMARIES = new Set([
  "bt709",
  "bt470m",
  "bt470bg",
  "smpte170m",
  "smpte240m",
  "smpte428",
  "film",
  "smpte431",
  "smpte432",
  "bt2020",
]);
const KNOWN_TRC = new Set([
  "bt709",
  "gamma22",
  "gamma28",
  "smpte170m",
  "smpte240m",
  "linear",
  "iec61966-2-1",
  "iec61966-2-4",
  "bt2020-10",
  "bt2020-12",
]);

/**
 * The colour a source is actually decoded with: its tags where present,
 * otherwise ffmpeg's defaults (BT.601 matrix) and sRGB primaries/transfer.
 * @param {{ colorSpace?: string, colorPrimaries?: string, colorTransfer?: string }} probe
 */
export function effectiveColor(probe) {
  const space = KNOWN_SPACES.has(probe.colorSpace ?? "") ? probe.colorSpace : "smpte170m";
  const primaries = KNOWN_PRIMARIES.has(probe.colorPrimaries ?? "") ? probe.colorPrimaries : "bt709";
  const trc = KNOWN_TRC.has(probe.colorTransfer ?? "") ? probe.colorTransfer : "iec61966-2-1";
  return { space, primaries, trc };
}

/**
 * ffmpeg `colorspace` filter that brings a source to BT.709 matrix and
 * primaries (transfer kept), or null when it already is.
 * @param {{ colorSpace?: string, colorPrimaries?: string, colorTransfer?: string }} probe
 * @returns {string | null}
 */
export function colorFilter(probe) {
  const { space, primaries, trc } = effectiveColor(probe);
  if (space === "bt709" && primaries === "bt709") return null;
  return [
    "colorspace=space=bt709",
    "primaries=bt709",
    `trc=${trc}`,
    "range=tv",
    `ispace=${space}`,
    `iprimaries=${primaries}`,
    `itrc=${trc}`,
    "irange=tv",
  ].join(":");
}

/**
 * Encoder colour tags for an output made from `probe` through colorFilter().
 * @param {{ colorSpace?: string, colorPrimaries?: string, colorTransfer?: string }} probe
 */
export function outputColorArgs(probe) {
  const { trc } = effectiveColor(probe);
  return ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", trc, "-color_range", "tv"];
}

/**
 * Filter chain that decodes a source frame to full-range RGB24 in BT.709,
 * for stills and posters.
 * @param {{ colorSpace?: string, colorPrimaries?: string, colorTransfer?: string }} probe
 * @param {string[]} [before] filters to run first (in the source's YUV)
 */
export function rgbFrameFilter(probe, before = []) {
  const convert = colorFilter(probe);
  return [...before, ...(convert ? [convert] : []), "scale=in_color_matrix=bt709:in_range=tv:out_range=pc", "format=rgb24"].join(
    ",",
  );
}
