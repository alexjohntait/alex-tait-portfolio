/* Shared behaviour for every page: the clock, day / night, the menu and
   get-in-touch overlays, the email copy, the bending media on case pages
   and video that only plays while it is on screen. */
(() => {
  const root = document.documentElement;
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.NOA_REDUCE = REDUCE;

  /* ── day / night ─────────────────────────────────────────── */
  const store = {
    get() { try { return localStorage.getItem('noa-theme'); } catch { return null; } },
    set(v) { try { localStorage.setItem('noa-theme', v); } catch {} }
  };
  const btns = document.querySelectorAll('[data-theme-set]');
  const paint = t => {
    root.dataset.theme = t;
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = t === 'night' ? '#1f1e1b' : '#ebe8e1';
  };
  paint(root.dataset.theme || 'day');
  btns.forEach(b => b.addEventListener('click', () => { paint(b.dataset.themeSet); store.set(b.dataset.themeSet); }));

  /* ── the header takes a paper backing once the page moves under it ── */
  const hd = document.querySelector('.hd');
  if (hd) {
    const solid = () => hd.classList.toggle('solid', scrollY > 8);
    addEventListener('scroll', solid, { passive: true }); solid();
  }

  /* ── the clock: London time, ticking on the minute ───────── */
  const clock = document.querySelector('.clock-t');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
    const tick = () => { clock.textContent = fmt.format(new Date()); };
    tick();
    setTimeout(() => { tick(); setInterval(tick, 60000); }, (60 - new Date().getSeconds()) * 1000);
  }

  /* ── overlays ────────────────────────────────────────────── */
  let opener = null;
  const shut = ov => {
    ov.classList.remove('open'); ov.setAttribute('aria-hidden', 'true');
    document.querySelectorAll(`[aria-controls="${ov.id}"]`).forEach(b => b.setAttribute('aria-expanded', 'false'));
    document.body.style.overflow = '';
    if (opener) { opener.focus(); opener = null; }
  };
  const show = (ov, from) => {
    document.querySelectorAll('.ov.open').forEach(o => o !== ov && o.classList.remove('open'));
    opener = from || null;
    ov.classList.add('open'); ov.setAttribute('aria-hidden', 'false');
    document.querySelectorAll(`[aria-controls="${ov.id}"]`).forEach(b => b.setAttribute('aria-expanded', 'true'));
    document.body.style.overflow = 'hidden';
    const f = ov.querySelector('a, button'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 60);
  };
  document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    const ov = document.getElementById(b.dataset.open);
    ov.classList.contains('open') ? shut(ov) : show(ov, b);
  }));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => shut(b.closest('.ov'))));
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const o = document.querySelector('.ov.open'); if (o) { e.stopImmediatePropagation(); shut(o); }
  }, true);
  /* a tile that points at this same page just closes the menu */
  document.querySelectorAll('.tile').forEach(t => t.addEventListener('click', e => {
    const u = new URL(t.href, location.href);
    if (u.pathname === location.pathname && window.NOA_VIEW) {
      e.preventDefault(); shut(t.closest('.ov')); window.NOA_VIEW(u.hash.slice(1) || 'work');
    }
  }));
  window.NOA_SHUT = () => document.querySelectorAll('.ov.open').forEach(shut);

  /* ── copy the email address in one click ─────────────────── */
  document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); } catch { location.href = 'mailto:' + b.dataset.copy; return; }
    const n = b.parentElement.querySelector('.copied');
    if (n) { n.classList.add('on'); setTimeout(() => n.classList.remove('on'), 1600); }
  }));

  /* ── video plays only while it can be seen ───────────────── */
  const vids = document.querySelectorAll('video[data-auto]');
  if (vids.length) {
    if (REDUCE) vids.forEach(v => v.setAttribute('controls', ''));
    else if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause();
      }), { rootMargin: '150px 0px', threshold: .05 });
      vids.forEach(v => io.observe(v));
    }
  }

  /* ── media that arrives bent and straightens as it rises ─── */
  const warps = [...document.querySelectorAll('[data-warp]')];
  if (warps.length && !REDUCE) {
    let ticking = false;
    const run = () => {
      ticking = false;
      const vh = innerHeight;
      for (const el of warps) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -50 || r.top > vh + 50) continue;
        /* 0 as the top edge enters the bottom of the window, 1 by the time it
           has climbed two-thirds of the way up */
        const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * .66)));
        const e = 1 - Math.pow(1 - p, 3);
        el.style.setProperty('--bend', ((1 - e) * 46).toFixed(2) + '%');
        el.style.setProperty('--lift', ((1 - e) * 60).toFixed(1) + 'px');
      }
    };
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(run); } };
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', req);
    run();
  }
})();
