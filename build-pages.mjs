// Generates a standalone, crawlable case-study page per project into /work/.
// Reads the data, header and overlays straight from index.html so pages stay in sync with it.
//
// The grid opens these directly now (the popup is gone), so this page is
// where a project is actually seen: title and facts, the hero at full width,
// the rest of the work laid out in rows by its own proportions, and the next
// project waiting at the bottom.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SITE = 'https://alexjohntait.com';
const html = fs.readFileSync('index.html', 'utf8');

// Bespoke, hand-built case-study pages that must NEVER be regenerated/overwritten
// by this script (or the scheduled "Rebuild from Airtable" Action). Add an id here
// to protect its custom work/<id>.html. It still appears in the grid and sitemap.
const BESPOKE = new Set(['humantold-nyc', 'hiit-workout']);

// ── pull data + styles out of the SPA ──────────────────────────
const grab = (re, label) => { const m = html.match(re); if (!m) throw new Error('Could not find ' + label); return m[1]; };
const PROJECTS = JSON.parse(grab(/const PROJECTS = (\[[\s\S]*?\n\]);/, 'PROJECTS'));
const ASSETS   = JSON.parse(grab(/const ASSETS = (\{[\s\S]*?\});/, 'ASSETS'));
const GALLERY  = JSON.parse(grab(/const GALLERY = (\{[\s\S]*?\});/, 'GALLERY'));
/* the header, the menu and get-in-touch are lifted from the home page so a
   project page matches it exactly; only the paths step up a folder */
const up = s => s.replace(/(href|src)="(?!https?:|mailto:|#|\/)/g, '$1="../');
const HEADER = up(grab(/(<header class="hd cap">[\s\S]*?<\/header>)/, 'header'));
const OVERLAYS = up(grab(/(<div class="ov" id="menu"[\s\S]*?)\n<div class="grain"/, 'overlays'));

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const isPersonal = p => String(p.category || '').includes('personal');

/* the order the grid shows them in — newest first, commissions and personal
   work kept apart — so Next on a page is the tile beside it on the grid */
const byYear = list => list.slice().sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
const RUNS = { work: byYear(PROJECTS.filter(p => !isPersonal(p))), sketchbook: byYear(PROJECTS.filter(isPersonal)) };

/* the hero's real proportions, so a portrait piece is not blown up to the
   full width of the page and its box is reserved before it loads */
async function dims(file) {
  try { const m = await sharp(file).metadata(); return m.width && m.height ? { w: m.width, h: m.height } : {}; }
  catch { return {}; }
}

function media(m, alt, { hero = false } = {}) {
  const src = `../images/${m.file}`;
  const size = m.w && m.h ? ` width="${m.w}" height="${m.h}"` : '';
  if (m.kind === 'video')
    return `<video src="${src}#t=0.1" muted loop playsinline preload="metadata" data-auto aria-label="${esc(alt)}"${size}></video>`;
  return `<img src="${src}" alt="${esc(alt)}"${size}${hero ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'} />`;
}

/* the rest of the work, in rows. A landscape frame takes the full measure on
   its own; portraits and squares that come together share a row, sized by
   their own ratios so they stand the same height with nothing cropped —
   three to a row when they are tall, two when they are square. */
function rows(items) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const per = run.every(m => m.w / m.h < 0.85) ? 3 : 2;
    const n = Math.ceil(run.length / per);
    let i = 0;
    for (let r = 0; r < n; r++) {
      const take = Math.ceil((run.length - i) / (n - r));
      out.push(run.slice(i, i + take)); i += take;
    }
    run = [];
  };
  for (const m of items) {
    if (m.w && m.h && m.w / m.h < 1.2) run.push(m);
    else { flush(); out.push([m]); }
  }
  flush();
  return out;
}


// the case page's own rules, on top of assets/noa.css
const CSS = `
  .cs { padding: 64px var(--gx) 0; }
  .cs-eye { margin-bottom: 10px; }
  .cs-title {
    font-weight: 400; text-transform: lowercase;
    font-size: clamp(64px, 15.5vw, 260px); letter-spacing: -.065em; line-height: .86;
    margin-left: -.05em; overflow-wrap: anywhere; text-wrap: balance;
    animation: up .9s var(--out) both;
  }
  @keyframes up { from { transform: translateY(40px); opacity: 0; } }
  .cs-facts { margin-top: clamp(28px, 4vw, 56px); border-bottom: 1px solid var(--line); animation: up .9s .08s var(--out) both; }
  .cs-facts > div {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gx);
    padding: 9px 0 8px; border-top: 1px solid var(--line);
  }
  .cs-facts dt { color: var(--mute); }
  .cs-facts dd { grid-column: 2 / 4; }
  .cs-sum, .cs-desc {
    font-size: clamp(20px, 1.9vw, 30px); letter-spacing: -.025em; line-height: 1.22;
    max-width: 46ch; text-wrap: pretty;
  }
  .cs-sum { margin: clamp(20px, 2.4vw, 36px) 0 clamp(40px, 6vw, 90px); animation: up .9s .14s var(--out) both; }

  /* media arrives bent and straightens as it climbs (assets/noa.js) */
  .warp {
    position: relative; overflow: hidden; background: var(--pb, var(--card));
    border-radius: var(--bend, 0%) var(--bend, 0%) 0 0 / calc(var(--bend, 0%) * .55) calc(var(--bend, 0%) * .55) 0 0;
    transform: translate3d(0, var(--lift, 0), 0);
  }
  .warp img, .warp video { width: 100%; height: 100%; object-fit: cover; }
  .cs-hero { aspect-ratio: var(--ar, 16 / 9); }
  .cs-hero.tall { width: min(100%, calc(88svh * var(--f))); margin: 0 auto; }

  .cs-app { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gx); margin: clamp(48px, 7vw, 110px) 0; }
  .cs-app .cap { padding-top: .55em; }
  .cs-app .cs-desc { grid-column: 2 / 4; }

  .cs-gal { display: grid; gap: var(--gx); margin-top: var(--gx); }
  .cs-row { display: flex; gap: var(--gx); align-items: flex-start; }
  .cs-fig { flex: var(--f, 1) 1 0; aspect-ratio: var(--ar, auto); min-width: 0; }
  .cs-fig.free { aspect-ratio: auto; }
  .cs-fig.free video, .cs-fig.free img { height: auto; }
  .cs-row.solo .cs-fig.tall { flex: none; width: min(100%, calc(88svh * var(--f))); margin: 0 auto; }

  .cs-next {
    display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--gx); align-items: end;
    margin-top: clamp(80px, 12vw, 180px); padding-top: 12px; border-top: 1px solid var(--line);
  }
  .cs-next-t {
    display: block; font-size: clamp(48px, 9vw, 150px); letter-spacing: -.065em; line-height: .88;
    text-transform: lowercase; margin: 14px 0 0 -.05em; transition: color .3s;
  }
  .cs-next-img { aspect-ratio: 4 / 5; overflow: hidden; background: var(--pb); }
  .cs-next-img img { width: 100%; height: 100%; object-fit: cover; transition: transform 1s var(--out); }
  @media (hover: hover) {
    .cs-next:hover .cs-next-t { color: var(--mute); }
    .cs-next:hover .cs-next-img img { transform: scale(1.05); }
  }
  .cs-foot {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--gx);
    padding: clamp(60px, 9vw, 140px) 0 15px;
  }
  .cs-foot > :last-child { text-align: right; }
  body.leaving .cs { opacity: 0; transform: translateY(-14px); transition: opacity .28s var(--out), transform .28s var(--out); }

  @media (max-width: 760px) {
    .cs-facts > div, .cs-app { grid-template-columns: 1fr 2fr; }
    .cs-facts dd, .cs-app .cs-desc { grid-column: 2; }
    .cs-next { grid-template-columns: 1fr 1fr; }
    .cs-foot { grid-template-columns: 1fr 1fr; row-gap: 10px; }
    .cs-foot > :last-child { text-align: left; }
  }
  @media (max-width: 560px) {
    .cs-row { flex-direction: column; }
    .cs-row .cs-fig, .cs-row.solo .cs-fig.tall { width: 100%; flex: none; }
    .cs-app { grid-template-columns: 1fr; }
    .cs-app .cs-desc { grid-column: 1; }
  }
`;

// rows of gallery media, each one bending into place
function rowHTML(row, title, start) {
  const one = row.length === 1;
  return `<div class="cs-row${one ? ' solo' : ''}">` + row.map((m, k) => {
    const ar = m.w && m.h ? m.w / m.h : null;
    const style = ar ? ` style="--ar:${m.w} / ${m.h}; --f:${ar.toFixed(4)}"` : '';
    return `<figure class="cs-fig warp${ar ? '' : ' free'}${ar && ar < 1.2 ? ' tall' : ''}" data-warp${style}>${media(m, `${title}, image ${start + k}`)}</figure>`;
  }).join('') + `</div>`;
}

const PAGE_HEAD = html.match(/<script>\/\* paint the right theme[\s\S]*?<\/script>/)[0];
const year = new Date().getFullYear();

fs.mkdirSync('work', { recursive: true });

for (const p of PROJECTS) {
  if (BESPOKE.has(p.id)) { console.log(`↩ skipping bespoke case study: work/${p.id}.html`); continue; }
  if (!ASSETS[p.id]) continue;
  const group = isPersonal(p) ? 'sketchbook' : 'work';
  const run = RUNS[group].filter(q => ASSETS[q.id]);
  const at = run.indexOf(p);
  const next = run[(at + 1) % run.length], prev = run[(at - 1 + run.length) % run.length];
  const home = group === 'work' ? '../index.html' : '../sketchbook.html';
  const groupName = group === 'work' ? 'Work' : 'Sketchbook';

  const hero = { ...(ASSETS[p.id] || {}) };
  if (!hero.w) Object.assign(hero, await dims(hero.kind === 'video' ? `images/posters/${p.id}.jpg` : `images/${hero.file}`));
  const heroAr = hero.w && hero.h ? hero.w / hero.h : null;
  const heroStill = hero.kind === 'video' ? `posters/${p.id}.jpg` : hero.file;
  const nextStill = ASSETS[next.id].kind === 'video' ? `posters/${next.id}.jpg` : ASSETS[next.id].file;
  const rest = (GALLERY[p.id] || []).filter(m => m.file);

  const catList = String(p.category || '').split(',').map(s => s.trim()).filter(Boolean).map(cap);
  const cat = catList.join(', ') || 'Illustration';
  const heroImg = `${SITE}/images/${heroStill}`;
  const desc = (p.desc || '').replace(/\s+/g, ' ').trim();
  const summary = (p.caption || '').replace(/\s+/g, ' ').trim();
  const client = p.client && p.client !== 'Personal' ? p.client : null;
  const about = desc || summary || (client
    ? `${p.title}: ${cat.toLowerCase()} by Alex Tait for ${client}${p.year ? ', ' + p.year : ''}. Illustration and motion design by a Bath and London based illustrator.`
    : `${p.title}: a personal ${cat.toLowerCase()} project${p.year ? ' from ' + p.year : ''} by Alex Tait, an illustrator and motion designer based in Bath and London.`);
  const metaDesc = about.length > 300 ? about.slice(0, 297).trim() + '…' : about;

  const jsonld = {
    "@context": "https://schema.org", "@type": "VisualArtwork",
    "name": p.title,
    "creator": { "@type": "Person", "name": "Alex Tait", "url": SITE + "/" },
    "artMedium": "Illustration, Motion design",
    "genre": cat,
    "dateCreated": String(p.year || ''),
    "image": heroImg,
    "description": about,
    "url": `${SITE}/work/${p.id}.html`,
    "copyrightHolder": { "@type": "Person", "name": "Alex Tait" },
    "isPartOf": { "@type": "WebSite", "name": "Alex Tait", "url": SITE + "/" }
  };
  if (client) jsonld.commissioner = { "@type": "Organization", "name": client };

  const facts = [
    client ? ['Client', client] : ['Project', p.client || 'Personal'],
    p.year ? ['Year', p.year] : null,
    ['Discipline', catList.filter(c => c !== 'Personal').join(', ') || 'Illustration'],
    p.tags ? ['Tags', p.tags] : null,
  ].filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('\n    ');

  let n = 2;
  const gallery = rows(rest).map(r => { const h = rowHTML(r, p.title, n); n += r.length; return h; }).join('\n    ');

  const heroMedia = hero.kind === 'video'
    ? `<video src="../images/${hero.file}" poster="../images/${heroStill}" muted loop playsinline preload="auto" data-auto aria-label="${esc(p.title)}"></video>`
    : media(hero, client ? `${p.title} for ${client}` : p.title, { hero: true });

  const header = HEADER.replace(/<button type="button" data-open="menu"[\s\S]*?<\/button>/,
    `<a href="${home}" class="back"><span class="roll"><span data-t="All ${groupName.toLowerCase()}">All ${groupName.toLowerCase()}</span></span></a>`)
    .replace('href="../index.html" id="name-link"', `href="${home}" id="name-link"`);

  const page = `<!DOCTYPE html>
<html lang="en" data-theme="day">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(p.title)} — Alex Tait, Illustrator &amp; Motion Designer</title>
  <meta name="description" content="${esc(metaDesc)}" />
  <meta name="author" content="Alex Tait" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="theme-color" content="#ebe8e1" />
  <link rel="canonical" href="${SITE}/work/${p.id}.html" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/favicon.svg" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Alex Tait" />
  <meta property="og:title" content="${esc(p.title)} — Alex Tait" />
  <meta property="og:description" content="${esc(metaDesc)}" />
  <meta property="og:url" content="${SITE}/work/${p.id}.html" />
  <meta property="og:image" content="${heroImg}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(p.title)} — Alex Tait" />
  <meta name="twitter:description" content="${esc(metaDesc)}" />
  <meta name="twitter:image" content="${heroImg}" />
  <script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
  </script>
  ${PAGE_HEAD}
  <link rel="preconnect" href="https://api.fontshare.com" />
  <link href="https://api.fontshare.com/v2/css?f[]=switzer@400,500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../assets/noa.css" />
  <link rel="preload" as="image" href="../images/${heroStill}" />
  <style>${CSS}</style>
</head>
<body style="--pb:${esc(p.bg || '#d9d5cb')}">

${header}

<main class="cs">
  <p class="cs-eye cap mute">${String(at + 1).padStart(2, '0')} — ${esc(catList[0] || 'Illustration')}</p>
  <h1 class="cs-title">${esc(p.title)}</h1>
  <dl class="cs-facts cap">
    ${facts}
  </dl>
  ${summary ? `<p class="cs-sum">${esc(summary)}</p>` : `<div class="cs-sum" aria-hidden="true"></div>`}

  <figure class="cs-hero warp${heroAr && heroAr < 1.2 ? ' tall' : ''}" data-warp${heroAr ? ` style="--ar:${hero.w} / ${hero.h}; --f:${heroAr.toFixed(4)}"` : ''}>${heroMedia}</figure>

  ${desc && desc !== summary ? `<div class="cs-app"><p class="cap mute">About the project</p><p class="cs-desc">${esc(desc)}</p></div>` : ''}

  ${gallery ? `<div class="cs-gal">
    ${gallery}
  </div>` : ''}

  <a class="cs-next" href="${next.id}.html" style="--pb:${esc(next.bg || '#d9d5cb')}">
    <span><span class="cap mute">Next project</span><span class="cs-next-t">${esc(next.title)}</span></span>
    <span class="cs-next-img"><img src="../images/${nextStill}" alt="" loading="lazy" /></span>
  </a>
  <footer class="cs-foot cap">
    <span class="mute">© ${year} Alex Tait</span>
    <a href="${prev.id}.html">← ${esc(prev.title)}</a>
    <button type="button" data-open="talk" aria-controls="talk" aria-expanded="false" style="text-align:left">Get in touch</button>
    <a href="#top" onclick="scrollTo({top:0,behavior:'smooth'});return false">Back to top ↑</a>
  </footer>
</main>

${OVERLAYS}

<div class="grain" aria-hidden="true"></div>
<script src="../assets/noa.js"></script>
<script>
/* leaving fades the page; ← / → step through the run, Esc goes back */
document.querySelectorAll('a.cs-next, a.back, #name-link, .cs-foot a[href$=".html"]').forEach(a =>
  a.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || window.NOA_REDUCE) return;
    e.preventDefault(); document.body.classList.add('leaving');
    setTimeout(() => { location.href = a.href; }, 260);
  }));
addEventListener('pageshow', e => { if (e.persisted) document.body.classList.remove('leaving'); });
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.ov.open')) return;
  if (e.key === 'ArrowRight') location.href = '${next.id}.html';
  else if (e.key === 'ArrowLeft') location.href = '${prev.id}.html';
  else if (e.key === 'Escape') location.href = '${home}';
});
</script>
</body>
</html>`;

  fs.writeFileSync(path.join('work', `${p.id}.html`), page);
}

// ── sitemap ────────────────────────────────────────────────────
const urls = [
  { loc: SITE + '/', pri: '1.0', freq: 'monthly' },
  { loc: SITE + '/sketchbook.html', pri: '0.9', freq: 'monthly' },
  { loc: SITE + '/shop.html', pri: '0.8', freq: 'weekly' },
  ...PROJECTS.map(p => ({ loc: `${SITE}/work/${p.id}.html`, pri: '0.7', freq: 'monthly' }))
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync('sitemap.xml', sitemap);

console.log(`Generated ${PROJECTS.length} project pages in /work/ + sitemap (${urls.length} URLs).`);
