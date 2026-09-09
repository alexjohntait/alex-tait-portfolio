/* Knock a flat background out of the site logo.
 *
 * The logo comes off Airtable as whatever was attached, and an export with a
 * flat backdrop — busker.png arrived 100% opaque on rgb(235,235,235) — shows
 * up as a grey tile sitting on the white page. Rather than asking for a
 * particular export every time, take the background out on the way in.
 *
 * Flood-filled from the BORDER inwards, never a global colour swap: a mark
 * that uses the same grey inside its own drawing keeps it, because that
 * region is not connected to the edge.
 *
 * Two thresholds, so antialiased edges do not come out jagged: within HARD of
 * the background the pixel goes fully transparent, and between HARD and SOFT
 * it keeps a proportional alpha.
 *
 * Usage: node logo-knockout.mjs [file]   (defaults to assets/signature.png)
 */
import fs from 'fs';
import sharp from 'sharp';

const HARD = 26;   /* within this of the background: fully transparent */
const SOFT = 62;   /* beyond this: left alone */

export async function knockOut(input) {
  const { data, info } = await sharp(input, { failOn: 'none' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const at = (x, y) => (y * w + x) * ch;

  /* the background is whatever the corners agree on; if they disagree the
     image already has a subject running to the edge, so leave it alone */
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => {
    const o = at(x, y); return [data[o], data[o + 1], data[o + 2], data[o + 3]];
  });
  if (corners.some(c => c[3] < 250)) return { buf: null, reason: 'already has transparency' };
  const [br, bg, bb] = corners[0];
  const spread = Math.max(...corners.map(c =>
    Math.max(Math.abs(c[0] - br), Math.abs(c[1] - bg), Math.abs(c[2] - bb))));
  if (spread > HARD) return { buf: null, reason: 'corners disagree — no flat background' };

  const dist = o => Math.max(
    Math.abs(data[o] - br), Math.abs(data[o + 1] - bg), Math.abs(data[o + 2] - bb));

  /* iterative flood fill — a recursive one blows the stack on a 1000px image */
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1); }
  for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y); }
  let cleared = 0;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (seen[i]) continue;
    const o = at(x, y);
    const d = dist(o);
    if (d >= SOFT) continue;              /* part of the drawing — stop here */
    seen[i] = 1;
    data[o + 3] = d <= HARD ? 0 : Math.round(255 * (d - HARD) / (SOFT - HARD));
    if (data[o + 3] === 0) cleared++;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  if (!cleared) return { buf: null, reason: 'nothing to clear' };

  const png = await sharp(data, { raw: { width: w, height: h, channels: ch } })
    .png({ compressionLevel: 9 })
    /* the knockout leaves a transparent margin; trimming it means the mark's
       box is its ink, so it sits on the page margin rather than near it */
    .trim({ threshold: 1 })
    .toBuffer();
  return { buf: png, cleared, pct: (cleared / (w * h) * 100).toFixed(1), bg: `rgb(${br},${bg},${bb})` };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('logo-knockout.mjs')) {
  const file = process.argv[2] || 'assets/signature.png';
  const r = await knockOut(fs.readFileSync(file));
  if (!r.buf) { console.log(`${file}: left alone (${r.reason})`); process.exit(0); }
  fs.writeFileSync(file, r.buf);
  const m = await sharp(r.buf).metadata();
  console.log(`${file}: cleared ${r.pct}% at ${r.bg} → ${m.width}x${m.height}, alpha ${m.hasAlpha}`);
}
