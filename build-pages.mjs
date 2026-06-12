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
// contrast-aware ink for the project's colour band (WCAG relative luminance)
const heroInk = bg => {
  let hex = bg.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => {
    let v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#16120f' : '#fff';
};
const colourfulness = hex => { hex = hex.replace('#',''); const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16); return Math.max(r,g,b)-Math.min(r,g,b); };
const pickVivid = (bg, fg) => (colourfulness(fg) > colourfulness(bg) ? fg : bg);
const rgba = (hex, a) => { hex = hex.replace('#',''); return `rgba(${parseInt(hex.slice(0,2),16)}, ${parseInt(hex.slice(2,4),16)}, ${parseInt(hex.slice(4,6),16)}, ${a})`; };

function media(m, alt, eager) {
  const src = `../images/${m.file}`;
  const ar = (m.w && m.h) ? ` style="aspect-ratio:${m.w} / ${m.h}"` : '';
  if (m.kind === 'video')
    return `<video src="${src}#t=0.1" autoplay loop muted playsinline preload="${eager ? 'auto' : 'metadata'}" aria-label="${esc(alt)}"${ar}></video>`;
  return `<img src="${src}" alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}"${m.w && m.h ? ` width="${m.w}" height="${m.h}"` : ''}${ar} />`;
}

fs.mkdirSync('work', { recursive: true });

PROJECTS.forEach((p, idx) => {
  if (BESPOKE.has(p.id)) { console.log(`↩ skipping bespoke case study: work/${p.id}.html`); return; }
  const hero = ASSETS[p.id] || {};
  const list = [{ file: hero.file, kind: hero.kind, w: hero.w, h: hero.h }, ...(GALLERY[p.id] || [])].filter(m => m.file);
  const prev = PROJECTS[idx - 1], next = PROJECTS[idx + 1];
  const catList = String(p.category || '').split(',').map(s => s.trim()).filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1));
  const cat = catList.join(', ') || 'Illustration';
  const heroImg = `${SITE}/images/${hero.file}`;
  const desc = (p.desc || p.caption || `${p.title}: ${cat.toLowerCase()} illustration and motion work by Alex Tait.`).replace(/\s+/g, ' ').trim();
  const metaDesc = desc.length > 300 ? desc.slice(0, 297).trim() + '…' : desc;
  const glow = rgba(pickVivid(p.bg, p.fg), 0.15);

  // long description preferred; fall back to caption; omit when neither exists
  const copySrc = (p.desc || p.caption || '').trim();
  const copyHtml = copySrc
    ? `<div class="pv-desc">${copySrc.split('\n').filter(s => s.trim()).map(s => `<p>${esc(s.trim())}</p>`).join('')}</div>`
    : '';

  // hero leads; the rest flows as a full-width masonry
  const heroHtml = list.length
    ? `<figure class="pv-heromedia">${media(list[0], p.title, true)}</figure>`
    : '';
  const rest = list.slice(1);
  const galleryHtml = rest.length
    ? `<div class="project-masonry pv-gallery">${rest.map((m, n) => `<figure class="m-item">${media(m, `${p.title} ${n + 2}`, false)}</figure>`).join('')}</div>`
    : '';
  const metaLine = p.client === 'Personal'
    ? `${catList.map(esc).join(' &middot; ')} &middot; ${esc(p.year)}`
    : `${esc(p.client)} &middot; ${catList.map(esc).join(' &middot; ')} &middot; ${esc(p.year)}`;
  const ink = heroInk(p.bg);

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

  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(p.title)} — Alex Tait, Illustrator &amp; Motion Designer</title>
  <meta name="description" content="${esc(metaDesc)}" />
  <meta name="author" content="Alex Tait" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="theme-color" content="#ff1d19" />
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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>${CSS}</style>
</head>
<body>
  <div class="glow" style="opacity:1; box-shadow: inset 0 0 64px 2px ${glow};" aria-hidden="true"></div>

  <header>
    <a href="../index.html" class="wordmark"><img class="sig" src="/assets/signature.png" alt="Alex Tait" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Alex Tait'}))" /></a>
    <div class="header-right">
      <nav class="nav" aria-label="Primary">
        <a href="../index.html">Work</a>
        <a href="../index.html#case-studies" class="nav-cs-link">Case studies</a>
        <a href="../index.html#about">About</a>
        <a href="../shop.html">Shop</a>
      </nav>
      <div class="dots" aria-hidden="true"><span class="dot" style="background:#ff69b4"></span><span class="dot" style="background:#02b34b"></span><span class="dot" style="background:#ff1d19"></span></div>
    </div>
  </header>

  <article>
    <div class="pv-hero" style="background:${p.bg}; color:${ink};">
      <div class="pv-bar">
        <a href="../index.html" class="back-link"><span aria-hidden="true">←</span> All work</a>
        <span class="pview-count">${String(idx + 1).padStart(2, '0')} / ${String(PROJECTS.length).padStart(2, '0')}</span>
      </div>
      <h1 class="pv-title">${esc(p.title)}</h1>
      <p class="pv-meta">${metaLine}</p>
    </div>
    <div class="pv-lead">
      ${heroHtml}
      ${copyHtml}
    </div>
    ${galleryHtml}
    <nav class="project-nav" aria-label="More projects">
      ${prev ? `<a class="pnav" href="${prev.id}.html"><span class="pnav-dir">← Previous</span><span class="pnav-title">${esc(prev.title)}</span></a>` : `<span class="pnav" style="opacity:.2"></span>`}
      ${next ? `<a class="pnav" href="${next.id}.html" style="text-align:right;align-items:flex-end"><span class="pnav-dir">Next →</span><span class="pnav-title">${esc(next.title)}</span></a>` : `<span class="pnav"></span>`}
    </nav>
  </article>

  <footer class="site-footer">
    <div class="foot-inner">
      <div class="foot-cta">
        <span class="foot-status"><span class="foot-dot" aria-hidden="true"></span>Available for commissions</span>
        <a class="foot-mail" href="mailto:alexjohntait@gmail.com">alexjohntait@gmail.com</a>
        <img class="foot-sig" src="/assets/signature.png" alt="" aria-hidden="true" loading="lazy" />
      </div>
      <div class="foot-clients">
        <span class="foot-eyebrow">Selected clients</span>
        <p class="foot-list">Apple · Google · Spotify · Adidas</p>
      </div>
      <div class="foot-meta">
        <span>Represented by <a href="https://www.thisisjelly.com/uk/talent/alex-tait?splash=true" target="_blank" rel="noopener">Jelly</a> for commissions worldwide</span>
        <span>© 2026 Alex Tait</span>
      </div>
    </div>
  </footer>

  <script>
    // honour reduced motion (no SPA here): pause autoplay, show first frame
    if (matchMedia('(prefers-reduced-motion: reduce)').matches)
      document.querySelectorAll('video').forEach(v => { v.removeAttribute('autoplay'); v.pause(); });
    // correct video boxes to true ratio
    document.querySelectorAll('video').forEach(v => {
      const set = () => { if (v.videoWidth && v.videoHeight) v.style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight; };
      v.readyState >= 1 ? set() : v.addEventListener('loadedmetadata', set, { once: true });
    });
    // footer sign-off: the signature writes itself when it scrolls into view
    (function () {
      var fs = document.querySelector('.foot-sig');
      if (!fs || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
      fs.classList.add('ready');
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { fs.classList.add('write'); io.disconnect(); } });
      }, { threshold: 0.4 });
      io.observe(fs);
    })();
    // keyboard nav: ← / → between projects, Esc back to the grid
    var _prev = ${prev ? `'${prev.id}.html'` : 'null'}, _next = ${next ? `'${next.id}.html'` : 'null'};
    addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
