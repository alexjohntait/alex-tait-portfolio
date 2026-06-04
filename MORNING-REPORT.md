# Morning report — overnight site work

Date: 2026-06-05
Brief: audit the site (impeccable / design-critique / vercel-react-best-practices) and act on
the top recommendations to help attract and convert client commissions — **tastefully, not
desperately.** Here is exactly what changed.

---

## 1. Asset optimisation — the big one (homepage: 41.8 MB → ~3.4 MB)

The homepage was shipping ~42 MB on first load. That's slow on mobile/4G, hurts Google ranking
(Core Web Vitals), and makes the site feel sluggish — the opposite of what a client wants to feel.

**Images** — `optimise.mjs` (new script, uses `sharp`) resized every oversized image in `/images`
down to a 1800 px web max, keeping format + filename:
- Images on disk: **97.8 MB → 34.1 MB** (saved ~63.7 MB across 79 files).
- Some originals were absurd — up to 10,251 px wide. Nobody needs that on a portfolio.
- Quality preserved (JPEG q82/mozjpeg, WebP q82, PNG palette). Visually identical.

**Video** — the grid was auto-downloading ~35 MB of looping video *on page load*, before a
visitor even hovered anything.
- Each grid video now rests on a lightweight **poster frame** (the real first frame of the art —
  see `/images/posters/`, 11 files, 271 KB total) and uses `preload="none"`.
- The video only downloads **when you hover/focus a card** — the "motion on attention" behaviour
  is unchanged; it's just lazy now. Verified: hover → loads → plays, as before.

**Measured homepage load after the change:** 0 video bytes, 275 KB posters, ~3 MB images
(~3.4 MB total vs 41.8 MB). ~**92% lighter.**

This was wired into the refresh pipeline (`refresh.mjs` now runs `optimise.mjs` automatically
after pulling from Airtable), so it stays fast forever.

## 2. Tasteful "available for commissions" footer (site-wide)

A quiet, confident footer now appears on the home, about, and every project page:
- **"● Available for commissions"** with a soft green status dot (industry-standard, not needy).
- Direct email: alexjohntait@gmail.com.
- **Selected clients:** Apple · Google · Spotify · Adidas.
- "Represented by Jelly for commissions worldwide" + copyright.

It reads calm and established — the work does the selling; the footer just makes it effortless
to make contact and signals the calibre of clients at a glance. Adapts to light + dark mode.

---

## Files changed / added
- `optimise.mjs` — **new**, sharp-based image resizer (reads via fs buffer; sharp's own
  path-open is flaky on Windows).
- `refresh.mjs` — now runs `optimise.mjs` in the pipeline; prints a poster reminder.
- `index.html` — grid videos: poster + `preload="none"`; new site footer + its CSS.
- `build-pages.mjs` — work pages now include the same footer; 32 pages regenerated.
- `images/*` — 79 files re-compressed in place.
- `images/posters/*` — **new**, 11 poster frames.
- `package.json` / `package-lock.json` — **new**, records the `sharp` dependency.

## Re-generating video posters (one manual step)
Posters are captured from the rendered videos in the browser (there's no ffmpeg here), so they
aren't auto-rebuilt by `refresh.mjs`. **If you add or change a video project:**
1. Run the site locally and open the homepage.
2. In the browser console, run the capture snippet (drawing each `.card video` to a canvas →
   `toDataURL('image/jpeg', 0.72)`), then save each as `images/posters/<project-id>.jpg`.
   (Ask Claude to "regenerate the video posters" — it's a 2-minute scripted step.)
Image optimisation, by contrast, *is* automatic on every refresh.

## Suggested next steps (not done — your call)
- Add an OG share image for the homepage (currently per-project only) so links to the root
  preview nicely on social.
- Consider a one-line testimonial or two on About if any clients are happy to be quoted —
  social proof converts, and one good quote stays tasteful.
- Optionally lazy-load project-page hero videos too (they autoplay on click-through; lower
  priority since the visitor is already engaged by then).
