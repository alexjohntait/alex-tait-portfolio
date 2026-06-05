// Generates a standalone, crawlable, SEO-rich HTML page per project into /work/.
// Reads data + CSS straight from index.html so pages stay identical and in sync.
import fs from 'fs';
import path from 'path';

const SITE = 'https://alexjohntait.com';
const html = fs.readFileSync('index.html', 'utf8');

// ── pull data + styles out of the SPA ──────────────────────────
const grab = (re, label) => { const m = html.match(re); if (!m) throw new Error('Could not find ' + label); return m[1]; };
const PROJECTS = JSON.parse(grab(/const PROJECTS = (\[[\s\S]*?\n\]);/, 'PROJECTS'));
const ASSETS   = JSON.parse(grab(/const ASSETS = (\{[\s\S]*?\});/, 'ASSETS'));
const GALLERY  = JSON.parse(grab(/const GALLERY = (\{[\s\S]*?\});/, 'GALLERY'));
const CSS      = grab(/<style>([\s\S]*?)<\/style>/, 'CSS');

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  const hero = ASSETS[p.id] || {};
  const list = [{ file: hero.file, kind: hero.kind, w: hero.w, h: hero.h }, ...(GALLERY[p.id] || [])].filter(m => m.file);
  const prev = PROJECTS[idx - 1], next = PROJECTS[idx + 1];
  const cat = p.category.charAt(0).toUpperCase() + p.category.slice(1);
  const heroImg = `${SITE}/images/${hero.file}`;
  const desc = (p.desc || p.caption || `${p.title}: ${cat.toLowerCase()} illustration and motion work by Alex Tait.`).replace(/\s+/g, ' ').trim();
  const metaDesc = desc.length > 300 ? desc.slice(0, 297).trim() + '…' : desc;
  const glow = rgba(pickVivid(p.bg, p.fg), 0.2);

  const copyHtml = (p.desc || p.caption || `An illustration and motion project by Alex Tait.`)
    .split('\n').filter(s => s.trim()).map(s => `<p>${esc(s.trim())}</p>`).join('');

  const tagList = (p.tags || '').split('/').map(t => t.trim()).filter(Boolean);
  const tagsHtml = tagList.length ? `<div class="project-tags">${tagList.map(t => `<span class="project-tag">${esc(t)}</span>`).join('')}</div>` : '';

  const mediaHtml = list.length <= 1
    ? `<div class="project-solo">${list.length ? media(list[0], p.title, true) : ''}</div>`
    : `<div class="project-masonry">${list.map((m, n) => `<figure class="m-item">${media(m, `${p.title} ${n + 1}`, n === 0)}</figure>`).join('')}</div>`;

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
  <div class="glow" style="opacity:1; box-shadow: inset 0 0 110px 10px ${glow};" aria-hidden="true"></div>

  <header>
    <a href="../index.html" class="wordmark"><img class="sig" src="/assets/signature.png" alt="Alex Tait" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Alex Tait'}))" /></a>
    <div class="header-right">
      <nav class="nav" aria-label="Primary">
        <a href="../index.html">Work</a>
        <a href="../index.html#about">About</a>
      </nav>
      <div class="dots" aria-hidden="true"><span class="dot" style="background:#ff69b4"></span><span class="dot" style="background:#02b34b"></span><span class="dot" style="background:#ff1d19"></span></div>
    </div>
  </header>

  <article>
    <div class="pview-bar">
      <a href="../index.html" class="back-link"><span aria-hidden="true">←</span> All work</a>
      <span class="pview-count">${String(idx + 1).padStart(2, '0')} / ${String(PROJECTS.length).padStart(2, '0')}</span>
    </div>
    <div class="project-stage">
      <div class="project-media-col">${mediaHtml}</div>
      <div class="project-info">
        <h1 class="project-title">${esc(p.title)}</h1>
        <div class="project-meta">
          <div class="meta-row"><span class="meta-label">Client</span><span class="meta-value">${esc(p.client)}</span></div>
          <div class="meta-row"><span class="meta-label">Category</span><span class="meta-value">${esc(cat)}</span></div>
          <div class="meta-row"><span class="meta-label">Year</span><span class="meta-value">${esc(p.year)}</span></div>
        </div>
        <div class="project-desc">${copyHtml}</div>
        ${tagsHtml}
      </div>
    </div>
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
  // shop hidden for now — add back: { loc: SITE + '/shop.html', pri: '0.8', freq: 'weekly' },
  ...PROJECTS.map(p => ({ loc: `${SITE}/work/${p.id}.html`, pri: '0.7', freq: 'monthly' }))
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync('sitemap.xml', sitemap);

console.log(`Generated ${PROJECTS.length} project pages in /work/ + sitemap (${urls.length} URLs).`);
