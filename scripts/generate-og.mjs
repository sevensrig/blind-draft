/**
 * Renders the social preview card to `static/og.png` at 1200x630.
 *
 * Drawn as HTML and screenshotted with the Playwright browser the E2E suite
 * already needs, so the card is built from the same tokens as the app and
 * re-running after a palette change keeps it in step.
 *
 * Run with: node scripts/generate-og.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'static', 'og.png');

const WIDTH = 1200;
const HEIGHT = 630;

/* Kept in step with src/app.css by hand — the card is standalone HTML, so it
   can't import the stylesheet. */
const CREAM = '#fffdf5';
const INK = '#000';
const YELLOW = '#ffd93d';
const VIOLET = '#c4b5fd';
const GREEN = '#77dd88';
const RED = '#ff6b6b';
const BLUE = '#8ecae6';

const html = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px;
    background: ${CREAM};
    color: ${INK};
    font-family: 'Space Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    display: flex; flex-direction: column; justify-content: center;
    padding: 68px 72px;
  }
  .title { display: flex; align-items: flex-start; gap: 22px; }
  .dollar {
    background: ${YELLOW};
    border: 6px solid ${INK};
    box-shadow: 12px 12px 0 ${INK};
    padding: 4px 20px 12px;
    font-size: 132px; font-weight: 900; line-height: 0.95;
    letter-spacing: -0.05em;
    transform: rotate(-2deg);
  }
  .rest {
    font-size: 96px; font-weight: 900; line-height: 0.88;
    letter-spacing: -0.02em; text-transform: uppercase;
    padding-top: 6px;
  }
  .tagline {
    margin-top: 54px;
    font-size: 38px; font-weight: 700; line-height: 1.25;
    max-width: 22ch;
  }
  .chips { display: flex; gap: 16px; margin-top: 52px; }
  .chip {
    border: 5px solid ${INK};
    box-shadow: 8px 8px 0 ${INK};
    padding: 12px 22px;
    font-size: 26px; font-weight: 900;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  /* Slight opposing tilts, per the style's rotated-card rule. */
  .chip:nth-child(1) { background: ${BLUE};   transform: rotate(-1.5deg); }
  .chip:nth-child(2) { background: ${VIOLET}; transform: rotate(1deg); }
  .chip:nth-child(3) { background: ${GREEN};  transform: rotate(-1deg); }
  .chip:nth-child(4) { background: ${RED};    transform: rotate(1.5deg); }
</style>

<div class="title">
  <div class="dollar">$20</div>
  <div class="rest">Blind<br />Draft</div>
</div>

<div class="tagline">Two players. One phone. Bid blind on what comes next.</div>

<div class="chips">
  <div class="chip">NBA</div>
  <div class="chip">Nostalgia</div>
  <div class="chip">Snacks</div>
  <div class="chip">Movies</div>
</div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: OUT });
await browser.close();

console.log(`wrote ${OUT} (${WIDTH}x${HEIGHT})`);
