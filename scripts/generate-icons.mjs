/**
 * Renders PNG fallbacks from `static/favicon.svg`.
 *
 * SVG favicons cover current desktop browsers, but not everything reads them —
 * and iOS ignores them entirely for "Add to Home Screen", which matters here
 * because the whole game is designed to be played on a phone. So the same mark
 * gets rasterised at the two sizes that actually get used.
 *
 * Rendered with the Playwright browser that's already a devDependency, so the
 * PNGs come from the same file as the SVG and can't drift from it.
 *
 * Run with: node scripts/generate-icons.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'static', 'favicon.svg');

/** 96 is a comfortable fallback; 180 is what iOS wants for the home screen. */
const SIZES = [
	{ file: 'favicon-96.png', size: 96 },
	{ file: 'apple-touch-icon.png', size: 180 }
];

const svg = readFileSync(SOURCE, 'utf8');
const browser = await chromium.launch();

for (const { file, size } of SIZES) {
	const page = await browser.newPage({
		viewport: { width: size, height: size },
		deviceScaleFactor: 1
	});
	await page.setContent(
		`<style>*{margin:0}html,body{width:${size}px;height:${size}px;overflow:hidden}
		 svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
		{ waitUntil: 'load' }
	);
	await page.screenshot({ path: join(root, 'static', file) });
	await page.close();
	console.log(`wrote static/${file} (${size}x${size})`);
}

await browser.close();
