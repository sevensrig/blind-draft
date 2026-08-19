import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, isThemeId, loadTheme, saveTheme, THEMES } from './theme';

const KEY = 'blind-draft:theme:v1';

/** Minimal localStorage so these run without a DOM. */
function installStorage(): Map<string, string> {
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k),
		clear: () => store.clear()
	});
	return store;
}

describe('theme presets', () => {
	it('offers a curated set rather than an exhaustive one', () => {
		expect(THEMES.length).toBeGreaterThanOrEqual(5);
		expect(THEMES.length).toBeLessThanOrEqual(8);
	});

	it('has unique ids that the app.html guard pattern accepts', () => {
		const ids = THEMES.map((theme) => theme.id);
		expect(new Set(ids).size).toBe(ids.length);
		// app.html validates the stored id against this before writing an attribute.
		for (const id of ids) expect(id).toMatch(/^[a-z]{2,16}$/);
	});

	it('labels every preset, so each swatch has an accessible name', () => {
		for (const theme of THEMES) expect(theme.label.trim().length).toBeGreaterThan(0);
	});

	it('defaults to the first preset', () => {
		expect(DEFAULT_THEME).toBe(THEMES[0].id);
	});

	it('recognises only real presets', () => {
		expect(isThemeId('gold')).toBe(true);
		expect(isThemeId('chartreuse')).toBe(false);
		expect(isThemeId(null)).toBe(false);
		expect(isThemeId(7)).toBe(false);
	});
});

describe('theme persistence', () => {
	let store: Map<string, string>;

	beforeEach(() => {
		store = installStorage();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('round-trips a chosen preset', () => {
		saveTheme('cyan');
		expect(store.get(KEY)).toBe('cyan');
		expect(loadTheme()).toBe('cyan');
	});

	it('falls back to the default when nothing is stored', () => {
		expect(loadTheme()).toBe(DEFAULT_THEME);
	});

	it('falls back rather than trusting an unknown id', () => {
		// A hand-edited or stale value must not reach a DOM attribute.
		store.set(KEY, 'not-a-theme');
		expect(loadTheme()).toBe(DEFAULT_THEME);
	});

	it('survives storage being unavailable', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			}
		});
		expect(loadTheme()).toBe(DEFAULT_THEME);
		expect(() => saveTheme('gold')).not.toThrow();
	});
});
