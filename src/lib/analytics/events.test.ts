import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameConfig, Phase } from '$lib/game/types';
import {
	scrubDeep,
	scrubProperties,
	scrubText,
	scrubUrl,
	transitionEvent,
	type GameSnapshot
} from './events';

const config = {
	budget: 20,
	slots: 5,
	roster: [],
	positional: true,
	categoryId: 'nba',
	variantId: 'current',
	categoryLabel: 'NBA',
	variantLabel: 'Current',
	customItems: [{ name: 'my secret list item', tier: 'mid' }]
} as unknown as GameConfig;

const at = (phase: Phase, played = 0): GameSnapshot => ({
	phase,
	config,
	history: Array.from({ length: played })
});

describe('transitionEvent', () => {
	it('starts a game when it leaves setup', () => {
		expect(transitionEvent(at('setup'), at('reveal'), 'local')).toEqual({
			name: 'game_started',
			props: {
				mode: 'local',
				category: 'nba',
				variant: 'current',
				budget: 20,
				slots: 5,
				items_played: 0
			}
		});
	});

	it('finishes a game when it reaches results', () => {
		expect(transitionEvent(at('award', 9), at('results', 10), 'online')?.name).toBe(
			'game_finished'
		);
	});

	it('counts a return to setup mid-game as a quit, with progress at the time', () => {
		const event = transitionEvent(at('resolve', 3), at('setup'), 'local');
		expect(event?.name).toBe('game_quit');
		expect(event?.props.items_played).toBe(3);
	});

	it('treats setup after results as play again, not a quit', () => {
		expect(transitionEvent(at('results', 10), at('setup'), 'local')).toBeNull();
	});

	it('ignores ordinary play', () => {
		expect(transitionEvent(at('reveal'), at('resolve'), 'local')).toBeNull();
		expect(transitionEvent(at('resolve'), at('resolve'), 'local')).toBeNull();
	});

	it('never sends player-typed content', () => {
		const event = transitionEvent(at('setup'), at('reveal'), 'local');
		expect(JSON.stringify(event)).not.toContain('secret');
	});
});

describe('scrubUrl', () => {
	const origin = 'https://20dollardraftgame.com';

	it('drops the room id from same-site URLs', () => {
		expect(scrubUrl(`${origin}/online/room?id=abc-123`, origin)).toBe(`${origin}/online/room`);
		expect(scrubUrl(`${origin}/#top`, origin)).toBe(`${origin}/`);
	});

	it('leaves other sites alone', () => {
		expect(scrubUrl('https://www.google.com/?q=x', origin)).toBe('https://www.google.com/?q=x');
	});

	it('finds room URLs inside free text, such as a console message', () => {
		expect(scrubText(`[view] ${origin}/online/room?id=abc-123 loaded`, origin)).toBe(
			`[view] ${origin}/online/room loaded`
		);
		expect(scrubText('no urls here', origin)).toBe('no urls here');
	});

	it('reaches URLs nested in logged arguments', () => {
		const args = ['[view]', { o: `${origin}/online/room?id=abc`, n: 1 }];
		expect(JSON.stringify(scrubDeep({ arguments: args }, origin))).not.toContain('abc');
	});

	it('covers PostHog properties including $set_once', () => {
		const out = scrubProperties(
			{
				$current_url: `${origin}/online/room?id=abc`,
				$set_once: { $initial_current_url: `${origin}/online/room?id=abc` },
				count: 2
			},
			origin
		);
		expect(JSON.stringify(out)).not.toContain('abc');
		expect(out.count).toBe(2);
	});
});

describe('analytics configuration', () => {
	const read = (file: string) =>
		readFileSync(join(process.cwd(), 'src/lib/analytics', file), 'utf8');

	it('reads env dynamically so an unset key cannot break the build', () => {
		for (const file of ['index.ts', 'errors.ts']) {
			expect(read(file)).toContain("from '$env/dynamic/public'");
			expect(read(file)).not.toContain("from '$env/static/public'");
		}
	});

	it('keeps session replay and autocapture off', () => {
		const source = read('index.ts');
		expect(source).toContain('disable_session_recording: true');
		expect(source).toContain('autocapture: false');
		expect(source).toContain('advanced_disable_flags: true');
		// Initial-URL person properties ride at the top level, outside `properties`.
		expect(source).toMatch(/event\.\$set_once = scrubProperties/);
	});
});
