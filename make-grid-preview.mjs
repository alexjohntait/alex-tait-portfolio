/* Builds _grid-preview.html: the same work, the same type and tokens, laid
 * out as a plain three-up grid instead of the cloud.
 *
 * A preview, not a second site. It reads PROJECTS / ASSETS straight out of
 * index.html so it cannot drift from what is live, and it is written to a
 * filename git ignores, so looking at it costs nothing and committing it is
 * a deliberate act.
 *
 * Usage: node make-grid-preview.mjs
 */
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const grab = (name, open, close) => {
  const re = new RegExp(`const ${name} = (\\${open}[\\s\\S]*?\\n?\\${close});`);
  const m = html.match(re);
  if (!m) throw new Error(`could not find ${name} in index.html`);
  return JSON.parse(m[1]);
};
const PROJECTS = grab('PROJECTS', '[', ']');
const ASSETS = grab('ASSETS', '{', '}');

/* the same tokens and faces the site runs on, pulled from its own :root so
   the preview is a fair comparison rather than a lookalike */
/* the token block closes on a two-space indent; matching a four-space one
   ran past it and dragged the site's own `header { position: fixed }` in,
   which floated this page's header out over the grid */
const root = html.match(/:root \{[\s\S]*?\n {2}\}/)[0];
const fontLinks = [...html.matchAll(/<link href="https:\/\/(?:api\.fontshare|fonts\.googleapis)[^>]*>/g)]
  .map(m => m[0]).join('\n  ');

const card = p => {
  const a = ASSETS[p.id] || {};
  const src = a.kind === 'video' ? `images/posters/${p.id}.jpg` : `images/${a.file}`;
  const meta = [p.client && p.client !== 'Personal' ? p.client : 'Personal', p.year]
    .filter(Boolean).join(' · ');
  return `    <a class="tile" href="work/${p.id}.html">
      <span class="shot" style="--bg:${p.bg || '#eee'}"><img src="${src}" alt="${p.title}" loading="lazy" /></span>
      <span class="t">${p.title}</span>
      <span class="m">${meta}</span>
    </a>`;
};

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>Grid preview — Alex Tait</title>
  ${fontLinks}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    ${root}
    body { font-family: var(--mono); color: var(--ink); background: var(--paper);
           -webkit-font-smoothing: antialiased; }
    a { color: inherit; text-decoration: none; }

    header { display: flex; align-items: flex-start; justify-content: space-between;
             padding: var(--gx) var(--gx) 0; }
    header img { max-width: var(--sigsz); max-height: var(--sigsz); width: auto; height: auto; display: block; }
    .info { font-family: var(--sans); font-weight: 700;
            font-size: clamp(26px, 3.2vw, 48px); letter-spacing: -0.035em; line-height: 0.96; }

    .bar { display: flex; gap: 0; padding: clamp(28px, 4vw, 56px) var(--gx) 0; }
    .bar b { font-weight: 400; }
    .bar span { padding: 0 9px; color: color-mix(in srgb, var(--ink) 35%, transparent); }

    /* three up, and one up on a phone. minmax with a floor rather than a
       hard 3, so the tiles never squeeze below a size the work survives */
    .grid {
      display: grid; gap: clamp(20px, 2.4vw, 40px) clamp(16px, 1.8vw, 32px);
      grid-template-columns: repeat(3, minmax(0, 1fr));
      padding: clamp(24px, 3vw, 48px) var(--gx) clamp(70px, 10vh, 140px);
    }
    @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }

    .shot { display: block; border-radius: var(--r); overflow: hidden; background: var(--bg);
            aspect-ratio: 4 / 3; }
    .shot img { width: 100%; height: 100%; object-fit: cover; display: block;
                transition: transform 0.5s var(--out); }
    .tile:hover .shot img { transform: scale(1.03); }
    .tile .t { display: block; margin-top: 12px; font-family: var(--sans); font-weight: 700;
               font-size: clamp(19px, 1.6vw, 26px); letter-spacing: -0.035em; line-height: 1.1; }
    .tile .m { display: block; margin-top: 2px; font-size: 13px; line-height: 1.8;
               color: color-mix(in srgb, var(--ink) 55%, transparent); }
    .tile:hover .t { color: var(--accent-sm); }
    @media (prefers-reduced-motion: reduce) { .shot img { transition: none; } }

    .note { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%);
            font-size: 12px; line-height: 1.8; padding: 6px 14px; border-radius: 999px;
            background: var(--ink); color: var(--paper); z-index: 10; }
  </style>
</head>
<body>
  <header>
    <a href="index.html"><img src="assets/signature.gif" alt="Alex Tait" /></a>
    <span class="info">Info</span>
  </header>
  <nav class="bar"><b>Commercial</b><span>/</span><b>Editorial</b><span>/</span><b>Personal</b></nav>
  <main class="grid">
${PROJECTS.map(card).join('\n')}
  </main>
  <p class="note">Grid preview — ${PROJECTS.length} projects. The live site is the cloud.</p>
</body>
</html>
`;

fs.writeFileSync('_grid-preview.html', page);
console.log(`wrote _grid-preview.html — ${PROJECTS.length} projects, 3 up`);
