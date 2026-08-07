// Fills in a still for every video project, so the cloud always has something
// to show before you point at a card.
//
// The homepage renders images/posters/<id>.jpg for a video project and only
// fetches the clip on hover. A project added to Airtable as a video therefore
// arrives with no poster: the card 404s to a broken-image icon, and because a
// failed image collapses to no height the hover clip fills a sliver. This runs
// as part of every refresh so that can't happen again.
import fs from 'fs';
import { execFileSync } from 'child_process';

const DIR = 'images/posters';
fs.mkdirSync(DIR, { recursive: true });

const html = fs.readFileSync('index.html', 'utf8');
const grab = (re, label) => {
  const m = html.match(re);
  if (!m) throw new Error('Could not find ' + label + ' in index.html');
  return JSON.parse(m[1]);
};
const PROJECTS = grab(/const PROJECTS = (\[[\s\S]*?\n\]);/, 'PROJECTS');
const ASSETS = grab(/const ASSETS = (\{[\s\S]*?\});/, 'ASSETS');

let made = 0, skipped = 0, failed = 0;

for (const p of PROJECTS) {
  const a = ASSETS[p.id];
  if (!a || a.kind !== 'video') continue;

  const dest = `${DIR}/${p.id}.jpg`;
  if (fs.existsSync(dest)) { skipped++; continue; }

  const src = `images/${a.file}`;
  if (!fs.existsSync(src)) { console.warn(`  no source video for ${p.id}`); failed++; continue; }

  try {
    /* a second in, so the frame isn't a fade-up from black */
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-ss', '1', '-i', src,
      '-frames:v', '1',
      '-vf', "scale='min(1400,iw)':-2",
      '-q:v', '4', '-y', dest
    ], { stdio: 'inherit' });
    made++;
    console.log(`  poster for ${p.id}`);
  } catch (e) {
    /* never fail the whole refresh over a poster */
    failed++;
    console.warn(`  could not make a poster for ${p.id}: ${e.message.split('\n')[0]}`);
  }
}

console.log(`Posters: ${made} made, ${skipped} already there${failed ? `, ${failed} failed` : ''}`);
