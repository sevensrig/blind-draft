import { getCategory, getVariant, hasVariants, openRoster } from '$lib/data';
import { customSeeds } from '$lib/data/custom';
import { variant as buildVariant } from '$lib/data/types';
import { buildBench, buildDeck } from '$lib/game/deck';
import { DEFAULT_BUDGET, DEFAULT_SLOTS } from '$lib/game/engine';
import type { Action, Award, GameConfig, PlayerId } from '$lib/game/types';
import type { EmoteId } from './emotes';
import type { RematchOffer, RoomListing, RoomSettings } from './types';

/**
 * A pretend open room, listed only while no real one is: the "host" is the bot
 * under an ordinary name, and nothing in the game says otherwise.
 */
export interface Decoy {
	listing: RoomListing;
	categoryId: string;
	variantId: string;
	hostName: string;
}

/**
 * The five most-started modes in PostHog over the 30 days to 2026-11-15, leaving
 * out Custom (a bot can't have a typed list) and the retired Foods. Sports count
 * once across their variants.
 */
export const DECOY_MODES: { categoryId: string; variantIds: string[] }[] = [
	{ categoryId: 'perfect-life', variantIds: ['perfect-life'] },
	{ categoryId: 'celebrities', variantIds: ['celebrities'] },
	{ categoryId: 'nba', variantIds: ['nba-current', 'nba-all-time'] },
	{ categoryId: 'nfl', variantIds: ['nfl-current', 'nfl-all-time'] },
	{ categoryId: 'desserts', variantIds: ['desserts'] }
];

export const DECOY_NAMES = [
	'Mike',
	'Chris',
	'Jake',
	'Matt',
	'Josh',
	'Tyler',
	'Ryan',
	'Kevin',
	'Nick',
	'Brandon',
	'Justin',
	'Kyle',
	'Dylan',
	'Ethan',
	'Zach',
	'Evan'
];

const DECOY_PREFIX = 'decoy:';

export const isDecoy = (listing: RoomListing): boolean => listing.room_id.startsWith(DECOY_PREFIX);

const pick = <T>(list: readonly T[], random: () => number): T =>
	list[Math.floor(random() * list.length)];

/** How long one fake room stays listed for a device before another replaces it. */
export const DECOY_TTL_MS = 60_000;
/** Rematches the bot plays with one person before it leaves. */
export const DECOY_REMATCHES = 5;
/** The bot's rematch offer lands this long after the results, give or take. */
export const OFFER_DELAY_MS = [2500, 3500] as const;
/** How long it takes to accept the player's own rematch offer. */
export const ACCEPT_DELAY_MS = [1000, 2000] as const;

/** A beat before the bot's emote, as if it had to reach for the button. */
export const EMOTE_DELAY_MS = [2000, 5000] as const;
/** After one emote the bot keeps quiet at least this long, so it never chatters. */
export const EMOTE_QUIET_MS = 10_000;

/**
 * The bot's reaction to a card going, or null (it usually keeps quiet). It gloats
 * over a good card it bought, sulks when the player takes one, and laughs at a
 * player who paid big for a dud.
 */
export function awardEmote(award: Award, bot: PlayerId, random = Math.random): EmoteId | null {
	if (award.free) return null;
	const good = award.item.tier === 'good' || award.item.tier === 'great';
	if (award.playerId === bot) return good && random() < 0.35 ? 'happy' : null;
	if (good) return random() < 0.3 ? 'mad' : null;
	return award.price >= 6 && random() < 0.35 ? 'laugh' : null;
}

/** Sometimes answers the player's emote, the way an opponent might. */
const REPLIES: Partial<Record<EmoteId, EmoteId>> = { laugh: 'laugh', mad: 'laugh', happy: 'mad' };

export function replyEmote(sent: EmoteId, random = Math.random): EmoteId | null {
	const reply = REPLIES[sent];
	return reply && random() < 1 / 3 ? reply : null;
}

export const between = ([low, high]: readonly [number, number], random = Math.random) =>
	low + (high - low) * random();

/** A different mode and name from `avoid`, so the replacement reads as somebody new. */
export function makeDecoy(random: () => number = Math.random, avoid?: Decoy | null): Decoy {
	const modes = DECOY_MODES.filter((mode) => mode.categoryId !== avoid?.categoryId);
	const names = DECOY_NAMES.filter((name) => name !== avoid?.hostName);
	const mode = pick(modes, random);
	const variantId = pick(mode.variantIds, random);
	const category = getCategory(mode.categoryId);
	if (!category) throw new Error(`decoy category missing: ${mode.categoryId}`);
	const variant = getVariant(category, variantId);
	return {
		listing: {
			room_id: `${DECOY_PREFIX}${Math.floor(random() * 1e9).toString(36)}`,
			category_label: category.label,
			variant_label: hasVariants(category) ? variant.label : null,
			budget: DEFAULT_BUDGET,
			slots: category.roster?.length ?? DEFAULT_SLOTS,
			created_at: new Date().toISOString()
		},
		categoryId: category.id,
		variantId: variant.id,
		hostName: pick(names, random)
	};
}

export const decoyAge = (decoy: Decoy, now = Date.now()): number =>
	now - Date.parse(decoy.listing.created_at);

/** The fake room this device was shown, and how many rematches its bot has played. */
export interface DecoyRecord {
	decoy: Decoy;
	rematches: number;
}

const KEY = 'blind-draft:decoy:v1';

export function recallDecoy(): DecoyRecord | null {
	try {
		const raw = localStorage.getItem(KEY);
		const record = raw ? (JSON.parse(raw) as Partial<DecoyRecord>) : null;
		const decoy = record?.decoy;
		if (!decoy?.listing || !getCategory(decoy.categoryId) || typeof decoy.hostName !== 'string') {
			return null;
		}
		if (Number.isNaN(Date.parse(decoy.listing.created_at))) return null;
		return { decoy, rematches: Number(record?.rematches) || 0 };
	} catch {
		return null;
	}
}

export function rememberDecoy(record: DecoyRecord): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(record));
	} catch {
		// Private mode: the room just changes on every visit.
	}
}

export function decoySettings(decoy: Decoy): RoomSettings {
	return {
		categoryId: decoy.categoryId,
		variantId: decoy.variantId,
		budget: decoy.listing.budget,
		slots: decoy.listing.slots
	};
}

/** The game just played, as settings for the same again. */
export function settingsOf(config: GameConfig): RoomSettings {
	return {
		categoryId: config.categoryId,
		variantId: config.variantId,
		budget: config.budget,
		slots: config.slots,
		...(config.customItems
			? {
					customName: config.categoryLabel,
					customItems: config.customItems.map((item) => item.name)
				}
			: {})
	};
}

export function offerFor(settings: RoomSettings, by: PlayerId): RematchOffer {
	const category = getCategory(settings.categoryId);
	const variant = category ? getVariant(category, settings.variantId) : null;
	return {
		by,
		categoryId: settings.categoryId,
		variantId: settings.variantId,
		categoryLabel: category?.custom
			? settings.customName || 'Custom Draft'
			: (category?.label ?? ''),
		variantLabel: category && hasVariants(category) ? (variant?.label ?? null) : null,
		budget: settings.budget,
		slots: settings.slots
	};
}

/**
 * Deals a disguised bot game: the bot takes seat 1 under the host's name, and
 * `disguised` only tags it for analytics. Settings come from the listing or a
 * rematch picker, which validates them before handing them over.
 */
export function decoyDeal(settings: RoomSettings, names: string[]): Action {
	const category = getCategory(settings.categoryId);
	if (!category) throw new Error(`decoy category missing: ${settings.categoryId}`);
	const custom = category.custom ? customSeeds(settings.customItems ?? []) : null;
	const variant = custom
		? buildVariant('custom', 'Custom', custom)
		: getVariant(category, settings.variantId);
	const roster = category.roster ?? openRoster(settings.slots);
	const deck = buildDeck(variant.items, roster);
	const offer = offerFor(settings, 1);
	return {
		type: 'start',
		deck,
		bench: buildBench(variant.items, roster, deck),
		names,
		config: {
			budget: settings.budget,
			slots: roster.length,
			roster,
			positional: !!category.roster,
			categoryId: category.id,
			variantId: variant.id,
			categoryLabel: offer.categoryLabel,
			variantLabel: offer.variantLabel,
			...(custom ? { customItems: variant.items } : {}),
			bot: 1,
			disguised: true
		}
	};
}
