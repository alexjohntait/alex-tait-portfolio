// Rebuilds PROJECTS + ASSETS + GALLERY from a fresh Airtable pull, downloads all media locally.
import fs from 'fs';
import path from 'path';
import https from 'https';

const SRC = process.argv[2]; // path to the list_records tool-result JSON
const DIR = path.resolve('images');
fs.mkdirSync(DIR, { recursive: true });

const F = {
  title:'fldEq1h2Dvpqu6gGA', caption:'fldherzZVbTojFCEB', year:'fldTT0yzsQOScrNCq',
  client:'fld10mHi3s1snES9t', category:'fld0sdTSJl95rLi02', bg:'fldJtYYG0Byex03OO',
  fg:'fldawWxSodmzqJm4t', hero:'fldbQ53CgEoQtoGxL', order:'flddcHP9PNxhdrY1c',
  desc:'fldVOA3gzhogpq3J9', tags:'fld16EoU6LUXZE146', mosaic:'fldmuZKsubfHIkc6d',
};

const slug = s => s.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));

let rows = data.records.map(r => {
  const c = r.cellValuesByFieldId || {};
  const hero = Array.isArray(c[F.hero]) ? c[F.hero][0] : null;
  const mosaic = Array.isArray(c[F.mosaic]) ? c[F.mosaic] : [];
  return {
    id: c[F.title] ? slug(c[F.title]) : null,
    title: c[F.title] || '',
    caption: (c[F.caption] || '').trim(),
    year: c[F.year] != null ? String(c[F.year]) : '',
    client: c[F.client] || '',
    category: (c[F.category] || '').trim().toLowerCase(),
    bg: c[F.bg] || '#000000',
    fg: c[F.fg] || '#ffffff',
    desc: (c[F.desc] || '').trim(),
    tags: (c[F.tags] || '').trim(),
    order: c[F.order] != null ? Number(c[F.order]) : 999,
    heroUrl: hero ? hero.url : null,
    heroType: hero ? hero.type : null,
    mosaic: mosaic.map(a => ({ url: (a.thumbnails && a.thumbnails.full ? a.thumbnails.full.url : a.url), type: a.type, w: a.width, h: a.height })),
  };
}).filter(r => r.id && r.heroUrl).sort((a,b) => a.order - b.order);

// de-dupe ids
const seen = {};
rows.forEach(r => {
  if (seen[r.id]) { r.id = r.id + '-' + (++seen[r.id]); }
  else seen[r.id] = 1;
});

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode !== 200) { file.close(); fs.unlink(dest,()=>{}); return reject(res.statusCode); }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', e => { file.close(); fs.unlink(dest,()=>{}); reject(e.message); });
  });
}

const extFor = type => {
  const m = { 'image/png':'png','image/jpeg':'jpg','image/gif':'gif','video/mp4':'mp4','video/quicktime':'mp4','image/webp':'webp' };
  return m[type] || 'bin';
};
const kindFor = type => (type || '').startsWith('video') ? 'video' : 'img';

const ASSETS = {};
const GALLERY = {};
const PROJECTS = [];

let heroOk = 0, galOk = 0, fail = 0;
console.log('Downloading hero + gallery for', rows.length, 'projects...');

for (const r of rows) {
  // hero
  const hExt = extFor(r.heroType);
  const hFile = r.id + '.' + hExt;
  try {
    await download(r.heroUrl, path.join(DIR, hFile));
    ASSETS[r.id] = { file: hFile, kind: kindFor(r.heroType) };
    heroOk++;
  } catch(e) { fail++; console.log('FAIL hero', r.id, e); continue; }

  // gallery (mosaic)
  const gal = [];
  for (let i = 0; i < r.mosaic.length; i++) {
    const m = r.mosaic[i];
    const ext = extFor(m.type);
    const file = `${r.id}-m${i+1}.${ext}`;
    try {
      await download(m.url, path.join(DIR, file));
      gal.push({ file, kind: kindFor(m.type), w: m.w || 0, h: m.h || 0 });
      galOk++;
    } catch(e) { fail++; console.log('FAIL gallery', file, e); }
  }
  if (gal.length) GALLERY[r.id] = gal;

  PROJECTS.push({ id:r.id, title:r.title, category:r.category, year:r.year, client:r.client, caption:r.caption, bg:r.bg, fg:r.fg, desc:r.desc, tags:r.tags });
  console.log('OK  ', r.id, '(+' + gal.length + ' gallery)');
}

fs.writeFileSync('_data.json', JSON.stringify({ PROJECTS, ASSETS, GALLERY }, null, 2));
console.log('---');
console.log('Heroes:', heroOk, '| Gallery images:', galOk, '| Failed:', fail);
