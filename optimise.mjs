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
    const oversize = Math.max(meta.width || 0, meta.height || 0) > MAX;
    /* a file can sit well within the pixel cap and still be megabytes: an
       illustration flat saved as full-colour PNG. Re-encode those in place. */
    const heavy = input.length > 900 * 1024;
    if (!oversize && !heavy) { after += input.length; continue; }
    const pl = oversize
      ? img.resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
      : img;
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

/* ── animated gif ─────────────────────────────────────────────────────────
   A gif of a 120-frame animation is the worst format on the site: the two
   hero loops alone were 7.6MB, against 0.3MB as mp4. These are motion
   pieces by a motion designer, so mp4 is also the honest format for them,
   and the cloud already treats video properly (poster, then autoplay).

   Converting changes the file, so the data has to move with it: the entry's
   kind becomes 'video'. Patches _data.json when the pipeline is mid-refresh,
   and index.html when this is run on its own. */
const GIF_MIN = 1024 * 1024;
const gifs = fs.readdirSync(DIR).filter(f => /\.gif$/i.test(f));
const converted = new Map();   /* old filename -> new filename */

for (const f of gifs) {
  const p = path.join(DIR, f);
  const size = fs.statSync(p).size;
  if (size < GIF_MIN) continue;
  const outName = f.replace(/\.gif$/i, '.mp4');
  const out = path.join(DIR, outName);
  try {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-i', p,
      '-vf', "scale='min(1000,iw)':-2:flags=lanczos",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '-threads', '1',
      '-y', out
    ], { stdio: 'inherit' });
    const got = fs.statSync(out).size;
    if (got > 0 && got < size) { fs.unlinkSync(p); converted.set(f, outName); }
    else fs.unlinkSync(out);
  } catch (e) {
    try { fs.unlinkSync(out); } catch {}
    console.warn(`  could not convert ${f}: ${e.message.split('\n')[0]}`);
  }
}

if (converted.size) {
  /* move the data to match the files */
  const retarget = entry => {
    if (!entry || !converted.has(entry.file)) return false;
    entry.file = converted.get(entry.file);
    entry.kind = 'video';
    return true;
  };
  let touched = 0;
  if (fs.existsSync('_data.json')) {
    const d = JSON.parse(fs.readFileSync('_data.json', 'utf8'));
    for (const a of Object.values(d.ASSETS || {})) if (retarget(a)) touched++;
    for (const arr of Object.values(d.GALLERY || {})) for (const m of arr) if (retarget(m)) touched++;
    fs.writeFileSync('_data.json', JSON.stringify(d));
  } else if (fs.existsSync('index.html')) {
    let page = fs.readFileSync('index.html', 'utf8');
    for (const key of ['ASSETS', 'GALLERY']) {
      const re = new RegExp('const ' + key + ' = (\\{[\\s\\S]*?\\});');
      const m = page.match(re);
      if (!m) continue;
      const obj = JSON.parse(m[1]);
      if (key === 'ASSETS') { for (const a of Object.values(obj)) if (retarget(a)) touched++; }
      else { for (const arr of Object.values(obj)) for (const x of arr) if (retarget(x)) touched++; }
      page = page.replace(re, 'const ' + key + ' = ' + JSON.stringify(obj) + ';');
    }
    fs.writeFileSync('index.html', page);
  }
  console.log(`Converted ${converted.size} gifs to mp4 (${touched} data entries retargeted)`);
}

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
