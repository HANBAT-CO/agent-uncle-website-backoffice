// Child processes: ffmpeg, ffprobe and npx (Remotion), with errors that name
// the command and carry its stderr tail.

import { spawn } from "node:child_process";
import { statSync } from "node:fs";

/**
 * Runs a command without a shell and resolves with its output.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<{ stdout: Buffer, stderr: string }>}
 */
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => {
      reject(new Error(`${command} could not start: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      const stderr = Buffer.concat(err).toString("utf8");
      if (code === 0) {
        resolve({ stdout: Buffer.concat(out), stderr });
        return;
      }
      // tsc and some tools report on stdout; ffmpeg reports on stderr
      const report = stderr.trim() || Buffer.concat(out).toString("utf8").trim();
      const tail = report.split("\n").slice(-12).join("\n");
      const shown = args.map((arg) => (/[\s'"{}]/.test(arg) ? JSON.stringify(arg) : arg)).join(" ");
      reject(new Error(`${command} ${shown}\nexited with ${signal ?? code}${tail ? `\n${tail}` : ""}`));
    });
  });
}

/** ffmpeg with quiet logging, overwrite on, stdin off. */
export function ffmpeg(args, options) {
  return run("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-v", "error", ...args], options);
}

const parseRate = (rate) => {
  if (!rate || rate === "0/0") return null;
  const [num, den] = rate.split("/").map(Number);
  return den ? num / den : num;
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * @typedef {{
 *   file: string, size: number, width: number, height: number, duration: number,
 *   frames: number | null, fps: number | null, videoCodec: string, profile: string | null,
 *   level: number | null, pixFmt: string | null, colorSpace: string | undefined,
 *   colorPrimaries: string | undefined, colorTransfer: string | undefined, colorRange: string | undefined,
 *   hasAudio: boolean, audioCodec: string | null, audioBitRate: number | null
 * }} Probe
 */

/**
 * ffprobe summary of the first video stream and the first audio stream.
 * @param {string} file
 * @returns {Promise<Probe>}
 */
export async function probe(file) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=index,codec_type,codec_name,profile,level,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,duration,color_space,color_primaries,color_transfer,color_range,bit_rate",
    "-of",
    "json",
    file,
  ]);
  const json = JSON.parse(stdout.toString("utf8"));
  const streams = json.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  if (!video) throw new Error(`${file} has no video stream`);
  const fps = parseRate(video.avg_frame_rate) ?? parseRate(video.r_frame_rate);
  const duration = toNumber(json.format?.duration) ?? toNumber(video.duration) ?? 0;
  const frames = toNumber(video.nb_frames);
  const tag = (value) => (value && value !== "unknown" ? value : undefined);
  return {
    file,
    size: statSync(file).size,
    width: video.width,
    height: video.height,
    duration,
    frames,
    fps: fps === null ? null : Math.round(fps * 1000) / 1000,
    videoCodec: video.codec_name,
    profile: video.profile ?? null,
    level: toNumber(video.level),
    pixFmt: video.pix_fmt ?? null,
    colorSpace: tag(video.color_space),
    colorPrimaries: tag(video.color_primaries),
    colorTransfer: tag(video.color_transfer),
    colorRange: tag(video.color_range),
    hasAudio: Boolean(audio),
    audioCodec: audio?.codec_name ?? null,
    audioBitRate: toNumber(audio?.bit_rate),
  };
}

/**
 * Fails early when ffmpeg, ffprobe or a required encoder is missing.
 * @param {string[]} encoders
 */
export async function requireTools(encoders) {
  await run("ffprobe", ["-version"]);
  const { stdout } = await run("ffmpeg", ["-hide_banner", "-encoders"]);
  const list = stdout.toString("utf8");
  const missing = encoders.filter((name) => !new RegExp(`\\s${name}\\s`).test(list));
  if (missing.length > 0) {
    throw new Error(`ffmpeg lacks encoder(s): ${missing.join(", ")}. Install a build with them (brew install ffmpeg).`);
  }
}

/**
 * Keyframe times (seconds) of the first video stream, read without decoding
 * the other frames.
 * @param {string} file
 * @returns {Promise<number[]>}
 */
export async function keyframeTimes(file) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey",
    "-show_entries", "frame=pts_time", "-of", "csv=p=0", file,
  ]);
  return stdout
    .toString("utf8")
    .split("\n")
    .map((line) => Number.parseFloat(line))
    .filter((value) => Number.isFinite(value));
}
