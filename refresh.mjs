// One-command refresh: pull Airtable → download media → inject data → rebuild pages + sitemap.
//
// Usage:
//   1) With a token (fully automatic):
//        AIRTABLE_TOKEN=pat_xxx  node refresh.mjs
//   2) With a records JSON file you already pulled (e.g. via the MCP tool):
//        node refresh.mjs path/to/records.json
//
// The token is read from the environment only — it is never stored in this file.
import fs from 'fs';
import { execFileSync } from 'child_process';

const BASE = 'appjYUthm8ib2ctuH';
const TABLE = 'tblY3AdUL6JNOnYcY';
const SKETCH_TABLE = 'Sketchbook';   // referenced by tab name, not field IDs
const fileArg = process.argv[2];
const token = process.env.AIRTABLE_TOKEN;
let sketchStatus = 'not run';
let logoStatus = 'not run';

async function fetchRecords() {
  console.log('• Fetching records from Airtable…');
  const records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    const json = await res.json();
    // normalise to the shape build-data.mjs expects (cellValuesByFieldId)
    json.records.forEach(r => records.push({ id: r.id, createdTime: r.createdTime, cellValuesByFieldId: r.fields }));
    offset = json.offset;
  } while (offset);
  const out = '_records.json';
  fs.writeFileSync(out, JSON.stringify({ records, metadata: { totalRecordCount: records.length } }));
  console.log(`  pulled ${records.length} records`);
  return out;
}

/* ── sketchbook: fun drawings + throwaway gifs, schema-agnostic ──
   Pulls the Sketchbook table by name, harvests EVERY attachment found in
   any field (so the table can be a single attachments column, or anything),
   downloads them to images/sketchbook/, and injects `const SKETCHES` into
   index.html, where they appear as marginalia doodles dotted on the grid.
   Non-fatal on purpose: if the table is missing/renamed the main refresh
   still succeeds — the site just keeps its previous sketches. */
async function refreshSketchbook() {
  if (!token) { console.log('• Sketchbook: skipped (no token / file mode)'); sketchStatus = 'skipped (no token)'; return; }
  let records;
  try {
    records = [];
    let offset;
    do {
      const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(SKETCH_TABLE)}`);
      url.searchParams.set('pageSize', '100');
      if (offset) url.searchParams.set('offset', offset);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Airtable ${res.status}`);
      const json = await res.json();
      records.push(...json.records);
      offset = json.offset;
    } while (offset);
  } catch (e) {
    console.warn(`• Sketchbook: skipped (${e.message}) — check the tab is named "${SKETCH_TABLE}"`);
    sketchStatus = `FAILED to read the "${SKETCH_TABLE}" table: ${e.message}`;
    return;
  }

  const DIR = 'images/sketchbook';
  fs.mkdirSync(DIR, { recursive: true });
  const extFor = a => {
    const m = /\.(gif|png|jpe?g|webp|mp4|webm)(\?|$)/i.exec(a.filename || a.url || '');
    if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
    const t = a.type || '';
    return t.includes('gif') ? 'gif' : t.includes('png') ? 'png' : t.includes('webp') ? 'webp'
      : t.includes('mp4') ? 'mp4' : t.includes('webm') ? 'webm' : 'jpg';
  };

  const sketches = [];
  for (const r of records) {
    let i = 0;
    for (const v of Object.values(r.fields || {})) {
      if (!Array.isArray(v)) continue;
      for (const a of v) {
        if (!a || typeof a !== 'object' || !a.url || !a.type) continue;
        if (!/^(image|video)\//.test(a.type)) continue;
        const ext = extFor(a);
        /* name the file after the ATTACHMENT, not the record's position.
           Keying on position meant swapping an image on an existing record
           produced the same filename, so the skip below treated it as
           already-downloaded and the change never reached the site. An
           attachment id changes whenever the file does. */
        const stamp = String(a.id || i).replace(/[^a-zA-Z0-9]/g, '') || String(i);
        i++;
        const file = `${r.id}-${stamp}.${ext}`;
        const kind = a.type.startsWith('video') ? 'video' : 'img';
        // gifs/videos must come from the original url (thumbnails are static);
        // stills can use the large thumbnail to keep the repo light
        const src = (ext === 'gif' || kind === 'video')
          ? a.url
          : (a.thumbnails && a.thumbnails.large ? a.thumbnails.large.url : a.url);
        sketches.push({ f: file, k: kind, src });
      }
    }
  }

  let fresh = 0;
  for (const s of sketches) {
    const dest = `${DIR}/${s.f}`;
    /* safe to skip now: the filename identifies the attachment itself, so an
       existing file can only be that exact image */
    if (fs.existsSync(dest)) continue;
    try {
      const res = await fetch(s.src);
      if (!res.ok) throw new Error(res.status);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      fresh++;
    } catch (e) { console.warn(`  sketch ${s.f} failed: ${e.message}`); }
  }
  // prune files whose records were deleted in Airtable
  const keep = new Set(sketches.map(s => s.f));
  for (const f of fs.readdirSync(DIR)) if (!keep.has(f)) fs.unlinkSync(`${DIR}/${f}`);

  const list = sketches.filter(s => fs.existsSync(`${DIR}/${s.f}`)).map(({ f, k }) => ({ f, k }));
  const decl = 'const SKETCHES = ' + JSON.stringify(list) + ';';
  for (const page of ['index.html']) {
    let html = fs.readFileSync(page, 'utf8');
    if (!/const SKETCHES = \[[\s\S]*?\];/.test(html)) { console.warn(`  no SKETCHES seed in ${page}`); continue; }
    fs.writeFileSync(page, html.replace(/const SKETCHES = \[[\s\S]*?\];/, decl));
  }
  console.log(`• Sketchbook: ${list.length} sketches (${fresh} newly downloaded)`);
  sketchStatus = `${records.length} records, ${list.length} sketches, ${fresh} newly downloaded`;
}

/* ── site logo ──
   The signature in the top-left corner was a static file in the repo for
   its whole life, so editing it in Airtable changed nothing. It comes from
   the "Site Logo" attachment column on the Projects table now: whichever
   row carries one wins, since it describes the site rather than a project.

   Fetched by field NAME, not id — this column was added after the field-id
   map in build-data.mjs was written, and a name needs no lookup to keep in
   step. Re-encoded to PNG so the markup can keep pointing at one filename
   whatever gets attached, and only written when the bytes actually differ,
   so a rebuild that changes nothing does not commit a new binary.

   Non-fatal: a missing column or a failed download leaves the previous
   signature in place rather than taking the site's masthead down. */
async function refreshSiteLogo() {
  if (!token) { console.log('• Site logo: skipped (no token / file mode)'); logoStatus = 'skipped (no token)'; return; }
  const DEST = 'assets/signature.png';
  try {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
    url.searchParams.set('pageSize', '100');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable ${res.status}`);
    const { records } = await res.json();

    let att = null;
    for (const r of records) {
      const v = (r.fields || {})['Site Logo'];
      if (Array.isArray(v) && v.length && v[0] && v[0].url) { att = v[0]; break; }
    }
    if (!att) {
      console.log('• Site logo: no "Site Logo" attachment found — keeping the current signature');
      logoStatus = 'no attachment found (kept existing)';
      return;
    }

    const got = await fetch(att.url, { redirect: 'follow' });
    if (!got.ok) throw new Error(`HTTP ${got.status}`);
    const src = Buffer.from(await got.arrayBuffer());
    if (!src.length) throw new Error('empty response');

    const sharp = (await import('sharp')).default;
    const png = await sharp(src, { failOn: 'none' }).png({ compressionLevel: 9 }).toBuffer();

    const before = fs.existsSync(DEST) ? fs.readFileSync(DEST) : null;
    if (before && before.equals(png)) {
      console.log(`• Site logo: "${att.filename}" already current`);
      logoStatus = `"${att.filename}" unchanged`;
      return;
    }
    fs.writeFileSync(DEST, png);
    const m = await sharp(png).metadata();
    /* the CSS sizes the mark by HEIGHT, which was written for a 4:1
       handwritten signature. A square logo under that rule is a 41px speck,
       so carry the aspect correction into the page: 1 for a wide signature,
       2 for a square one, so the two cover roughly the same area. The CSS
       caps the result to the bar the mark stands in. */
    const REF_AR = 2627 / 653;
    const k = Math.min(2.4, Math.max(1, Math.sqrt(REF_AR / (m.width / m.height))));
    let page = fs.readFileSync('index.html', 'utf8');
    const re = /--sigk: [d.]+;/;
    if (re.test(page)) fs.writeFileSync('index.html', page.replace(re, `--sigk: ${k.toFixed(2)};`));
    else console.warn('  no --sigk in index.html to update');
    console.log(`• Site logo: wrote ${DEST} from "${att.filename}" (${m.width}x${m.height}, sigk ${k.toFixed(2)})`);
    logoStatus = `updated from "${att.filename}" (${m.width}x${m.height}, sigk ${k.toFixed(2)})`;
  } catch (e) {
    console.warn(`• Site logo: skipped (${e.message}) — keeping the current signature`);
    logoStatus = `FAILED: ${e.message} (kept existing)`;
  }
}

/* Committed alongside the rebuild so the state of the last sync can be read
   from the repo. The CI log needs a login; this does not, and it is the only
   way a silently-skipped record ever becomes visible. */
function writeReport() {
  let d = {};
  try { d = JSON.parse(fs.readFileSync('_data.json', 'utf8'))._report || {}; } catch {}
  const lines = [
    `Last rebuild: ${new Date().toISOString()}`,
    ``,
    `Airtable records fetched : ${d.recordsFetched ?? '?'}`,
    `Projects built           : ${d.projectsBuilt ?? '?'}`,
    `Hero images              : ${d.heroOk ?? '?'}`,
    `Gallery images           : ${d.galOk ?? '?'}`,
    `Failed downloads         : ${d.fail ?? '?'}`,
    `Sketchbook               : ${sketchStatus}`,
    `Site logo                : ${logoStatus}`,
    ``,
  ];
  const skipped = d.skipped || [];
  if (skipped.length) {
    lines.push(`SKIPPED — these Airtable records are NOT on the site:`);
    for (const s of skipped) lines.push(`  "${s.title}" — missing ${s.missing.join(' and ')}`);
  }
  const hf = d.heroFailed || [];
  if (hf.length) {
    lines.push('');
    lines.push('HERO DOWNLOAD FAILED — these projects were dropped:');
    for (const s of hf) lines.push('  "' + s.title + '" — ' + s.why);
  }
  if (!skipped.length && !hf.length) {
    lines.push('No records skipped: every Airtable row made it onto the site.');
  }
  fs.writeFileSync('BUILD-REPORT.txt', lines.join('\n') + '\n');
  console.log('• Wrote BUILD-REPORT.txt');
}

function injectData() {
  console.log('• Injecting data into index.html…');
  const d = JSON.parse(fs.readFileSync('_data.json', 'utf8'));
  let html = fs.readFileSync('index.html', 'utf8');
  const projects = 'const PROJECTS = [\n' + d.PROJECTS.map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n];';
  html = html.replace(/const PROJECTS = \[[\s\S]*?\n\];/, projects);
  html = html.replace(/const ASSETS = \{[\s\S]*?\};/, 'const ASSETS = ' + JSON.stringify(d.ASSETS) + ';');
  html = html.replace(/const GALLERY = \{[\s\S]*?\};/, 'const GALLERY = ' + JSON.stringify(d.GALLERY) + ';');
  fs.writeFileSync('index.html', html);
  console.log(`  ${d.PROJECTS.length} projects injected`);
}

(async () => {
  try {
    let records = fileArg;
    if (!records) {
      if (!token) {
        console.error('No records file given and AIRTABLE_TOKEN is not set.\n' +
          'Either: AIRTABLE_TOKEN=pat_xxx node refresh.mjs\n' +
          'Or:     node refresh.mjs path/to/records.json');
        process.exit(1);
      }
      records = await fetchRecords();
    }

    console.log('• Downloading hero + gallery media…');
    execFileSync('node', ['build-data.mjs', records], { stdio: 'inherit' });

    console.log('• Optimising images (resize oversized files)…');
    execFileSync('node', ['optimise.mjs'], { stdio: 'inherit' });

    injectData();

    await refreshSketchbook();
    await refreshSiteLogo();
    writeReport();

    /* a video project needs a still for the cloud; without one its card
       renders as a broken image until you hover it */
    console.log('• Filling in posters for any new video projects…');
    try { execFileSync('node', ['make-posters.mjs'], { stdio: 'inherit' }); }
    catch (e) { console.warn('  posters step skipped:', e.message.split('\n')[0]); }

    console.log('• Rebuilding project pages + sitemap…');
    execFileSync('node', ['build-pages.mjs'], { stdio: 'inherit' });

    // tidy temp files
    for (const f of ['_data.json', '_records.json']) { try { fs.unlinkSync(f); } catch {} }
    console.log('✓ Refresh complete — index.html, /work/*.html, /images and sitemap.xml are up to date.');
    console.log('  Note: if you added/changed a VIDEO project, regenerate its grid poster in /images/posters/ (see make-posters note in MORNING-REPORT).');
  } catch (e) {
    console.error('✗ Refresh failed:', e.message);
    process.exit(1);
  }
})();
