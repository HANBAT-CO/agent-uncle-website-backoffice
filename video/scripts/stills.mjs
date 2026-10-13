// Bundle once, render many stills, tile them into a labelled contact sheet.
//   node scripts/stills.mjs <compId> <frames comma list or a-b/step> <outName> [scale=0.35] [cols=6]
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [, , compId = 'Promo16x9', framesArg = '0', outName = 'sheet', scaleArg = '0.35', colsArg = '6'] = process.argv;
const scale = Number(scaleArg);
const cols = Number(colsArg);
let frames = [];
for (const part of framesArg.split(',')) {
  const m = part.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (m) for (let f = +m[1]; f <= +m[2]; f += +m[3]) frames.push(f);
  else frames.push(Number(part));
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'out', 'stills', outName);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public'), rspack: true });
const inputProps = process.env.PROPS ? JSON.parse(process.env.PROPS) : {};
const composition = await selectComposition({ serveUrl, id: compId, inputProps, chromiumOptions: { gl: 'angle' } });
frames = frames.filter((f) => f < composition.durationInFrames);
const files = [];
const concurrency = 5;
for (let i = 0; i < frames.length; i += concurrency) {
  await Promise.all(
    frames.slice(i, i + concurrency).map(async (frame) => {
      const output = path.join(outDir, `f_${String(frame).padStart(4, '0')}.jpg`);
      await renderStill({ composition, serveUrl, output, frame, scale, imageFormat: 'jpeg', jpegQuality: 85, inputProps, chromiumOptions: { gl: 'angle' } });
      files[frames.indexOf(frame)] = output;
    }),
  );
}
// (this ffmpeg build has no drawtext; frames are tiled in the order given)
const labelled = files;
const rows = Math.ceil(labelled.length / cols);
const inputs = labelled.flatMap((f) => ['-i', f]);
const w = Math.round(composition.width * scale);
const h = Math.round(composition.height * scale);
const GAP = 6;
const layout = labelled.map((_, i) => `${(i % cols) * (w + GAP)}_${Math.floor(i / cols) * (h + GAP)}`).join('|');
const sheet = path.join(root, 'out', 'stills', `${outName}.jpg`);
if (labelled.length === 1) fs.copyFileSync(labelled[0], sheet);
else execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', `xstack=inputs=${labelled.length}:layout=${layout}:fill=white`, sheet]);
console.log('sheet', sheet, `${cols}x${rows}`);
