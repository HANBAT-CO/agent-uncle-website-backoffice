// Probe Paperlogy glyph contours to locate the ㅇ (ieung) component of a syllable.
import opentype from 'opentype.js';
import fs from 'node:fs';
const [,, fontFile, text] = process.argv;
const buf = fs.readFileSync(fontFile);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log('unitsPerEm', font.unitsPerEm, 'ascender', font.ascender, 'descender', font.descender);
for (const ch of text) {
  const g = font.charToGlyph(ch);
  const p = g.getPath(0, 0, font.unitsPerEm); // y-down, baseline at 0
  const contours = []; let cur = null;
  for (const c of p.commands) {
    if (c.type === 'M') { cur = { pts: [] }; contours.push(cur); }
    if (c.x !== undefined) cur.pts.push([c.x, c.y]);
  }
  console.log(ch, 'advance', g.advanceWidth, 'contours', contours.length);
  contours.forEach((ct, i) => {
    const xs = ct.pts.map(p => p[0]), ys = ct.pts.map(p => p[1]);
    let a = 0; for (let k = 0; k < ct.pts.length; k++) { const [x1,y1]=ct.pts[k],[x2,y2]=ct.pts[(k+1)%ct.pts.length]; a += x1*y2-x2*y1; }
    console.log(`  #${i} x[${Math.min(...xs).toFixed(0)},${Math.max(...xs).toFixed(0)}] y[${Math.min(...ys).toFixed(0)},${Math.max(...ys).toFixed(0)}] area ${(a/2).toFixed(0)}`);
  });
}
