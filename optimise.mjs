// Resize oversized images in /images to a sane web max (keeps format + filename),
// and re-encode oversized video to web weight so the homepage can autoplay it.
// Reads via fs buffer (sharp's own file-open is flaky on Windows). Skips gifs.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { execFileSync } from 'child_process';

const DIR = 'images';
const MAX = 1800;
const files = fs.readdirSync(DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
let before = 0, after = 0, changed = 0;

for (const f of files) {
  const p = path.join(DIR, f);
  const input = fs.readFileSync(p);
  before += input.length;
  try {
    const img = sharp(input, { failOn: 'none' });
    const meta = await img.metadata();
    if (Math.max(meta.width || 0, meta.height || 0) <= MAX) { after += input.length; continue; }
    const pl = img.resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true });
    const ext = f.toLowerCase();
    let buf;
    if (ext.endsWith('.png')) buf = await pl.png({ compressionLevel: 9, palette: true }).toBuffer();
    else if (ext.endsWith('.webp')) buf = await pl.webp({ quality: 82 }).toBuffer();
    else buf = await pl.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    if (buf.length < input.length) { fs.writeFileSync(p, buf); after += buf.length; changed++; }
    else after += input.length;
  } catch (e) { after += input.length; console.log('skip', f, e.message); }
}
const mb = n => (n / 1048576).toFixed(1) + 'MB';
console.log(`Optimised ${changed}/${files.length} images: ${mb(before)} → ${mb(after)} (saved ${mb(before - after)})`);

/* ── video ────────────────────────────────────────────────────────────────
   Airtable holds masters at 10-20MB each. The cloud autoplays the clips of
   whatever is on screen, so they have to be web weight or a single scroll
   pulls a hundred megabytes. Re-encoded at 1280px / CRF 26 they land around
   0.7MB with no visible loss at card size. Audio is dropped: every clip on
   the site is muted.

   build-data.mjs re-downloads the masters on every refresh, so this runs
   every time rather than caching; it is a second or so per clip. */
const VID_MAX_BYTES = 2.5 * 1024 * 1024;
const vids = fs.readdirSync(DIR).filter(f => /\.mp4$/i.test(f));
let vBefore = 0, vAfter = 0, vDone = 0, vSkipped = 0;

for (const f of vids) {
  const p = path.join(DIR, f);
  const size = fs.statSync(p).size;
  vBefore += size;
  /* already web weight (ours from a previous run, or small to begin with) */
  if (size <= VID_MAX_BYTES) { vAfter += size; vSkipped++; continue; }
  const tmp = p + '.tmp.mp4';
  try {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-i', p,
      '-vf', "scale='min(1280,iw)':-2",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
      /* single-threaded so the same master always encodes to the same bytes:
         the masters are re-downloaded every refresh, and a nondeterministic
         encode would rewrite all 25 clips into git every six hours */
      '-threads', '1',
      '-y', tmp
    ], { stdio: 'inherit' });
    const got = fs.statSync(tmp).size;
    if (got > 0 && got < size) {
      /* rename can EPERM on Windows when something still holds the file open;
         copying over the original works where swapping the inode does not */
      try { fs.renameSync(tmp, p); }
      catch { fs.copyFileSync(tmp, p); fs.unlinkSync(tmp); }
      vAfter += got; vDone++;
    }
    else { fs.unlinkSync(tmp); vAfter += size; }
  } catch (e) {
    /* a bad encode must never cost us the original */
    try { fs.unlinkSync(tmp); } catch {}
    vAfter += size;
    console.warn(`  could not compress ${f}: ${e.message.split('\n')[0]}`);
  }
}
if (vids.length) {
  console.log(`Compressed ${vDone}/${vids.length} videos (${vSkipped} already small): ${mb(vBefore)} → ${mb(vAfter)}`);
}
