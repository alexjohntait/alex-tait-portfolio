// Generates a standalone, crawlable case-study page per project into /work/.
// Reads data + CSS straight from index.html so pages stay identical and in sync.
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
const CSS      = grab(/<style>([\s\S]*?)<\/style>/, 'CSS');
const FONTS    = [...html.matchAll(/<link href="https:\/\/api\.fontshare\.com[^>]*>/g)].map(m => m[0]).join('\n  ');
/* the corner-word alignment and the About panel, lifted from the home page
   so a project page's corners and Info match it exactly */
const ALIGN    = grab(/(\/\* ─── the corner words, aligned to the mark ───[\s\S]*?\n\}\)\(\);)/, 'corner alignment');
const ABOUT    = grab(/(<div class="popwrap" id="aboutwrap"[\s\S]*?)\s*<canvas id="ink"/, 'About panel')
  .replace(/href="#showreel"/, 'href="../index.html#showreel"')
  .replace(/href="shop\.html"/, 'href="../shop.html"');

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

function rowHTML(row, title, start) {
  const one = row.length === 1;
  return `<div class="cs-row${one ? ' solo' : ''}">` + row.map((m, k) => {
    const ar = m.w && m.h ? m.w / m.h : null;
    const style = ar ? ` style="--ar:${m.w} / ${m.h}; --f:${ar.toFixed(4)}"` : '';
    return `<figure class="cs-fig${ar ? '' : ' free'}${ar && ar < 1.2 ? ' tall' : ''}"${style}>${media(m, `${title}, image ${start + k}`)}</figure>`;
  }).join('') + `</div>`;
}

// extra rules for the case study, on top of the home page's own
const EXTRA_CSS = `
  .cs { padding: clamp(36px, 5vw, 80px) var(--gx) 0; }

  /* the title at display size, then the work, then what it was: the facts
     and the words on a two-part measure under the hero, so the piece is the
     first thing seen and the page still has a left edge to read down */
  /* set as the Humantold case study sets its title: regular weight, open
     tracking, in the accent — it names the piece rather than shouting over it */
  .cs-title {
    font-family: var(--sans); font-weight: 400;
    font-size: clamp(38px, 6vw, 76px); letter-spacing: -0.015em; line-height: 0.98;
    color: var(--accent); text-wrap: balance; max-width: 18ch;
    margin-bottom: clamp(28px, 3.6vw, 60px);
  }
  .cs-intro {
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 24px clamp(24px, 4vw, 72px);
    margin: clamp(40px, 6vw, 100px) 0 clamp(48px, 7vw, 120px);
  }
  .cs-facts { display: grid; gap: 14px; align-content: start; }
  .cs-facts dt {
    font-size: 13px; line-height: 1.4;
    color: color-mix(in srgb, var(--ink) 50%, transparent);
  }
  .cs-facts dd { font-size: 16px; line-height: 1.4; font-weight: 500; }
  .cs-desc {
    font-size: clamp(19px, 1.7vw, 26px); font-weight: 400;
    letter-spacing: -0.015em; line-height: 1.4; max-width: 36ch;
  }

  /* the work: full measure, its own colour behind it while it loads */
  .cs-hero, .cs-fig { border-radius: var(--r); overflow: hidden; background: var(--pb); }
  .cs-hero { aspect-ratio: var(--ar, auto); }
  /* a portrait or square hero is shown whole, not stretched to the width of
     the sheet: its height caps at the window and the width follows, and the
     facts and words take the room beside it rather than leaving it empty */
  .cs-lead.tall {
    display: grid; grid-template-columns: auto minmax(0, 1fr);
    gap: clamp(28px, 5vw, 96px); align-items: end;
    margin-bottom: clamp(48px, 7vw, 120px);
  }
  .cs-lead.tall .cs-hero { width: min(58vw, calc(86svh * var(--f))); }
  .cs-lead.tall .cs-intro { grid-template-columns: 1fr; margin: 0; }
  .cs-row.solo .cs-fig.tall { width: min(100%, calc(86svh * var(--f))); margin: 0 auto; }
  /* below a laptop there is no width to share: the hero takes the measure
     and the words go under it, as they do for a landscape one */
  @media (max-width: 1000px) {
    .cs-lead.tall { display: block; margin-bottom: 0; }
    .cs-lead.tall .cs-hero { width: min(100%, calc(86svh * var(--f))); }
    .cs-lead.tall .cs-intro { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); margin: clamp(40px, 6vw, 100px) 0 clamp(48px, 7vw, 120px); }
  }
  .cs-hero img, .cs-hero video, .cs-fig img, .cs-fig video {
    display: block; width: 100%; height: 100%; object-fit: cover;
  }
  .cs-fig.free img, .cs-fig.free video { height: auto; }
  .cs-gal { display: grid; gap: clamp(12px, 1.6vw, 28px); }
  .cs-row { display: flex; gap: clamp(12px, 1.6vw, 28px); align-items: flex-start; }
  .cs-row .cs-fig { flex: var(--f, 1) 1 0; min-width: 0; aspect-ratio: var(--ar, auto); }
  .cs-row.solo .cs-fig { flex: none; width: 100%; }

  /* the way on: the next piece in the grid's own order, big enough to be
     the obvious thing to do once the page runs out */
  .cs-next {
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: clamp(20px, 4vw, 72px); align-items: end;
    margin-top: clamp(80px, 12vw, 200px); padding: clamp(28px, 3vw, 44px) 0 0;
    border-top: 1px solid color-mix(in srgb, var(--ink) 14%, transparent);
    text-decoration: none; color: var(--ink);
  }
  .cs-next-k { display: block; font-size: 13px; margin-bottom: 14px;
    color: color-mix(in srgb, var(--ink) 50%, transparent); }
  .cs-next-t {
    display: block; font-weight: 400;
    font-size: clamp(32px, 4.6vw, 64px); letter-spacing: -0.015em; line-height: 0.98;
    text-wrap: balance; transition: color 0.2s ease;
  }
  .cs-next-img { display: block; border-radius: var(--r); overflow: hidden; aspect-ratio: 4 / 3; background: var(--pb); }
  .cs-next-img img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform 200ms ease; }
  @media (hover: hover) {
    .cs-next:hover .cs-next-t { color: var(--accent-sm); }
    .cs-next:hover .cs-next-img img { transform: scale(1.03); }
  }
  .cs-foot {
    display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap;
    padding: clamp(48px, 7vw, 110px) 0 clamp(28px, 4vw, 56px);
    font-size: 14px; color: color-mix(in srgb, var(--ink) 50%, transparent);
  }
  .cs-foot a { color: inherit; text-decoration: none; transition: color 0.2s ease; }
  .cs-foot a:hover { color: var(--accent-sm); }

  @media (max-width: 760px) {
    .cs-intro, .cs-lead.tall .cs-intro { grid-template-columns: 1fr; }
    .cs-facts { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
    .cs-next { grid-template-columns: 1fr; }
    .cs-next-img { order: -1; }
  }
  @media (max-width: 560px) {
    /* a phone has no width to share: everything stacks, whole */
    .cs-row { flex-direction: column; }
    .cs-row .cs-fig, .cs-row.solo .cs-fig.tall { width: 100%; flex: none; }
  }

  /* arriving: the heading settles, then the work comes up under it */
  .cs-title, .cs-intro, .cs-hero { animation: tileUp 0.6s var(--out) both; }
  .cs-hero { animation-delay: 70ms; }
  .cs-intro { animation-delay: 140ms; }
  body.leaving .cs { opacity: 0; transform: translateY(-12px); transition: opacity 0.26s var(--out), transform 0.26s var(--out); }
  @media (prefers-reduced-motion: reduce) {
    .cs-title, .cs-intro, .cs-hero { animation: none; }
    .cs-next-t, .cs-next-img img, .cs-foot a { transition: none; }
  }
`;

fs.mkdirSync('work', { recursive: true });

for (const p of PROJECTS) {
  if (BESPOKE.has(p.id)) { console.log(`↩ skipping bespoke case study: work/${p.id}.html`); continue; }
  const group = isPersonal(p) ? 'sketchbook' : 'work';
  const run = RUNS[group];
  const at = run.indexOf(p);
  const next = run[(at + 1) % run.length], prev = run[(at - 1 + run.length) % run.length];
  const home = group === 'work' ? '../index.html' : '../sketchbook.html';
  const groupName = group === 'work' ? 'Work' : 'Sketchbook';

  const hero = { ...(ASSETS[p.id] || {}) };
  if (!hero.w) Object.assign(hero, await dims(hero.kind === 'video' ? `images/posters/${p.id}.jpg` : `images/${hero.file}`));
  const heroAr = hero.w && hero.h ? hero.w / hero.h : null;
  const heroStill = hero.kind === 'video' ? `posters/${p.id}.jpg` : hero.file;
  const rest = (GALLERY[p.id] || []).filter(m => m.file);

  const nextA = ASSETS[next.id] || {};
  const nextThumb = `../images/${nextA.kind === 'video' ? `posters/${next.id}.jpg` : nextA.file}`;

  const catList = String(p.category || '').split(',').map(s => s.trim()).filter(Boolean).map(cap);
  const cat = catList.join(', ') || 'Illustration';
  const heroImg = `${SITE}/images/${heroStill}`;
  const desc = (p.desc || p.caption || '').replace(/\s+/g, ' ').trim();
  const about = desc || `${p.title}: ${cat.toLowerCase()} illustration and motion work by Alex Tait.`;
  const metaDesc = about.length > 300 ? about.slice(0, 297).trim() + '…' : about;
  const client = p.client && p.client !== 'Personal' ? p.client : null;

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
    client ? ['Client', client] : ['Project', 'Personal'],
    p.year ? ['Year', p.year] : null,
    ['Discipline', catList.filter(c => c !== 'Personal').join(', ') || 'Illustration'],
  ].filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

  let n = 2;
  const gallery = rows(rest).map(r => { const h = rowHTML(r, p.title, n); n += r.length; return h; }).join('\n    ');

  const heroMedia = hero.kind === 'video'
    ? `<video src="../images/${hero.file}#t=0.1" poster="../images/${heroStill}" muted loop playsinline preload="auto" data-auto aria-label="${esc(p.title)}"></video>`
    : media(hero, client ? `${p.title} for ${client}` : p.title, { hero: true });

  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(p.title)} — Alex Tait, Illustrator &amp; Motion Designer</title>
  <meta name="description" content="${esc(metaDesc)}" />
  <meta name="author" content="Alex Tait" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="theme-color" content="#ff4a1d" />
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
  <link rel="preconnect" href="https://api.fontshare.com" />
  ${FONTS}
  <link rel="preload" as="image" href="../images/${heroStill}" />
  <style>${CSS}${EXTRA_CSS}</style>
</head>
<body style="--pb:${esc(p.bg || '#eee')}">

<div class="name"><a href="${home}" id="name-link" aria-label="Alex Tait — back to ${groupName}"><img src="../assets/signature.gif" alt="Alex Tait" /></a></div>

<header>
  <a class="menu-btn pagelink" id="page-link" href="${home}"><span>${groupName}</span></a>
  <button class="menu-btn" id="menu-btn" aria-label="Information and menu" aria-expanded="false"><span>Info</span></button>
</header>

<main class="cs">
  <h1 class="cs-title">${esc(p.title)}</h1>
  <div class="cs-lead${heroAr && heroAr < 1.2 ? ' tall' : ''}">
    <figure class="cs-hero"${heroAr ? ` style="--ar:${hero.w} / ${hero.h}; --f:${heroAr.toFixed(4)}"` : ''}>${heroMedia}</figure>
    <div class="cs-intro">
      <dl class="cs-facts">${facts}</dl>
      ${desc ? `<p class="cs-desc">${esc(desc)}</p>` : ''}
    </div>
  </div>
  ${gallery ? `<div class="cs-gal">
    ${gallery}
  </div>` : ''}

  <a class="cs-next" href="${next.id}.html" style="--pb:${esc(next.bg || '#eee')}">
    <span><span class="cs-next-k">Next project</span><span class="cs-next-t">${esc(next.title)}</span></span>
    <span class="cs-next-img"><img src="${nextThumb}" alt="" loading="lazy" decoding="async" /></span>
  </a>
  <footer class="cs-foot">
    <a href="${prev.id}.html">← ${esc(prev.title)}</a>
    <a href="${home}">All ${groupName.toLowerCase()}</a>
  </footer>
</main>

${ABOUT}

<script>
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Info: the same panel as the home page, with the same open and close */
(() => {
  const btn = document.getElementById('menu-btn');
  const w = document.getElementById('aboutwrap'), x = document.getElementById('about-x');
  let t;
  const open = () => {
    clearTimeout(t); w.classList.remove('closing'); w.classList.add('open');
    btn.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden';
    if (REDUCE) w.classList.add('in'); else requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('in')));
    x.focus();
  };
  const close = () => {
    w.classList.remove('in'); btn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = '';
    if (REDUCE) return w.classList.remove('open');
    w.classList.add('closing'); t = setTimeout(() => w.classList.remove('open', 'closing'), 220);
  };
  btn.addEventListener('click', open);
  x.addEventListener('click', close);
  w.addEventListener('click', e => { if (e.target === w) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && w.classList.contains('open')) close(); });
})();

/* video plays while it is on screen and rests when it is not; a box with
   no ratio of its own takes the video's once it knows it */
(() => {
  const vids = document.querySelectorAll('video[data-auto]');
  vids.forEach(v => {
    const box = v.parentElement;
    const set = () => { if (v.videoWidth && !box.style.getPropertyValue('--ar')) box.style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight; };
    v.readyState >= 1 ? set() : v.addEventListener('loadedmetadata', set, { once: true });
  });
  if (REDUCE) { vids.forEach(v => v.setAttribute('controls', '')); return; }
  if (!('IntersectionObserver' in window)) { vids.forEach(v => v.play().catch(() => {})); return; }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause();
  }), { rootMargin: '200px 0px', threshold: 0.1 });
  vids.forEach(v => io.observe(v));
})();

/* leaving: the page steps away the way the grid does, and comes back
   whole if the browser restores it from history */
document.querySelectorAll('a.cs-next, .cs-foot a, #page-link, #name-link').forEach(a =>
  a.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || REDUCE) return;
    e.preventDefault();
    document.body.classList.add('leaving');
    setTimeout(() => { location.href = a.href; }, 260);
  }));
addEventListener('pageshow', e => { if (e.persisted) document.body.classList.remove('leaving'); });

/* keyboard: ← / → through the run, Esc back to it */
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.getElementById('aboutwrap').classList.contains('open')) return;
  if (e.key === 'ArrowRight') location.href = '${next.id}.html';
  else if (e.key === 'ArrowLeft') location.href = '${prev.id}.html';
  else if (e.key === 'Escape') location.href = '${home}';
});

${ALIGN}
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
