import { totalSpent } from '$lib/game/engine';
import type { GameState, Player } from '$lib/game/types';
import { SHARE_HOST, headline, orderedPicks, priceLabel } from './text';

/** 4:5 portrait: the tallest ratio Instagram and TikTok show uncropped in a feed. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const FALLBACK_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Read from `app.css` so the card can't drift from the page's palette. */
function palette() {
	const css = getComputedStyle(document.documentElement);
	const token = (name: string) => css.getPropertyValue(name).trim() || '#000';
	return {
		ink: token('--ink'),
		cream: token('--cream'),
		white: token('--white'),
		yellow: token('--yellow'),
		green: token('--green'),
		orange: token('--orange'),
		p1: token('--violet'),
		p2: token('--yellow'),
		font: css.getPropertyValue('--font').trim() || FALLBACK_FONT
	};
}

type Ctx = CanvasRenderingContext2D;
type Palette = ReturnType<typeof palette>;

function setFont(ctx: Ctx, p: Palette, size: number, weight = 900, spacing = 0) {
	ctx.font = `${weight} ${size}px ${p.font}`;
	// Unsupported in older Safari, where it's just ignored.
	if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
}

/** A neo-brutalist block: hard offset shadow, then fill, then border. */
function block(
	ctx: Ctx,
	p: Palette,
	x: number,
	y: number,
	w: number,
	h: number,
	fill: string,
	border: number,
	shadow = 0
) {
	ctx.fillStyle = p.ink;
	if (shadow) ctx.fillRect(x + shadow, y + shadow, w, h);
	ctx.fillRect(x, y, w, h);
	ctx.fillStyle = fill;
	ctx.fillRect(x + border, y + border, w - border * 2, h - border * 2);
}

function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let cut = text;
	while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
	return `${cut.trimEnd()}…`;
}

/** Most even two-line split by words, or null for a single word. */
function splitTwo(ctx: Ctx, text: string): [string, string] | null {
	const words = text.split(' ');
	if (words.length < 2) return null;
	let best: [string, string] | null = null;
	let bestWidth = Number.POSITIVE_INFINITY;
	for (let i = 1; i < words.length; i++) {
		const pair: [string, string] = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
		const width = Math.max(...pair.map((line) => ctx.measureText(line).width));
		if (width < bestWidth) [best, bestWidth] = [pair, width];
	}
	return best;
}

/** Shrinks, then wraps to two lines, then truncates: long names stay whole where possible. */
function fitName(
	ctx: Ctx,
	p: Palette,
	text: string,
	maxWidth: number,
	maxHeight: number,
	base: number,
	min: number
) {
	for (let size = base; size >= min; size -= 2) {
		setFont(ctx, p, size);
		if (ctx.measureText(text).width <= maxWidth) return { size, lines: [text] };
		const pair = splitTwo(ctx, text);
		if (
			pair &&
			size * 2.1 <= maxHeight &&
			pair.every((l) => ctx.measureText(l).width <= maxWidth)
		) {
			return { size, lines: pair };
		}
	}
	setFont(ctx, p, min);
	return { size: min, lines: [ellipsize(ctx, text, maxWidth)] };
}

function drawRoster(
	ctx: Ctx,
	p: Palette,
	state: GameState,
	player: Player,
	x: number,
	y: number,
	w: number,
	h: number
) {
	const tilt = ((player.id === 0 ? -0.6 : 0.6) * Math.PI) / 180;
	ctx.save();
	ctx.translate(x + w / 2, y + h / 2);
	ctx.rotate(tilt);
	ctx.translate(-w / 2, -h / 2);

	block(ctx, p, 0, 0, w, h, player.id === 0 ? p.p1 : p.p2, 6, 10);

	const pad = 20;
	const inner = w - pad * 2;
	ctx.fillStyle = p.ink;
	ctx.textBaseline = 'alphabetic';

	// Totals first, so the name knows how much room is left.
	ctx.textAlign = 'right';
	setFont(ctx, p, 44, 900, -1);
	ctx.fillText(`$${totalSpent(player)}`, w - pad, pad + 40);
	setFont(ctx, p, 18, 800, 1);
	ctx.fillText(`$${player.money} LEFT`, w - pad, pad + 66);
	const totalsWidth = Math.max(110, ctx.measureText(`$${player.money} LEFT`).width);

	ctx.textAlign = 'left';
	setFont(ctx, p, 44, 900, -1);
	ctx.fillText(ellipsize(ctx, player.name.toUpperCase(), inner - totalsWidth - 16), pad, pad + 48);

	const ruleY = pad + 84;
	ctx.fillRect(pad, ruleY, inner, 4);

	const picks = orderedPicks(state, player.id);
	const listTop = ruleY + 20;
	const rowH = Math.min(86, (h - listTop - pad + 10) / Math.max(picks.length, 1));
	const chipH = Math.min(52, rowH - 12);
	const priceW = 84;
	const slotW = state.config.positional ? 64 : 0;
	const nameX = pad + slotW + (slotW ? 10 : 0) + priceW + 12;

	picks.forEach((entry, i) => {
		const rowY = listTop + i * rowH;
		const mid = rowY + chipH / 2;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';

		if (slotW) {
			const slot = state.config.roster.find((s) => s.id === entry.slotId);
			ctx.fillStyle = p.ink;
			ctx.fillRect(pad, rowY, slotW, chipH);
			ctx.fillStyle = p.cream;
			setFont(ctx, p, 22, 900, 1);
			ctx.fillText(slot?.label ?? '', pad + slotW / 2, mid + 1);
		}

		const priceX = pad + slotW + (slotW ? 10 : 0);
		if (entry.free) {
			ctx.fillStyle = p.ink;
			ctx.fillRect(priceX, rowY, priceW, chipH);
			ctx.fillStyle = p.cream;
			setFont(ctx, p, 20, 900, 2);
		} else {
			block(ctx, p, priceX, rowY, priceW, chipH, p.white, 4);
			ctx.fillStyle = p.ink;
			setFont(ctx, p, 30, 900);
		}
		ctx.fillText(priceLabel(entry).toUpperCase(), priceX + priceW / 2, mid + 1);

		ctx.fillStyle = p.ink;
		ctx.textAlign = 'left';
		const fit = fitName(ctx, p, entry.item.name.toUpperCase(), w - pad - nameX, rowH - 6, 32, 18);
		const lineH = fit.size * 1.02;
		const firstY = mid - ((fit.lines.length - 1) * lineH) / 2;
		for (const [n, line] of fit.lines.entries()) ctx.fillText(line, nameX, firstY + n * lineH + 1);
	});

	ctx.restore();
}

function drawStat(
	ctx: Ctx,
	p: Palette,
	x: number,
	y: number,
	w: number,
	h: number,
	fill: string,
	label: string,
	value: string,
	detail: string
) {
	block(ctx, p, x, y, w, h, fill, 4);
	const pad = 22;
	ctx.fillStyle = p.ink;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	setFont(ctx, p, 20, 900, 3);
	ctx.fillText(label, x + pad, y + pad + 18);
	setFont(ctx, p, 60, 900, -2);
	ctx.fillText(value, x + pad, y + pad + 82);
	setFont(ctx, p, 22, 800, 0.5);
	ctx.fillText(ellipsize(ctx, detail.toUpperCase(), w - pad * 2), x + pad, y + h - pad);
}

/** Draws the results sheet as a postable image, mirroring the on-screen one. */
export function renderCard(
	state: GameState,
	canvas = document.createElement('canvas')
): HTMLCanvasElement {
	canvas.width = CARD_WIDTH;
	canvas.height = CARD_HEIGHT;
	const ctx = canvas.getContext('2d');
	if (!ctx) return canvas;
	const p = palette();

	ctx.fillStyle = p.cream;
	ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

	const margin = 52;
	const shadow = 16;
	const sheetW = CARD_WIDTH - margin * 2 - shadow;
	const sheetH = CARD_HEIGHT - margin * 2 - shadow;
	block(ctx, p, margin, margin, sheetW, sheetH, p.white, 8, shadow);

	const pad = 44;
	const left = margin + pad;
	const inner = sheetW - pad * 2;
	const sheetBottom = margin + sheetH;

	// Stamp, tilted like the page's.
	ctx.save();
	ctx.translate(left, margin + pad);
	ctx.rotate((-1.5 * Math.PI) / 180);
	setFont(ctx, p, 24, 900, 4);
	const stampW = ctx.measureText('$20 DRAFT').width + 30;
	block(ctx, p, 0, 0, stampW, 46, p.yellow, 4);
	ctx.fillStyle = p.ink;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	ctx.fillText('$20 DRAFT', 15, 24);
	ctx.restore();

	ctx.fillStyle = p.ink;
	ctx.textBaseline = 'alphabetic';
	let size = 92;
	do setFont(ctx, p, size--, 900, -2);
	while (ctx.measureText('ROSTERS ARE FULL').width > inner && size > 40);
	ctx.fillText('ROSTERS ARE FULL', left, margin + pad + 140);

	setFont(ctx, p, 26, 800, 1);
	ctx.fillText(
		ellipsize(ctx, `${headline(state)} · ${state.config.slots} slots`.toUpperCase(), inner),
		left,
		margin + pad + 186
	);

	// Bottom up: footer band, stats, then rosters take whatever is left.
	const bandH = 92;
	const bandY = sheetBottom - 8 - bandH;
	ctx.fillRect(margin + 8, bandY, sheetW - 16, bandH);
	ctx.fillStyle = p.cream;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	setFont(ctx, p, 30, 900, 2);
	ctx.fillText(
		`WHO WON?  ·  ${SHARE_HOST.toUpperCase()}`,
		margin + sheetW / 2,
		bandY + bandH / 2 + 1
	);

	const statH = 150;
	const statY = bandY - 34 - statH;
	const gap = 24;
	const statW = (inner - gap) / 2;
	const priciest = state.history.reduce<GameState['history'][number] | null>(
		(top, award) => (award.price > (top?.price ?? 0) ? award : top),
		null
	);
	const freebies = state.history.filter((award) => award.free).length;
	drawStat(
		ctx,
		p,
		left,
		statY,
		statW,
		statH,
		p.orange,
		'TOP PRICE',
		priciest ? `$${priciest.price}` : '—',
		priciest?.item.name ?? 'Nothing sold'
	);
	drawStat(
		ctx,
		p,
		left + statW + gap,
		statY,
		statW,
		statH,
		p.green,
		'FREE PICKUPS',
		String(freebies),
		`of ${state.history.length} items`
	);

	const rosterY = margin + pad + 222;
	const rosterH = statY - 40 - rosterY;
	const rosterW = (inner - gap - 10) / 2;
	for (const player of state.players) {
		drawRoster(
			ctx,
			p,
			state,
			player,
			left + player.id * (rosterW + gap),
			rosterY,
			rosterW,
			rosterH
		);
	}

	return canvas;
}

/** Null when the browser can't encode a PNG, which drops sharing to text only. */
export function cardFile(state: GameState): Promise<File | null> {
	const canvas = renderCard(state);
	return new Promise((resolve) => {
		canvas.toBlob((blob) => {
			resolve(blob ? new File([blob], '20-dollar-draft.png', { type: 'image/png' }) : null);
		}, 'image/png');
	});
}
