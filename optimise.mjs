// Resize oversized images in /images to a sane web max (keeps format + filename).
// Reads via fs buffer (sharp's own file-open is flaky on Windows). Skips gifs + videos.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

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
