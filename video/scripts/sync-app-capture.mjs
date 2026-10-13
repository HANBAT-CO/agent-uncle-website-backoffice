// Copies the real app screen recordings (.context/app-capture/videos/*_1080w30.mp4)
// into public/app/rec/<clip>.mp4 at full 1080 width (punch-ins go up to 1.8x),
// re-encoded with a keyframe every 10 frames so OffthreadVideo seeks fast,
// and extracts the freeze-frame stills used by the I1 interstitial.
//   node scripts/sync-app-capture.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.resolve(root, '../.context/app-capture/videos');
const DST = path.join(root, 'public/app/rec');
const STILLS = path.join(root, 'public/app/still');

const CLIPS = [
  '02-retailer-home',
  '04-new-request',
  '05-uncle-home',
  '06-acquisition',
  '06a-retailer-accepted',
  '06r-acquisition-reply-on',
  '06b-retailer-backorder-reply',
  '07-delivery',
  '08-receipt',
  '08b-uncle-delivery-history',
  '09-chat',
  '09r-chat',
  '09u-uncle-chat-reply',
  '10-partners',
];

// [clip, seconds, name]
const FREEZES = [
  ['04-new-request', 38.0, 'retailer-sent'],
  ['06-acquisition', 1.17, 'uncle-new-request'],
];

fs.mkdirSync(DST, { recursive: true });
fs.mkdirSync(STILLS, { recursive: true });
const media = {};
for (const clip of CLIPS) {
  const file = path.join(SRC, `${clip}_1080w30.mp4`);
  if (!fs.existsSync(file)) {
    console.log(`missing ${clip}`);
    continue;
  }
  const dst = path.join(DST, `${clip}.mp4`);
  if (!fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(file).mtimeMs) {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-c:v', 'libx264', '-crf', '15', '-preset', 'medium', '-g', '10', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', dst]);
  }
  const seconds = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst]).toString().trim(),
  );
  media[clip] = { src: `app/rec/${clip}.mp4`, seconds: Math.round(seconds * 100) / 100 };
  console.log(clip, seconds.toFixed(2));
}
for (const [clip, t, name] of FREEZES) {
  const file = path.join(SRC, `${clip}_1080w30.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-q:v', '2', path.join(STILLS, `${name}.jpg`)]);
}
fs.mkdirSync(path.join(root, 'src/generated'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/generated/app-media.json'), JSON.stringify(media, null, 2) + '\n');
console.log('wrote src/generated/app-media.json with', Object.keys(media).length, 'clips');
