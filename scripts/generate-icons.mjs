/**
 * Renders PNG fallbacks from `static/favicon.svg`. iOS ignores SVG favicons for
 * "Add to Home Screen", which matters for a phone-first game. Rendered with the
 * Playwright browser that's already a devDependency, so the PNGs can't drift
 * from the SVG.
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
