// Generates the EDL tables (§1.1 format, §1.6 HUD, §1.7 audio, §3 master timeline, §5 social cut)
// from src/timeline.ts and the real demo specs (src/segments/MasterDemos.tsx, src/Promo9x16.tsx),
// so the doc and the render always agree.
//   node scripts/edl-tables.mjs > /tmp/edl-tables.md
// The specs are bundled with esbuild (JSX, TS) and only their data is read; nothing is rendered.
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const entry = path.join(os.tmpdir(), 'edl-entry.tsx');
fs.writeFileSync(
  entry,
  `export * as T from ${JSON.stringify(path.join(root, 'src/timeline.ts'))};
export { MASTER_SPECS } from ${JSON.stringify(path.join(root, 'src/segments/MasterDemos.tsx'))};
export { SOCIAL_SPECS } from ${JSON.stringify(path.join(root, 'src/Promo9x16.tsx'))};`,
);
const out = path.join(os.tmpdir(), 'edl-bundle.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  jsx: 'automatic',
  logLevel: 'error',
  loader: { '.json': 'json' },
  external: ['three', '@react-three/*'],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});
const { T, MASTER_SPECS, SOCIAL_SPECS } = await import(out + '?t=' + Date.now());
const { M, MD, V, VD, MASTER, SOCIAL, MASTER_SEGS, SOCIAL_SEGS, COMMIT, VCOMMIT, chapterAt, CHIP_LAND } = T;

const s = (f) => (f / 30).toFixed(1);
const range = (a, b) => `${a}-${b}`;
const fmtSubs = (phone, at0) =>
  phone.subs
    .map((x) => {
      const rate = x.rate ?? 1;
      const end = x.freeze ? x.src : x.src + (x.dur * rate) / 30;
      return `\`${x.clip}\` @ ${x.src.toFixed(2)}${x.freeze ? ' (freeze)' : `-${end.toFixed(2)}`}${rate !== 1 ? ` ×${rate}` : ''} [${at0 + x.from}-${at0 + x.from + x.dur}]`;
    })
    .join(' · ');
const captions = (spec) => (spec.captions ?? []).map((c) => `"${c.lines.join(' ')}"`).join(' → ');
const kinetic = (spec) =>
  (spec.kinetic ?? [])
    .flatMap((k) => k.items.map((it) => `${it.label} / ${it.value}`))
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');
const events = (spec, at0) => {
  const ev = [];
  for (const p of spec.phones) for (const r of p.ripples ?? []) ev.push([at0 + r.at, `ripple f${at0 + r.at}`]);
  for (const c of spec.chips ?? []) ev.push([at0 + c.at, `**commit f${at0 + c.at}** chip "${c.title}"`]);
  return ev.sort((a, b) => a[0] - b[0]).map((e) => e[1]).join(', ');
};

const KIND = {
  S00: 'interstitial', S01: 'title', I1: 'interstitial', I2: 'interstitial', Q6: 'title card', I3: 'interstitial', I5: 'interstitial', S10: 'outro',
  V00: 'interstitial', V01: 'title', V05: 'interstitial', V10: 'interstitial', V12: 'outro',
};
const FIELD = {
  S01: 'deep green', I1: 'deep green', I2: 'deep green', Q6: 'deep green', I3: 'deep green', I5: 'darkest green',
  V01: 'deep green', V05: 'deep green', V10: 'darkest green',
};
const NOTE = {
  S00: 'The problem: scattered chat, photos and memos (dramatised lines, §11 flag 2). Every fragment is pulled into one green dot.',
  S01: 'The dot swells into the green field, "사입삼춘" pops, the mint dot drops into the ㅇ of 입; tagline "사입의 시작부터 수령까지". Off-white bar wipe out (S02 already rising under it).',
  I1: 'Ring ripple: the request leaves the retailer phone and docks on the uncle\'s new-request row; off-white iris out of the uncle phone.',
  I2: 'Iso grid on deep green: 요청 10 → 7 mint blocks rise one per 2.5 frames in rank order (누적 확보 counts 1 to 7, no skip), 3 hollow dashed slots pulse; tag "2026-10-12 미송 재확인 / 남은 미송 3장" tied to the slots by a leader line.',
  Q6: 'Green question card: "남은 미송 3장을 / 어떻게 할까요?" in S06B\'s caption position + 3 dashed hollow slots. Hard cut into S06B (field swap, words stay).',
  I3: '"확보 · 전달 · 수령": the dot (the "·") hops from 확보 to 전달. It is S06B\'s 미송 record: the chip collapses into the dot, which grows into this "·" and is held on the cut (match cut, green on off-white → mint on green).',
  I5: 'The S00 chat returns and locks into a two-strand ribbon whose rungs are the real 업무 기록 lines, then straightens into the chat card column; off-white bar wipe into S09.',
  S10: 'The last phone collapses into the dot; "사입삼춘." lands with the dot as its full stop; "사입 요청부터 상품 수령까지 함께 기록해요."',
  V00: 'As S00, compressed (converge at f40).', V01: 'As S01, stacked, no tagline.', V05: 'As I2 (portrait view, tag below the grid).',
  V10: 'As I5; the ribbon has 5 rungs (no "미송을 기다리기로 했어요": the answer beat is master-only).', V12: 'As S10; wordmark ~770 px wide so the full stop ends at x ≤ 940.',
};

const lines = [];
const P = (x = '') => lines.push(x);

P('### 1.1 Format (generated)');
P();
P('| Deliverable | Comp id | Size | fps | Frames | Duration | Audio |');
P('|---|---|---|---|---|---|---|');
P(`| Master | \`Promo16x9\` | 1920×1080 | 30 | **${MASTER.total}** | **${s(MASTER.total)} s** | bed + sfx |`);
P(`| Social cut | \`Promo9x16\` | 1080×1920 | 30 | **${SOCIAL.total}** | **${s(SOCIAL.total)} s** | bed + sfx |`);
P('| Hero loop | `HeroLoop` (`palette: calm \\| brand`) | 1920×1080 | 30 | **210** | **7.0 s** seamless | muted |');
P();

for (const [name, spec] of [['Master', MASTER], ['Social', SOCIAL]]) {
  P(`### 1.6 HUD frames, ${name} (generated)`);
  P(`- **Visibility:** fades in over frames ${spec.hudIn}-${spec.hudIn + 12} and out over ${spec.hudOut - 4}-${spec.hudOut}.`);
  P(`- **Off-white ink** (dark fields): ${spec.lightInk.map(([a, b]) => `${a}-${b}`).join(', ')}; ink everywhere else.`);
  P(`- **Split ink along field wipes:** ${spec.wipes.map((w) => `${w.kind} ${w.at}-${w.at + w.dur - 1} into ${w.into}`).join('; ')}.`);
  P();
  P('| Frames | HUD chapter |');
  P('|---|---|');
  spec.chapters.forEach((c, i) => P(`| ${c.from}-${(spec.chapters[i + 1]?.from ?? spec.total) - 1} | ${c.label} |`));
  P();
  P('| Ledger tick | Value |');
  P('|---|---|');
  spec.ledger.forEach((l) => P(`| f${l.at} | ${l.key} 0→${l.value} |`));
  (spec.pending ?? []).forEach((l) => P(`| f${l.at} | ${l.key} dim ${l.value} (pending until its tick) |`));
  P();
}
P(`Ledger ticks land when the chip's dot arrives (commit + ${CHIP_LAND} frames; S07's chip leaves early so 전달 ticks on the cut into S08); 요청 ticks on the commit itself. A pending value (확보 7 once the I2 grid shows it) is drawn dim and turns solid in place on its tick.`);
P();

P('### 1.7 Audio frames, master (generated)');
P(`- Bed: \`D=${s(MASTER.total)} START=${s(M.S02)} END=${s(M.S10 + 15)} HIT=${s(M.S10 + 15)} OUT=public/audio/bed-master.wav sh scripts/make-bed.sh\` (kick and bass from f${M.S02} to f${M.S10 + 15}).`);
P(`- Social bed unchanged: \`D=${s(SOCIAL.total)}\`.`);
P(`- Field swaps: whip at f${M.S01} (green), f${M.S05 + T.S05_SWAP} (S05 turns green on the 7th +; I2 opens on the same field), f${M.Q6} (Q6), f${M.I3} (I3); whoosh at f${M.I1}, f${M.I5}, f${M.S10}; ding at f${M.S10 + 21} (the full stop).`);
P();

P(`## 3. Master 16:9 timeline (${s(MASTER.total)} s, ${MASTER.total} frames, generated from timeline.ts)`);
P();
P('| # | t (s) | Frames | Kind | Field | HUD | Footage (file @ in-out, rate) [out frames] | Captions → kinetic | Events | Meaning |');
P('|---|---|---|---|---|---|---|---|---|---|');
let footage = 0;
for (const [id, dur] of MASTER_SEGS) {
  const at = M[id];
  const spec = MASTER_SPECS[id];
  const hud = at < MASTER.hudIn ? 'hidden' : chapterAt(MASTER, at).label;
  if (spec) {
    footage += dur;
    const foot = spec.phones.map((p) => `${p.name}: ${fmtSubs(p, at)}`).join('<br>');
    const kin = kinetic(spec);
    P(`| ${id} | ${s(at)}-${s(at + dur)} | ${range(at, at + dur)} | demo (${spec.phones.length === 1 ? 'single' : 'two phones'}) | off-white | ${hud} | ${foot} | ${captions(spec)}${kin ? `<br>kinetic: ${kin}` : ''} | ${events(spec, at)} | ${NOTE[id] ?? ''} |`);
  } else {
    P(`| ${id} | ${s(at)}-${s(at + dur)} | ${range(at, at + dur)} | ${KIND[id] ?? 'demo'} | ${FIELD[id] ?? 'off-white'} | ${hud} | none | | | ${NOTE[id] ?? ''} |`);
  }
}
P();
P(`Real footage on screen (demo segments): **${s(footage)} s of ${s(MASTER.total)} s (${Math.round((footage / MASTER.total) * 100)} %)**. First footage frame: f${M.S02 - 4} (S02 rises under the S01 wipe; ${s(M.S02)} s).`);
P(`Commit frames (local): ${Object.entries(COMMIT).map(([k, v]) => `${k} ${v} (f${M[k] + v})`).join(' · ')}.`);
P();

P(`## 5. Social cut 9:16 (${s(SOCIAL.total)} s, ${SOCIAL.total} frames, 1080×1920, generated from timeline.ts)`);
P();
P('**Layout (round 4):** phone screen 571×1240 centred (540, 1080), device top y 440. Caption block y 224-358. Role label y 388 until the commit, then the 업무 기록 chip docks there (centred, 0.82 scale, y 366-441) while the device steps down 26 px, and flies to the HUD ledger. Punch-ins never lift the device top above y 440 (top clamp; no clip band). Platform safe zone: no ROI below y 1600, nothing within 140 px of the right edge.');
P();
P('| # | Frames | t (s) | Kind | Field | HUD | Footage [out frames] | Caption | Events | Notes |');
P('|---|---|---|---|---|---|---|---|---|---|');
for (const [id, dur] of SOCIAL_SEGS) {
  const at = V[id];
  const spec = SOCIAL_SPECS[id];
  const hud = at < SOCIAL.hudIn ? 'hidden' : chapterAt(SOCIAL, at).label;
  if (spec) {
    const foot = spec.phones.map((p) => fmtSubs(p, at)).join('<br>');
    P(`| ${id} | ${range(at, at + dur)} | ${s(at)}-${s(at + dur)} | demo | off-white | ${hud} | ${foot} | ${captions(spec)} | ${events(spec, at)} | ${NOTE[id] ?? ''} |`);
  } else {
    P(`| ${id} | ${range(at, at + dur)} | ${s(at)}-${s(at + dur)} | ${KIND[id] ?? ''} | ${FIELD[id] ?? 'off-white'} | ${hud} | none | | | ${NOTE[id] ?? ''} |`);
  }
}
P();
P(`Commit frames (local): ${Object.entries(VCOMMIT).map(([k, v]) => `${k} ${v} (f${V[k] + v})`).join(' · ')}.`);
console.log(lines.join('\n'));
