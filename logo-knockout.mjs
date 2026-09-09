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
import { execFileSync } from 'child_process';

const HARD = 26;   /* within this of the background: fully transparent */
const SOFT = 62;   /* beyond this: left alone */

/* Clear one frame in place, working on a slice of a raw RGBA buffer.
 * `top` is the first row of this frame within the buffer; `h` its height.
 * Returns the pixels cleared, or null if there is no flat background here. */
function clearFrame(data, w, h, ch, top) {
  const at = (x, y) => ((top + y) * w + x) * ch;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => {
    const o = at(x, y); return [data[o], data[o + 1], data[o + 2], data[o + 3]];
  });
  if (corners.some(c => c[3] < 250)) return null;
  const [br, bg, bb] = corners[0];
  const spread = Math.max(...corners.map(c =>
    Math.max(Math.abs(c[0] - br), Math.abs(c[1] - bg), Math.abs(c[2] - bb))));
  if (spread > HARD) return null;

  const dist = o => Math.max(
    Math.abs(data[o] - br), Math.abs(data[o + 1] - bg), Math.abs(data[o + 2] - bb));
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
  let cleared = 0;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (seen[i]) continue;
    const o = at(x, y);
    const d = dist(o);
    if (d >= SOFT) continue;
    seen[i] = 1;
    data[o + 3] = d <= HARD ? 0 : Math.round(255 * (d - HARD) / (SOFT - HARD));
    if (data[o + 3] === 0) cleared++;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return { cleared, bg: `rgb(${br},${bg},${bb})` };
}

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

/* The animated case.
 *
 * sharp cannot put a raw buffer back together as an animated file — page
 * height is lost on the way in, so a round trip through raw comes out as one
 * long still. So each frame is cleared in memory, written out as a PNG, and
 * ffmpeg reassembles them into an animated WebP, which is the only widely
 * supported animated format with a real alpha channel (a GIF's alpha is one
 * bit, so every soft edge would come back jagged).
 *
 * The clear is per frame but edge-connected, exactly as the still path is —
 * not a global colour key. White inside the drawing stays white, instead of
 * becoming a hole that whatever passes behind the mark shows through.
 *
 * Frames are cropped to one bounding box, the union across all of them, so
 * the mark does not jitter as its own ink moves.
 */
export async function knockOutAnimated(input, tmpDir) {
  const meta = await sharp(input, { failOn: 'none', animated: true }).metadata();
  const pages = meta.pages || 1;
  if (pages < 2) return { buf: null, reason: 'not animated' };

  const { data, info } = await sharp(input, { failOn: 'none', animated: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, ch = info.channels, ph = meta.pageHeight;

  let cleared = 0, bg = null;
  for (let p = 0; p < pages; p++) {
    const r = clearFrame(data, w, ph, ch, p * ph);
    if (!r) return { buf: null, reason: `frame ${p} has no flat background` };
    cleared += r.cleared; bg = r.bg;
  }
  if (!cleared) return { buf: null, reason: 'nothing to clear' };

  /* one box for every frame, so the crop cannot make the mark wobble */
  let minX = w, minY = ph, maxX = -1, maxY = -1;
  for (let p = 0; p < pages; p++) for (let y = 0; y < ph; y++) for (let x = 0; x < w; x++) {
    if (data[((p * ph + y) * w + x) * ch + 3] > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { buf: null, reason: 'every frame cleared to nothing' };
  const cw = maxX - minX + 1, chh = maxY - minY + 1;

  fs.mkdirSync(tmpDir, { recursive: true });
  for (let p = 0; p < pages; p++) {
    const frame = data.subarray(p * ph * w * ch, (p + 1) * ph * w * ch);
    const png = await sharp(frame, { raw: { width: w, height: ph, channels: ch } })
      .extract({ left: minX, top: minY, width: cw, height: chh })
      .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(`${tmpDir}/f${String(p).padStart(4, '0')}.png`, png);
  }

  /* a gif's own delays, with 0 read as the 100ms browsers actually give it */
  const delays = (meta.delay && meta.delay.length ? meta.delay : Array(pages).fill(100))
    .map(d => (!d || d < 20) ? 100 : d);
  const uniform = delays.every(d => d === delays[0]);
  const out = `${tmpDir}/out.webp`;
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (uniform) {
    args.push('-framerate', String(1000 / delays[0]), '-i', `${tmpDir}/f%04d.png`);
  } else {
    /* variable timing needs the concat demuxer: one duration per frame */
    const list = delays.map((d, i) =>
      `file 'f${String(i).padStart(4, '0')}.png'\nduration ${(d / 1000).toFixed(3)}`).join('\n');
    fs.writeFileSync(`${tmpDir}/frames.txt`, list + `\nfile 'f${String(pages - 1).padStart(4, '0')}.png'\n`);
    args.push('-f', 'concat', '-safe', '0', '-i', `${tmpDir}/frames.txt`);
  }
  args.push('-loop', '0', '-lossless', '1', '-an', '-y', out);
  execFileSync('ffmpeg', args, { stdio: 'pipe' });

  const buf = fs.readFileSync(out);
  const om = await sharp(buf, { animated: true }).metadata();
  return {
    buf, ext: 'webp', frames: om.pages || pages, srcFrames: pages,
    width: cw, height: chh, bg,
    pct: (cleared / (w * ph * pages) * 100).toFixed(1),
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('logo-knockout.mjs')) {
  const file = process.argv[2] || 'assets/signature.png';
  const r = await knockOut(fs.readFileSync(file));
  if (!r.buf) { console.log(`${file}: left alone (${r.reason})`); process.exit(0); }
  fs.writeFileSync(file, r.buf);
  const m = await sharp(r.buf).metadata();
  console.log(`${file}: cleared ${r.pct}% at ${r.bg} → ${m.width}x${m.height}, alpha ${m.hasAlpha}`);
}
