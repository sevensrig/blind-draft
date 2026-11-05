import { getCategory, getVariant } from '$lib/data';
import { CUSTOM_MIN_ITEMS, blockedEntry, customSeeds } from '$lib/data/custom';
import { deckSizeFor, maxSlotsFor } from '$lib/game/deck';
import { DEFAULT_BUDGET, DEFAULT_SLOTS } from '$lib/game/engine';
import type { RoomSettings } from './types';

/** Form state for an online game's settings: the `/online` page and the rematch picker. */
export class SettingsForm {
	budget = $state(DEFAULT_BUDGET);
	slots = $state(DEFAULT_SLOTS);
	categoryId = $state<string | null>(null);
	variantChoice = $state<Record<string, string>>({});
	customName = $state('');
	customText = $state('');

	constructor(initial?: Partial<RoomSettings>) {
		if (!initial) return;
		if (initial.budget) this.budget = initial.budget;
		if (initial.slots) this.slots = initial.slots;
		if (initial.categoryId) {
			this.categoryId = initial.categoryId;
			if (initial.variantId) this.variantChoice = { [initial.categoryId]: initial.variantId };
		}
		if (initial.customName) this.customName = initial.customName;
		if (initial.customItems) this.customText = initial.customItems.join('\n');
	}

	category = $derived(this.categoryId ? getCategory(this.categoryId) : undefined);
	variant = $derived(
		this.category
			? getVariant(this.category, this.variantChoice[this.category.id] ?? '')
			: undefined
	);
	isCustom = $derived(!!this.category?.custom);
	seeds = $derived(customSeeds(this.customText.split('\n')));
	customCount = $derived(this.seeds.length);
	customBlocked = $derived(!!blockedEntry(this.customName, this.seeds));
	template = $derived(this.category?.roster ?? null);
	poolSize = $derived(this.isCustom ? this.customCount : (this.variant?.items.length ?? 0));
	slotCap = $derived(this.poolSize ? Math.min(10, maxSlotsFor(this.poolSize)) : 10);
	effectiveSlots = $derived(
		this.template ? this.template.length : Math.min(this.slots, this.slotCap)
	);
	ready = $derived(
		!!this.category &&
			(!this.isCustom ||
				(this.customCount >= CUSTOM_MIN_ITEMS &&
					!this.customBlocked &&
					this.poolSize >= deckSizeFor(this.effectiveSlots)))
	);

	/** The label the dock and offers show, e.g. "NBA" or the typed custom name. */
	label = $derived(
		this.isCustom ? this.customName.trim() || 'Custom Draft' : (this.category?.label ?? '')
	);

	toSettings(): RoomSettings | null {
		if (!this.ready || !this.category || !this.variant) return null;
		return {
			categoryId: this.category.id,
			variantId: this.variant.id,
			budget: this.budget,
			slots: this.effectiveSlots,
			...(this.isCustom
				? { customName: this.customName, customItems: this.seeds.map((seed) => seed.name) }
				: {})
		};
	}
}
