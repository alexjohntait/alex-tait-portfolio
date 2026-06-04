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
