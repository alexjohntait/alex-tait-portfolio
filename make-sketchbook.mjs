/* Generates sketchbook.html from index.html.
 *
 * The two pages are the same grid, the same styles and the same builder;
 * only which half of the work they draw is different. Rather than keep two
 * near-identical files that drift apart, this derives one from the other and
 * flips the handful of things that actually differ: the page constant, the
 * head, the corner link, and the filter bar (which has nothing to filter on
 * a page that is all one category).
 *
 * Run after any change to index.html. refresh.mjs calls it, so an Airtable
 * rebuild keeps both pages in step.
 *
 * Usage: node make-sketchbook.mjs
 */
import fs from 'fs';

let html = fs.readFileSync('index.html', 'utf8');
const swap = (from, to, what) => {
  if (html.split(from).length - 1 !== 1) throw new Error(`make-sketchbook: ${what} not found exactly once`);
  html = html.replace(from, to);
};

/* which half of the work this page builds */
swap(`const PAGE = 'work';`, `const PAGE = 'sketchbook';`, 'the page constant');

/* head: its own title, description and canonical, and kept out of search
   results' way as a second index of the same site rather than a rival to it */
swap(
  `<title>Alex Tait — Illustrator &amp; Motion Designer, Bath &amp; London</title>`,
  `<title>Sketchbook — Alex Tait, Illustrator &amp; Motion Designer</title>`,
  'the title');
swap(
  `<meta name="description" content="Alex Tait is an illustrator and motion designer based between Bath and London, represented by Jelly. Bold, character-driven commercial and editorial illustration and animation for brands and publications." />`,
  `<meta name="description" content="Personal work and sketchbook pages by Alex Tait, illustrator and motion designer between Bath and London: characters, loops and drawings made for their own sake." />`,
  'the description');
swap(
  `<link rel="canonical" href="https://alexjohntait.com/" />`,
  `<link rel="canonical" href="https://alexjohntait.com/sketchbook.html" />`,
  'the canonical');
swap(
  `<meta property="og:title" content="Alex Tait — Illustrator &amp; Motion Designer" />`,
  `<meta property="og:title" content="Sketchbook — Alex Tait" />`,
  'the og:title');

/* the corner points back to the commissions */
swap(
  `<a class="menu-btn pagelink" id="page-link" href="sketchbook.html">Sketchbook</a>`,
  `<a class="menu-btn pagelink" id="page-link" href="index.html">Work</a>`,
  'the corner link');

/* every piece here is personal, so there is nothing to filter */
const pillStart = html.indexOf('<div class="pill"');
const pillEnd = html.indexOf('</div>', pillStart);
if (pillStart < 0 || pillEnd < 0) throw new Error('make-sketchbook: the filter bar not found');
html = html.slice(0, pillStart) + html.slice(pillEnd + '</div>'.length).replace(/^\r?\n/, '');

/* and the script that drives it would throw on an empty selector list —
   it does not, querySelectorAll returns nothing, but the announce line it
   feeds is dead code either way. Left in place: it costs nothing and keeps
   this generator to swaps rather than surgery. */

fs.writeFileSync('sketchbook.html', html);

const n = (html.match(/"category":"[^"]*personal/g) || []).length;
console.log(`wrote sketchbook.html (PAGE=sketchbook, filter bar removed)`);
