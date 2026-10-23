import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameConfig, Phase } from '$lib/game/types';
import {
	isoWeek,
	scrubDeep,
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

describe('isoWeek', () => {
	it('labels ordinary weeks', () => {
		expect(isoWeek(new Date('2026-10-23T12:00:00Z'))).toBe('2026-W43');
		// Monday starts the week, Sunday ends it.
		expect(isoWeek(new Date('2026-10-19T00:00:00Z'))).toBe('2026-W43');
		expect(isoWeek(new Date('2026-10-25T23:59:59Z'))).toBe('2026-W43');
		expect(isoWeek(new Date('2026-10-26T00:00:00Z'))).toBe('2026-W44');
	});

	it('follows the ISO rule across new year', () => {
		// 2027-01-01 is a Friday, so it still belongs to 2026's last week.
		expect(isoWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
		// 2025-12-29 is a Monday in the week holding 2026's first Thursday.
		expect(isoWeek(new Date('2025-12-29T12:00:00Z'))).toBe('2026-W01');
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

	it('scrubs URLs used as object keys', () => {
		const out = scrubDeep({ [`${origin}/online/room?id=abc`]: [{ x: 1 }] }, origin);
		expect(Object.keys(out as object)).toEqual([`${origin}/online/room`]);
	});

	it('reaches URLs inside a PostHog exception payload', () => {
		const props = {
			$current_url: `${origin}/online/room?id=abc`,
			$exception_list: [
				{
					value: `Failed to load ${origin}/online/room?id=abc`,
					stacktrace: { frames: [{ filename: `${origin}/_app/immutable/x.js`, lineno: 1 }] }
				}
			],
			count: 2
		};
		const out = scrubDeep(props, origin) as typeof props;
		expect(JSON.stringify(out)).not.toContain('abc');
		expect(out.$exception_list[0].stacktrace.frames[0]).toEqual({
			filename: `${origin}/_app/immutable/x.js`,
			lineno: 1
		});
		expect(out.count).toBe(2);
	});
});

describe('analytics configuration', () => {
	const read = (file: string) =>
		readFileSync(join(process.cwd(), 'src/lib/analytics', file), 'utf8');

	it('reads env dynamically so an unset key cannot break the build', () => {
		expect(read('index.ts')).toContain("from '$env/dynamic/public'");
		expect(read('index.ts')).not.toContain("from '$env/static/public'");
	});

	it('keeps session replay and autocapture off', () => {
		const source = read('index.ts');
		expect(source).toContain('disable_session_recording: true');
		expect(source).toContain('autocapture: false');
		expect(source).toContain('capture_heatmaps: false');
		expect(source).toContain('capture_dead_clicks: false');
		expect(source).toContain('advanced_disable_flags: true');
		expect(source).toContain("cookieless_mode: 'always'");
		// The weekly marker stores a week label and nothing that identifies a device.
		expect(source).toMatch(/localStorage\.setItem\(WEEK_KEY, week\)/);
		// Initial-URL person properties ride at the top level, outside `properties`.
		expect(source).toMatch(/event\.\$set_once = scrubDeep/);
	});
});
