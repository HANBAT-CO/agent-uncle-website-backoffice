// QA (round 6): per-segment 9:16 camera log: scale, device top, lift fade and the y of a bottom CTA (94 %).
//   node scripts/zoom-log.mjs $(pwd)
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = process.argv[2];
fs.writeFileSync(path.join(os.tmpdir(), 'zoom-entry.tsx'), `export { SOCIAL_SPECS } from ${JSON.stringify(root + '/src/Promo9x16.tsx')};
export * as T from ${JSON.stringify(root + '/src/timeline.ts')};
export { camAt, nudgeAt, liftFadeAt, placeAt, stageShift } from ${JSON.stringify(root + '/src/components/Stage.tsx')};
export { deviceBounds, phoneDims } from ${JSON.stringify(root + '/src/components/Phone.tsx')};
export { P } from ${JSON.stringify(root + '/src/layout.ts')};`);
await build({ entryPoints: [path.join(os.tmpdir(), 'zoom-entry.tsx')], bundle: true, platform: 'node', format: 'esm', outfile: path.join(os.tmpdir(), 'zoom-bundle.mjs'), jsx: 'automatic', logLevel: 'error', loader: { '.json': 'json' }, external: ['three', '@react-three/*'], banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" } });
const { SOCIAL_SPECS, T, camAt, nudgeAt, liftFadeAt, placeAt, stageShift, deviceBounds, phoneDims, P } = await import(path.join(os.tmpdir(), 'zoom-bundle.mjs') + '?' + Date.now());
const MIN_TOP = P.SINGLE.cy - phoneDims(P.SINGLE.h).devH / 2;
for (const [seg, spec] of Object.entries(SOCIAL_SPECS)) {
  const ph = spec.phones[0];
  const rows = [];
  let minS = 9, minAt = -1;
  for (let f = 0; f < T.VD[seg]; f++) {
    const place = placeAt(f, ph.place, ph.placeMoves);
    if ((place.o ?? 1) < 0.99) continue;
    const cam = camAt(f, ph.cams, ph.cam);
    const sh = stageShift(place, cam, undefined, MIN_TOP);
    const dy = nudgeAt(f, spec.nudges);
    const b = deviceBounds(place, cam);
    const top = b.top + (sh?.y ?? 0) + dy;
    const { h, bezel } = phoneDims(place.h);
    const scr = top + bezel * cam.s;
    const y94 = scr + 0.94 * h * cam.s;
    rows.push({ f, s: cam.s, top: Math.round(top), fade: +liftFadeAt(f, spec.nudges).toFixed(2), cta94: Math.round(y94) });
    if (cam.s < minS) { minS = cam.s; minAt = f; }
  }
  const first = rows[0];
  const after0 = rows.filter((r) => r.f > first.f);
  const minAfter = Math.min(...after0.map((r) => r.s));
  // frames below 1.25 after the first visible frame (push-in frames from a 1.0 match cut)
  const below = after0.filter((r) => r.s < 1.249).map((r) => `${r.f}:${r.s.toFixed(2)}`);
  const changes = rows.filter((r, i) => i === 0 || Math.abs(r.s - rows[i - 1].s) > 1e-3 || Math.abs(r.top - rows[i - 1].top) > 3 || r.fade !== rows[i - 1].fade).map((r) => `f${T.V[seg] + r.f}(l${r.f}) s${r.s.toFixed(2)} top${r.top} fade${r.fade}`);
  console.log(`${seg}: first visible l${first.f} s=${first.s.toFixed(2)}; min after first = ${minAfter.toFixed(2)}; push frames <1.25: ${below.join(' ') || 'none'}`);
  console.log('   ' + changes.filter((_, i) => i < 14).join(' | '));
}
