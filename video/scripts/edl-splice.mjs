// Splices the generated tables (scripts/edl-tables.mjs) into .context/video/v2-edl.md, replacing
// §1.1, the frame parts of §1.6, §1.7, §3 and §5, so the doc always matches the render.
//   node scripts/edl-tables.mjs > /tmp/edl-tables.md && node scripts/edl-splice.mjs /tmp/edl-tables.md
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const doc = path.join(root, '..', '.context', 'video', 'v2-edl.md');
const gen = fs.readFileSync(process.argv[2], 'utf8');
let s = fs.readFileSync(doc, 'utf8');

/** text of the generated block that starts at `head` and ends before the next heading in `stops` */
const block = (head, stops) => {
  const i = gen.indexOf(head);
  if (i < 0) throw new Error('generated block missing: ' + head);
  let j = gen.length;
  for (const st of stops) {
    const k = gen.indexOf(st, i + head.length);
    if (k >= 0 && k < j) j = k;
  }
  return gen.slice(i, j).trimEnd() + '\n';
};
/**
 * Replace doc text from `from` (inclusive) up to `to` (exclusive). `from` may list several markers:
 * the earliest one found wins, so a block that begins with generated preamble is replaced whole.
 */
const swap = (from, to, body) => {
  const froms = Array.isArray(from) ? from : [from];
  const hits = froms.map((m) => s.indexOf(m)).filter((k) => k >= 0);
  const i = hits.length ? Math.min(...hits) : -1;
  const j = i < 0 ? -1 : s.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error('doc section missing: ' + froms.join(' | '));
  s = s.slice(0, i) + body + s.slice(j);
};

const f11 = block('### 1.1 Format', ['### 1.6']);
swap('### 1.1 Format', '### 1.2 Palette', f11.replace(' (generated)', '') + '\nEvery segment boundary sits on the 120 bpm grid (15 frames = 1 beat).\n\n');

const hudM = block('### 1.6 HUD frames, Master', ['### 1.6 HUD frames, Social']);
const hudS = block('### 1.6 HUD frames, Social', ['Ledger ticks land']);
const tickNote = block('Ledger ticks land', ['### 1.7']);
// Idempotent (round 5): the generated block starts with its own preamble line, so the swap starts at
// that preamble when it exists (older runs appended a fresh preamble + "**Master**" on every run).
const HUD_PREAMBLE = 'Frame data below is generated from';
swap(
  [HUD_PREAMBLE, '- **Visibility:**'],
  '### 1.7 Audio',
  `${HUD_PREAMBLE} \`video/src/timeline.ts\` by \`video/scripts/edl-tables.mjs\`.\n\n${hudM.replace('### 1.6 HUD frames, Master (generated)', '**Master**')}\n${hudS.replace('### 1.6 HUD frames, Social (generated)', '**Social**')}\n${tickNote}\nThe spinner in S05 does **not** tick the ledger. The 확보 count becomes real only when it is shared, as in the app. The ledger value slots are as wide as the digits they show (no reserved blank after a single digit); the row is anchored at the right margin.\n\n`,
);

const audio = block('### 1.7 Audio frames, master', ['## 3.']);
swap('### 1.7 Audio', '---\n\n## 2.', `### 1.7 Audio\n${audio.split('\n').slice(1).join('\n')}- Every ripple: a click. Every commit: \`switch\`. I2: 7 soft ticks, one per block landing.\n\n`);

swap('## 3. Master 16:9 timeline', '---\n\n## 4.', block('## 3. Master', ['## 5.']) + '\n');
swap('## 5. Social cut 9:16', '---\n\n## 6.', block('## 5. Social', ['\u0000']) + '\n');

const note4 = '> Round 3 note: the per-segment frame numbers in this storyboard are the original plan. §3 and §5 (generated from `timeline.ts`) are authoritative for frames, sources and events.\n\n';
if (!s.includes('> Round 3 note:')) s = s.replace('## 4. Storyboard, segment by segment\n\n', '## 4. Storyboard, segment by segment\n\n' + note4);

fs.writeFileSync(doc, s);
console.log('spliced', doc);
