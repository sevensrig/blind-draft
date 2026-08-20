import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRoster } from '$lib/data/types';
import { defaultConfig, initialState } from './engine';
import { clearState, loadCustomDraft, loadState, saveCustomDraft, saveState } from './persist';
import type { GameState } from './types';

const KEY = 'blind-draft:state:v2';
const LEGACY_KEY = 'blind-draft:state:v1';

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

function playableState(): GameState {
	const roster = openRoster(3);
	return {
		...initialState(),
		phase: 'resolve',
		config: { ...defaultConfig(), slots: 3, roster },
		deck: [{ id: 'a', name: 'A', tier: 'mid' }],
		players: [
			{
				id: 0,
				name: 'Ann',
				money: 12,
				roster: [
					{ item: { id: 'a', name: 'A', tier: 'mid' }, price: 8, free: false, slotId: roster[0].id }
				]
			},
			{ id: 1, name: 'Bo', money: 20, roster: [] }
		]
	};
}

describe('persistence', () => {
	let store: Map<string, string>;

	beforeEach(() => {
		store = installStorage();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('round-trips a game in progress', () => {
		const state = playableState();
		saveState(state);
		expect(loadState()).toEqual(state);

		clearState();
		expect(loadState()).toBeNull();
	});

	/**
	 * The bug this guards: a save written before roster slots existed was restored
	 * into a build that expected them, which threw during hydration and left the
	 * page rendered but completely unresponsive.
	 */
	it('rejects a save from an older schema instead of handing it back', () => {
		const stale = {
			phase: 'resolve',
			// No `roster` on config, and no `slotId` on the pick.
			config: { budget: 20, slots: 5, categoryId: 'nba', categoryLabel: 'NBA Players' },
			players: [
				{
					id: 0,
					name: 'Dih',
					money: 14,
					roster: [{ item: { id: 'x', name: 'X', tier: 'mid' }, price: 6, free: false }]
				},
				{ id: 1, name: 'Srih', money: 20, roster: [] }
			],
			deck: [{ id: 'x', name: 'X', tier: 'mid' }],
			index: 1,
			bid: null,
			freeTurn: 0,
			lastAward: null,
			history: []
		};
		store.set(KEY, JSON.stringify(stale));

		expect(loadState()).toBeNull();
		// And it's binned, so it can't fail again on the next load.
		expect(store.has(KEY)).toBe(false);
	});

	it('drops a pick pointing at a slot the template does not have', () => {
		const state = playableState();
		state.players[0].roster[0].slotId = 'no-such-slot';
		store.set(KEY, JSON.stringify(state));
		expect(loadState()).toBeNull();
	});

	it.each([
		['phase missing', (s: Record<string, unknown>) => delete s.phase],
		['deck not an array', (s: Record<string, unknown>) => (s.deck = 'nope')],
		['index not a number', (s: Record<string, unknown>) => (s.index = '3')],
		[
			'only one player',
			(s: Record<string, unknown>) => (s.players = [(s.players as unknown[])[0]])
		],
		['config missing entirely', (s: Record<string, unknown>) => delete s.config],
		[
			'config budget missing',
			(s: Record<string, unknown>) => delete (s.config as Record<string, unknown>).budget
		],
		[
			'roster template empty',
			(s: Record<string, unknown>) => ((s.config as Record<string, unknown>).roster = [])
		],
		[
			'roster slot without an id',
			(s: Record<string, unknown>) =>
				((s.config as Record<string, unknown>).roster = [{ label: 'x', drafts: null }])
		],
		[
			'player name missing',
			(s: Record<string, unknown>) =>
				delete ((s.players as Record<string, unknown>[])[0] as Record<string, unknown>).name
		],
		[
			'player money not a number',
			(s: Record<string, unknown>) => ((s.players as Record<string, unknown>[])[0].money = 'lots')
		],
		[
			'player roster not an array',
			(s: Record<string, unknown>) => ((s.players as Record<string, unknown>[])[1].roster = null)
		]
	])('rejects a save with %s', (_label, corrupt) => {
		const state = JSON.parse(JSON.stringify(playableState())) as Record<string, unknown>;
		corrupt(state);
		store.set(KEY, JSON.stringify(state));
		expect(loadState()).toBeNull();
	});

	it('clears keys from previous versions', () => {
		store.set(LEGACY_KEY, JSON.stringify({ anything: true }));
		loadState();
		expect(store.has(LEGACY_KEY)).toBe(false);
	});

	it('survives malformed json and unwritable storage', () => {
		store.set(KEY, '{ not json');
		expect(loadState()).toBeNull();

		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {
				throw new Error('blocked');
			}
		});
		expect(loadState()).toBeNull();
		expect(() => saveState(playableState())).not.toThrow();
		expect(() => clearState()).not.toThrow();
	});
});

/*
 * The typed-category draft, kept under its own key.
 *
 * Untested until CI started enforcing the coverage thresholds this file already
 * declared. It matters for the same reason the save format does: this is
 * unvalidated data coming back out of localStorage, and the worst bug this
 * project has shipped was a stored blob being trusted into a shape that no
 * longer matched.
 */
describe('custom draft persistence', () => {
	const CUSTOM_KEY = 'blind-draft:custom:v1';
	let store: Map<string, string>;

	beforeEach(() => {
		store = installStorage();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('round-trips a draft verbatim', () => {
		// Trailing newline and blank line kept deliberately: the textarea's caret
		// behaviour depends on the text surviving unedited.
		const draft = { name: 'Cereals', text: 'Weetabix\n\nCoco Pops\n' };
		saveCustomDraft(draft);

		expect(store.has(CUSTOM_KEY)).toBe(true);
		expect(loadCustomDraft()).toEqual(draft);
	});

	it('is null when nothing was ever saved', () => {
		expect(loadCustomDraft()).toBeNull();
	});

	it('rejects anything that is not a name and a text', () => {
		for (const junk of [
			'{ not json',
			'null',
			'42',
			'"a string"',
			'{}',
			'{"name":"Cereals"}',
			'{"text":"Weetabix"}',
			'{"name":123,"text":"Weetabix"}',
			'{"name":"Cereals","text":null}'
		]) {
			store.set(CUSTOM_KEY, junk);
			expect(loadCustomDraft(), junk).toBeNull();
		}
	});

	it('ignores extra fields rather than passing them through', () => {
		store.set(CUSTOM_KEY, '{"name":"Cereals","text":"Weetabix","evil":true}');
		expect(loadCustomDraft()).toEqual({ name: 'Cereals', text: 'Weetabix' });
	});

	it('survives unwritable storage', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		});

		// Losing a typed list is a shame; throwing mid-setup is a broken game.
		expect(() => saveCustomDraft({ name: 'Cereals', text: 'Weetabix' })).not.toThrow();
		expect(loadCustomDraft()).toBeNull();
	});
});
