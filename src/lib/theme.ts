/**
 * The player's chosen accent.
 *
 * Deliberately thin: a theme is one id, and every colour value behind it lives
 * in `app.css` under `[data-theme='…']`. Switching is a single attribute write,
 * so the whole app re-skins with no rebuild and no reload — and nothing here has
 * to know what "gold" actually looks like.
 *
 * This is a per-device cosmetic preference. It is not part of game state, is not
 * shared between the two players, and never reaches a server.
 */

const KEY = 'blind-draft:theme:v1';

export interface ThemePreset {
	id: string;
	/** Shown to screen readers and as the swatch's accessible name. */
	label: string;
}

/**
 * Curated rather than exhaustive. Each one is a `--main` plus a pair of surface
 * tones, and each is verified to carry black text at 4.5:1 or better — the axe
 * suites scan every preset, not just the default.
 *
 * There is no green preset on purpose. Green means money in this app and nothing
 * else; an accent that close to `--money` would make the bid screen ambiguous,
 * which is the exact problem yellow caused before money moved to green.
 */
export const THEMES: readonly ThemePreset[] = [
	{ id: 'coral', label: 'Coral' },
	{ id: 'gold', label: 'Gold' },
	{ id: 'tangerine', label: 'Tangerine' },
	{ id: 'magenta', label: 'Magenta' },
	{ id: 'cyan', label: 'Cyan' },
	{ id: 'lilac', label: 'Lilac' }
];

export const DEFAULT_THEME = THEMES[0].id;

export function isThemeId(value: unknown): value is string {
	return typeof value === 'string' && THEMES.some((theme) => theme.id === value);
}

/** Anything unrecognised falls back to the default rather than being repaired. */
export function loadTheme(): string {
	try {
		const stored = localStorage.getItem(KEY);
		return isThemeId(stored) ? stored : DEFAULT_THEME;
	} catch {
		// Private mode or storage disabled: the default is a perfectly good answer.
		return DEFAULT_THEME;
	}
}

export function saveTheme(id: string): void {
	try {
		localStorage.setItem(KEY, id);
	} catch {
		// Losing the preference is fine; breaking the picker is not.
	}
}

/**
 * Keeps the browser chrome (iOS status bar, Android toolbar) on the same canvas
 * as the page. Reads the applied value back out of CSS rather than carrying a
 * second copy of it here.
 */
function syncBrowserChrome(): void {
	const meta = document.querySelector('meta[name="theme-color"]');
	if (!meta) return;
	const background = getComputedStyle(document.documentElement)
		.getPropertyValue('--background')
		.trim();
	if (background) meta.setAttribute('content', background);
}

/** Applies a theme without persisting it. `app.html` does this before first paint. */
export function applyTheme(id: string): void {
	document.documentElement.dataset.theme = isThemeId(id) ? id : DEFAULT_THEME;
	syncBrowserChrome();
}

/** Applies and remembers. What the picker calls. */
export function setTheme(id: string): void {
	if (!isThemeId(id)) return;
	applyTheme(id);
	saveTheme(id);
}
