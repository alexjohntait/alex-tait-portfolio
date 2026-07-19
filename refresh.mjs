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
  if (!token) { console.log('• Sketchbook: skipped (no token / file mode)'); return; }
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
        const file = `${r.id}-${i++}.${ext}`;
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
    if (fs.existsSync(dest)) continue;   // record ids are stable; skip re-downloads
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
