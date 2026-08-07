// Generates a standalone, crawlable, SEO-rich HTML page per project into /work/.
// Reads data + CSS straight from index.html so pages stay identical and in sync.
import fs from 'fs';
import path from 'path';

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

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colourfulness = hex => { hex = hex.replace('#',''); const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16); return Math.max(r,g,b)-Math.min(r,g,b); };
const pickVivid = (bg, fg) => (colourfulness(fg) > colourfulness(bg) ? fg : bg);

function media(m, alt) {
  const src = `../images/${m.file}`;
  const ar = (m.w && m.h) ? ` style="aspect-ratio:${m.w} / ${m.h}"` : '';
  if (m.kind === 'video')
    return `<video src="${src}#t=0.1" autoplay loop muted playsinline preload="metadata" aria-label="${esc(alt)}"${ar}></video>`;
  return `<img src="${src}" alt="${esc(alt)}" loading="lazy"${m.w && m.h ? ` width="${m.w}" height="${m.h}"` : ''}${ar} />`;
}

// extra rules for the standalone page (the modal .pop-* classes don't need
// these — a page has a back-link, a reading column and prev/next nav)
const EXTRA_CSS = `
    .standalone { max-width: 900px; margin: 0 auto; padding: clamp(90px, 11vw, 130px) var(--pad, 20px) 40px; }
    .standalone .back-link {
      display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 500;
      color: var(--muted); text-decoration: none; margin-bottom: clamp(22px, 4vw, 40px);
    }
    .standalone .back-link:hover { color: var(--accent); }
    .standalone .pop-media { border-radius: 0; }
    .standalone .pv-nav {
      display: flex; justify-content: space-between; gap: 20px; margin-top: clamp(50px, 8vw, 90px);
      padding-top: 22px; border-top: 1px solid var(--line);
    }
    .standalone .pv-nav a { text-decoration: none; color: var(--ink); max-width: 46%; }
    .standalone .pv-nav a:hover { color: var(--accent); }
    .standalone .pv-nav .dir { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
    .standalone .pv-nav .ti { font-family: var(--sans); font-weight: 400; font-size: clamp(17px, 2vw, 22px); letter-spacing: -0.01em; }
    .standalone .pv-nav .next { text-align: right; margin-left: auto; }
`;

fs.mkdirSync('work', { recursive: true });

PROJECTS.forEach((p, idx) => {
  if (BESPOKE.has(p.id)) { console.log(`↩ skipping bespoke case study: work/${p.id}.html`); return; }
  const hero = ASSETS[p.id] || {};
  const list = [{ file: hero.file, kind: hero.kind, w: hero.w, h: hero.h }, ...(GALLERY[p.id] || [])].filter(m => m.file);
  const rest = list.slice(1);
  const prev = PROJECTS[idx - 1], next = PROJECTS[idx + 1];
  const catList = String(p.category || '').split(',').map(s => s.trim()).filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1));
  const cat = catList.join(' · ') || 'Illustration';
  const heroImg = `${SITE}/images/${hero.file}`;
  const desc = (p.desc || p.caption || `${p.title}: ${cat.toLowerCase()} illustration and motion work by Alex Tait.`).replace(/\s+/g, ' ').trim();
  const metaDesc = desc.length > 300 ? desc.slice(0, 297).trim() + '…' : desc;
  const vivid = pickVivid(p.bg, p.fg);

  const jsonld = {
    "@context": "https://schema.org", "@type": "VisualArtwork",
    "name": p.title,
    "creator": { "@type": "Person", "name": "Alex Tait", "url": SITE + "/" },
    "artMedium": "Illustration, Motion design",
    "genre": cat,
    "dateCreated": String(p.year || ''),
    "image": heroImg,
    "description": desc,
    "url": `${SITE}/work/${p.id}.html`,
    "copyrightHolder": { "@type": "Person", "name": "Alex Tait" },
    "isPartOf": { "@type": "WebSite", "name": "Alex Tait", "url": SITE + "/" }
  };
  if (p.client && p.client !== 'Personal') jsonld.commissioner = { "@type": "Organization", "name": p.client };

  const metaBlock =
    (p.client && p.client !== 'Personal' ? `<b>CLIENT</b> ${esc(p.client)}<br />` : '') +
    (p.year ? `<b>DATE</b> ${esc(p.year)}<br />` : '') +
    `<b>FIELD</b> ${esc(cat)}`;

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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet" />
  <style>${CSS}${EXTRA_CSS}</style>
</head>
<body>

  <header>
    <button class="menu-btn" id="menu-btn" aria-label="Open menu" aria-expanded="false"><i></i></button>
  </header>

  <div class="menu-scrim" id="menu-scrim"></div>
  <aside class="menu-panel" id="menu-panel" aria-label="Menu">
    <a class="nav" href="../index.html">Work</a>
    <a class="nav" href="../index.html#case-studies">Case studies</a>
    <button type="button" class="nav" id="about-btn">About</button>
    <a class="nav" href="../shop.html">Shop</a>
    <div class="m-foot">
      <a href="mailto:alexjohntait@gmail.com">alexjohntait@gmail.com</a>
      <a href="https://instagram.com/alextaitillustration" target="_blank" rel="noopener">@alextaitillustration</a>
      <a href="https://www.thisisjelly.com/uk/talent/alex-tait?splash=true" target="_blank" rel="noopener">Represented by Jelly ↗</a>
      <span class="status"><span class="dot"></span> available for commissions</span>
    </div>
  </aside>

  <main class="standalone">
    <a class="back-link" href="../index.html"><span aria-hidden="true">←</span> All work</a>
    <div class="pop-media" style="--pb:${p.bg}">${media(list[0] || {}, p.title)}</div>
    <div class="pop-body">
      <h2>${esc(p.title)}</h2>
      <div class="pop-meta">${metaBlock}</div>
      <p class="pop-desc">${esc(desc)}</p>
    </div>
    ${rest.length ? `<div class="pop-gal">${rest.map((m, n) => media(m, `${p.title} ${n + 2}`)).join('')}</div>` : ''}
    <nav class="pv-nav" aria-label="More projects">
      ${prev ? `<a href="${prev.id}.html"><span class="dir">← Previous</span><span class="ti">${esc(prev.title)}</span></a>` : '<span></span>'}
      ${next ? `<a class="next" href="${next.id}.html"><span class="dir">Next →</span><span class="ti">${esc(next.title)}</span></a>` : ''}
    </nav>
  </main>

  <!-- about overlay: identical to the home page, so the nav feels the same everywhere -->
  <div class="popwrap" id="aboutwrap" role="dialog" aria-modal="true" aria-label="About Alex Tait">
    <div class="pop" id="about-pop" style="width:min(720px, 94vw)">
      <button class="pop-x" id="about-x" aria-label="Close">✕</button>
      <div class="pop-body" style="padding-top:clamp(50px, 7vw, 76px)">
        <h2>I draw characters, and make them <em style="color:var(--ink);font-style:normal">move</em>.</h2>
        <p class="pop-desc" style="margin-bottom:26px">
          I'm an illustrator and motion designer based between Bath and London, making bold
          character work for brands alongside a personal series of dark, gradient creatures.
          My work has been commissioned by Apple, Google, Spotify and Adidas, spanning
          broadcast, social, packaging and print.
        </p>
        <div class="pop-meta" style="margin-bottom:26px"><b>DISCIPLINES</b> Illustration, Motion Design, Art Direction, Editorial<br /><b>SELECTED CLIENTS</b> Apple, Google, Spotify, Adidas, The Telegraph, First Bus, AO, Kueski</div>
        <div class="pop-meta">
          <b>INSTAGRAM</b> <a href="https://instagram.com/alextaitillustration" target="_blank" rel="noopener" style="color:inherit">@alextaitillustration</a><br />
          <b>EMAIL</b> <a href="mailto:alexjohntait@gmail.com" style="color:inherit">alexjohntait@gmail.com</a><br />
          <b>AGENT</b> <a href="https://www.thisisjelly.com/uk/talent/alex-tait?splash=true" target="_blank" rel="noopener" style="color:inherit">Jelly ↗</a><br />
          <b>LOCATION</b> Bath / London
        </div>
      </div>
    </div>
  </div>

  <script>
    // menu
    (function () {
      var btn = document.getElementById('menu-btn'), scrim = document.getElementById('menu-scrim');
      var toggle = function (on) { document.body.classList.toggle('menu-open', on); btn.setAttribute('aria-expanded', on); };
      btn.addEventListener('click', function () { toggle(!document.body.classList.contains('menu-open')); });
      scrim.addEventListener('click', function () { toggle(false); });
      document.querySelectorAll('.menu-panel a').forEach(function (a) { a.addEventListener('click', function () { toggle(false); }); });
      addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });

      var awrap = document.getElementById('aboutwrap'), ax = document.getElementById('about-x');
      document.getElementById('about-btn').addEventListener('click', function () {
        toggle(false); awrap.classList.add('open'); document.body.style.overflow = 'hidden'; ax.focus();
      });
      var closeAbout = function () { awrap.classList.remove('open'); document.body.style.overflow = ''; };
      ax.addEventListener('click', closeAbout);
      awrap.addEventListener('click', function (e) { if (e.target === awrap) closeAbout(); });
      addEventListener('keydown', function (e) { if (e.key === 'Escape' && awrap.classList.contains('open')) closeAbout(); });
    })();
    // reduced motion: pause autoplay, show first frame
    if (matchMedia('(prefers-reduced-motion: reduce)').matches)
      document.querySelectorAll('video').forEach(function (v) { v.removeAttribute('autoplay'); v.pause(); });
    // correct video boxes to true ratio
    document.querySelectorAll('video').forEach(function (v) {
      var set = function () { if (v.videoWidth && v.videoHeight) v.style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight; };
      v.readyState >= 1 ? set() : v.addEventListener('loadedmetadata', set, { once: true });
    });
    // keyboard: ← / → between projects, Esc back to the grid
    var _prev = ${prev ? `'${prev.id}.html'` : 'null'}, _next = ${next ? `'${next.id}.html'` : 'null'};
    addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.body.classList.contains('menu-open') || document.getElementById('aboutwrap').classList.contains('open')) return;
      if (e.key === 'ArrowRight' && _next) location.href = _next;
      else if (e.key === 'ArrowLeft' && _prev) location.href = _prev;
      else if (e.key === 'Escape') location.href = '../index.html';
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join('work', `${p.id}.html`), page);
});

// ── sitemap ────────────────────────────────────────────────────
const urls = [
  { loc: SITE + '/', pri: '1.0', freq: 'monthly' },
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
