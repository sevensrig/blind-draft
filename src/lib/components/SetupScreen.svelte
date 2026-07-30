<script lang="ts">
	import { CATEGORIES, getCategory, getVariant, hasVariants, openRoster } from '$lib/data';
	import { buildDeck, deckSizeFor, maxSlotsFor } from '$lib/game/deck';
	import { DEFAULT_BUDGET, DEFAULT_SLOTS } from '$lib/game/engine';
	import { game } from '$lib/game/store.svelte';
	import Icon from './Icon.svelte';

	const BUDGET_PRESETS = [10, 20, 50];
	const SLOT_PRESETS = [3, 4, 5, 6, 7, 8];
	const BUDGET_MIN = 5;
	const BUDGET_MAX = 200;
	const SLOT_CEILING = 10;

	let names = $state<[string, string]>(['', '']);
	let budget = $state(DEFAULT_BUDGET);
	let slots = $state(DEFAULT_SLOTS);
	let categoryId = $state<string | null>(null);
	/** Remembers each category's sub-mode while you browse around. */
	let variantChoice = $state<Record<string, string>>({});

	const category = $derived(categoryId ? getCategory(categoryId) : undefined);
	const activeVariant = $derived(
		category ? getVariant(category, variantChoice[category.id] ?? '') : undefined
	);
	/** Positional categories lock the roster; everything else stays adjustable. */
	const template = $derived(category?.roster ?? null);
	/** A pool has to cover both rosters, so a thin pool lowers the ceiling. */
	const slotCap = $derived(
		activeVariant ? Math.min(SLOT_CEILING, maxSlotsFor(activeVariant.items.length)) : SLOT_CEILING
	);
	const effectiveSlots = $derived(template ? template.length : Math.min(slots, slotCap));
	const rosterTemplate = $derived(template ?? openRoster(effectiveSlots));

	function adjustBudget(delta: number) {
		budget = Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, budget + delta));
	}

	function start() {
		if (!category || !activeVariant) return;
		const roster = rosterTemplate;
		game.dispatch({
			type: 'start',
			deck: buildDeck(activeVariant.items, roster),
			names: [names[0], names[1]],
			config: {
				budget,
				slots: roster.length,
				roster,
				positional: !!template,
				categoryId: category.id,
				variantId: activeVariant.id,
				categoryLabel: category.label,
				variantLabel: hasVariants(category) ? activeVariant.label : null
			}
		});
	}
</script>

<div class="shell setup">
	<header class="hero">
		<span class="eyebrow">Two players · one phone</span>
		<h1>
			<span class="hero__dollar">$20</span>
			<span class="hero__rest">Blind<br />Draft</span>
		</h1>
		<p class="hero__tag">Nobody knows what's coming next. Bid anyway.</p>
	</header>

	<section class="block">
		<h2 class="block__title">Who's playing</h2>
		<div class="names">
			{#each [0, 1] as const as slot (slot)}
				<label class="name" style:--accent={slot === 0 ? 'var(--p1)' : 'var(--p2)'}>
					<span class="name__tag">Player {slot + 1}</span>
					<input
						type="text"
						bind:value={names[slot]}
						placeholder="Player {slot + 1}"
						maxlength="14"
						autocomplete="off"
						spellcheck="false"
					/>
				</label>
			{/each}
		</div>
	</section>

	<section class="block">
		<h2 class="block__title">Budget each</h2>
		<div class="chips">
			{#each BUDGET_PRESETS as preset (preset)}
				<button
					class="chip"
					class:chip--on={budget === preset}
					type="button"
					onclick={() => (budget = preset)}>${preset}</button
				>
			{/each}
			<div class="nudge">
				<button type="button" onclick={() => adjustBudget(-5)} aria-label="Lower budget by five"
					>&minus;</button
				>
				<span class="nudge__value">${budget}</span>
				<button type="button" onclick={() => adjustBudget(5)} aria-label="Raise budget by five"
					>+</button
				>
			</div>
		</div>
	</section>

	<section class="block">
		<h2 class="block__title">
			{template ? `${category?.label} roster (locked)` : 'Roster slots each'}
		</h2>

		{#if template}
			<div class="chips chips--wrap">
				{#each template as slot, i (slot.id + i)}
					<span class="chip chip--slot">{slot.label}</span>
				{/each}
			</div>
			<p class="hint">
				Fixed at {template.length} slots, and the deck stocks two players for each. Slot labels are
				only a suggestion — start whoever you want wherever you want.
			</p>
		{:else}
			<div class="chips chips--wrap">
				{#each SLOT_PRESETS as preset (preset)}
					<button
						class="chip"
						class:chip--on={effectiveSlots === preset}
						type="button"
						disabled={preset > slotCap}
						onclick={() => (slots = preset)}>{preset}</button
					>
				{/each}
			</div>
			<p class="hint">
				{deckSizeFor(effectiveSlots)} items get revealed, one at a time. Every single one gets
				claimed.
			</p>
		{/if}
	</section>

	<section class="block">
		<h2 class="block__title">Category</h2>
		<div class="grid">
			{#each CATEGORIES as entry (entry.id)}
				{@const picked = categoryId === entry.id}
				<button
					class="tile"
					class:tile--on={picked}
					style:--accent={`var(--${entry.accent})`}
					type="button"
					aria-pressed={picked}
					onclick={() => (categoryId = entry.id)}
				>
					<span class="tile__icon"><Icon name={entry.icon} /></span>
					<span class="tile__label">{entry.label}</span>
					<span class="tile__blurb">{entry.blurb}</span>
				</button>
			{/each}
		</div>

		{#if category && hasVariants(category)}
			<div class="variants">
				<span class="eyebrow">{category.label} pool</span>
				<div class="chips">
					{#each category.variants as option (option.id)}
						<button
							class="chip"
							class:chip--on={activeVariant?.id === option.id}
							type="button"
							onclick={() => (variantChoice[category.id] = option.id)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</section>

	<details class="rules">
		<summary>How it works</summary>
		<ol>
			<li>An item is revealed. Neither of you knew it was coming.</li>
			<li>
				Anyone can open the bidding — there's no turn order. Raise back and forth by at least $1
				until one of you stops.
			</li>
			<li>
				Nothing stops you spending your last dollar. If you go broke with slots left, your opponent
				just names a price on everything after — and anything they pass on is yours for free.
			</li>
			<li>Both broke? The rest are handed out free, alternating, until both rosters are full.</li>
		</ol>
	</details>

	<!--
		Only docked once there's something to start. A sticky bar sits on top of the
		category grid, and a disabled button in it silently swallowed taps aimed at
		whichever tiles happened to be scrolled underneath.
	-->
	{#if category}
		<div class="dock">
			<button class="btn btn--hot start" type="button" onclick={start}>
				Start the draft
				<span class="btn__sub">
					{category.label}{activeVariant && hasVariants(category)
						? ` · ${activeVariant.label}`
						: ''} · ${budget} · {effectiveSlots} slots
				</span>
			</button>
		</div>
	{:else}
		<p class="prompt">Pick a category to start</p>
	{/if}
</div>

<style>
	.setup {
		display: flex;
		flex-direction: column;
		gap: 1.3rem;
	}

	.hero {
		padding-top: 1.25rem;
	}

	.hero h1 {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin: 0.4rem 0 0.6rem;
	}

	/* Highlighter block, knocked askew. */
	.hero__dollar {
		padding: 0.1rem 0.35rem 0.2rem;
		background: var(--yellow);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 2.6rem;
		line-height: 0.95;
		letter-spacing: -0.05em;
		transform: rotate(-2deg);
	}

	.hero__rest {
		font-size: 1.9rem;
		line-height: 0.92;
	}

	.hero__tag {
		margin: 0;
		max-width: 24ch;
		font-size: 0.92rem;
		font-weight: 700;
		line-height: 1.3;
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.block__title {
		font-size: 0.68rem;
		letter-spacing: 0.14em;
	}

	.names {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.name {
		display: flex;
		flex-direction: column;
	}

	/* Tab sitting on top of the input block. */
	.name__tag {
		align-self: flex-start;
		padding: 0.1rem 0.3rem;
		background: var(--accent);
		border: var(--bw-thin) solid var(--ink);
		border-bottom: 0;
		font-size: 0.56rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.name input {
		width: 100%;
		padding: 0.6rem 0.55rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 1rem;
		font-weight: 900;
	}

	.name input:focus {
		outline: none;
		background: var(--accent);
	}

	.name input::placeholder {
		color: var(--ink);
		font-weight: 700;
		opacity: 0.4;
	}

	.chips {
		display: flex;
		gap: 0.4rem;
		align-items: stretch;
	}

	.chips--wrap {
		flex-wrap: wrap;
	}

	.chip {
		flex: 1;
		min-width: 2.5rem;
		padding: 0.55rem 0.45rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums;
		text-transform: uppercase;
	}

	/* Instant inversion, no easing. */
	.chip--on {
		background: var(--ink);
		color: var(--cream);
	}

	.chip:disabled {
		transform: translate(4px, 4px);
		box-shadow: none;
		opacity: 0.35;
		cursor: not-allowed;
	}

	.nudge {
		flex: 1.5;
		display: flex;
		align-items: center;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.nudge button {
		width: 1.9rem;
		align-self: stretch;
		font-size: 1.2rem;
	}

	.nudge button:active {
		background: var(--ink);
		color: var(--cream);
	}

	.nudge__value {
		flex: 1;
		text-align: center;
		font-size: 0.9rem;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	.hint {
		margin: 0.15rem 0 0;
		font-size: 0.72rem;
		font-weight: 700;
		line-height: 1.35;
		opacity: 0.7;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem;
	}

	.tile {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.6rem 0.6rem 0.65rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		text-align: left;
	}

	.tile:active {
		transform: translate(4px, 4px);
		box-shadow: none;
	}

	/* Selecting floods the tile with its own accent, so the colour previewed in
	   the emoji chip is the colour you get. */
	.tile--on {
		background: var(--accent);
		box-shadow: var(--shadow-lg);
		transform: rotate(-1deg);
	}

	.tile--on:active {
		transform: rotate(-1deg) translate(4px, 4px);
		box-shadow: none;
	}

	/* A chip rather than a bare glyph: it carries the category's accent while the
	   tile itself stays white, which keeps 14 tiles legible instead of loud.
	   Fixed square so fourteen icons of differing widths still line up. */
	.tile__icon {
		display: grid;
		place-items: center;
		align-self: flex-start;
		width: 1.85rem;
		height: 1.85rem;
		background: var(--accent);
		border: var(--bw-thin) solid var(--ink);
		/* Drives the glyph size — Icon sizes itself in em. */
		font-size: 1rem;
	}

	.tile--on .tile__icon {
		background: var(--white);
	}

	.tile__label {
		font-size: 0.84rem;
		font-weight: 900;
		line-height: 1.1;
		text-transform: uppercase;
	}

	.tile__blurb {
		font-size: 0.64rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.variants {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.6rem;
		background: var(--violet);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.rules {
		padding: 0.75rem 0.85rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
	}

	.rules summary {
		font-size: 0.72rem;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.rules ol {
		margin: 0.7rem 0 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		font-size: 0.78rem;
		font-weight: 700;
		line-height: 1.35;
	}

	/* Floats over the grid, so it needs a hard opaque edge. */
	.dock {
		position: sticky;
		bottom: 0;
		z-index: 2;
		margin: -0.3rem -1rem 0;
		padding: 0.8rem 1rem 1rem;
		background: var(--cream);
		border-top: var(--bw) solid var(--ink);
	}

	/* Stands in for the dock so the page doesn't jump when it appears. */
	.prompt {
		margin: 0;
		padding: 1.1rem 0 1.5rem;
		text-align: center;
		font-size: 0.78rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
</style>
