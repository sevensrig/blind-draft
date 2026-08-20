import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recallName, rememberName } from './identity';

/**
 * The remembered display name.
 *
 * It exists because two ways into a room have no name field of their own — the
 * rooms browser and an invite link — and joining without one had the server
 * fall back to calling the player "Player 2" with nothing able to change it
 * afterwards.
 */
function fakeStorage(): Storage {
	const map = new Map<string, string>();
	return {
		get length() {
			return map.size;
		},
		clear: () => map.clear(),
		getItem: (key: string) => map.get(key) ?? null,
		key: (index: number) => Array.from(map.keys())[index] ?? null,
		removeItem: (key: string) => void map.delete(key),
		setItem: (key: string, value: string) => void map.set(key, value)
	};
}

describe('remembered name', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'localStorage', {
			value: fakeStorage(),
			configurable: true
		});
	});

	afterEach(() => {
		Reflect.deleteProperty(globalThis, 'localStorage');
	});

	it('round-trips a name', () => {
		rememberName('Alex');
		expect(recallName()).toBe('Alex');
	});

	it('trims and caps at the length the name field allows', () => {
		rememberName('   Bartholomew the Third   ');
		expect(recallName()).toBe('Bartholomew th');
	});

	it('clears rather than storing a blank', () => {
		rememberName('Alex');
		rememberName('   ');
		expect(recallName()).toBe('');
	});

	it('reports no name when there is nothing stored', () => {
		expect(recallName()).toBe('');
	});

	it('survives storage being unavailable', () => {
		// Private mode, or a full quota. Not being able to remember a name must
		// never stop someone joining a game.
		Object.defineProperty(globalThis, 'localStorage', {
			get() {
				throw new Error('storage disabled');
			},
			configurable: true
		});
		expect(() => rememberName('Alex')).not.toThrow();
		expect(recallName()).toBe('');
	});
});
