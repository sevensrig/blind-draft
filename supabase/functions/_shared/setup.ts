import { getCategory, getVariant, hasVariants, openRoster } from './vendor/data/index.ts';
import { CUSTOM_MIN_ITEMS, CUSTOM_NAME_MAX, blockedEntry, customSeeds } from './vendor/data/custom.ts';
import { variant as buildVariant } from './vendor/data/types.ts';
import { buildBench, buildDeck } from './vendor/game/deck.ts';
import { applyAction, defaultConfig, initialState } from './vendor/game/engine.ts';
import type { GameConfig, GameState } from './vendor/game/types.ts';

const CUSTOM_MAX_LINES = 200;
const CUSTOM_ITEM_MAX = 40;

/** The game settings a client may choose: at room creation, and for a rematch. */
export interface Settings {
	categoryId: string;
	variantId: string;
	budget: number;
	slots: number;
	customName?: string;
	customItems?: string[];
}

export type SettingsResult =
	| { ok: true; settings: Settings; config: GameConfig; deal: (names: [string, string]) => GameState }
	| { ok: false; message: string };

/**
 * Validates untrusted settings and returns a dealer for them. The deck is built
 * here, server-side, because both players are clients.
 */
export function readSettings(body: Record<string, unknown>): SettingsResult {
	const category = getCategory(String(body.categoryId ?? ''));
	if (!category) return { ok: false, message: 'Unknown category' };

	let variant = getVariant(category, String(body.variantId ?? ''));
	let categoryLabel = category.label;
	let customName: string | undefined;
	let customItems: string[] | undefined;
	if (category.custom) {
		const lines = Array.isArray(body.customItems) ? body.customItems : [];
		if (lines.length > CUSTOM_MAX_LINES || !lines.every((line) => typeof line === 'string')) {
			return { ok: false, message: `A custom list takes up to ${CUSTOM_MAX_LINES} options` };
		}
		customItems = lines.map((line: string) => line.slice(0, CUSTOM_ITEM_MAX));
		const seeds = customSeeds(customItems);
		if (seeds.length < CUSTOM_MIN_ITEMS) {
			return { ok: false, message: `A custom list needs at least ${CUSTOM_MIN_ITEMS} options` };
		}
		categoryLabel = String(body.customName ?? '').slice(0, CUSTOM_NAME_MAX).trim() || 'Custom Draft';
		customName = categoryLabel;
		// Public rooms list the name to strangers, so this is the check that counts.
		if (blockedEntry(categoryLabel, seeds)) {
			return { ok: false, message: 'Slurs are not allowed in a custom category' };
		}
		variant = buildVariant('custom', 'Custom', seeds);
	}

	const budget = Number(body.budget);
	if (!Number.isInteger(budget) || budget < 5 || budget > 200) {
		return { ok: false, message: 'Budget must be a whole number between 5 and 200' };
	}

	const template = category.roster ?? openRoster(Number(body.slots));
	if (template.length < 2 || template.length > 10) {
		return { ok: false, message: 'Roster size must be between 2 and 10' };
	}
	if (variant.items.length < template.length * 2) {
		return { ok: false, message: 'That category is too small for this roster size' };
	}

	const config: GameConfig = {
		...defaultConfig(),
		budget,
		slots: template.length,
		roster: template,
		positional: !!category.roster,
		categoryId: category.id,
		variantId: variant.id,
		// No `customItems`: the config is copied into `game_public`, and the pool
		// stays server-side like every other deck.
		categoryLabel,
		variantLabel: hasVariants(category) ? variant.label : null
	};

	const items = variant.items;
	return {
		ok: true,
		settings: {
			categoryId: category.id,
			variantId: variant.id,
			budget,
			slots: template.length,
			...(customItems ? { customName, customItems } : {})
		},
		config,
		// The same engine the local game uses. The rulebook exists once.
		deal: (names) => {
			const deck = buildDeck(items, template);
			return applyAction(initialState(), {
				type: 'start',
				deck,
				bench: buildBench(items, template, deck),
				names,
				config
			});
		}
	};
}
