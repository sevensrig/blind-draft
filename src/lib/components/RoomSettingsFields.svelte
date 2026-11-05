<script lang="ts">
	import { CATEGORIES, hasVariants } from '$lib/data';
	import { deckSizeFor } from '$lib/game/deck';
	import type { SettingsForm } from '$lib/remote/settings.svelte';
	import CustomListForm from './CustomListForm.svelte';
	import Icon from './Icon.svelte';

	const BUDGET_PRESETS = [10, 20, 50];
	const SLOT_PRESETS = [3, 4, 5, 6, 7, 8];

	/** Shared by `/online` and the rematch picker. Visibility shows only when bound. */
	let {
		form,
		visibility = $bindable(),
		budgetTitle = 'Budget'
	}: {
		form: SettingsForm;
		visibility?: 'public' | 'private';
		budgetTitle?: string;
	} = $props();
</script>

<section class="block">
	<h2 class="block__title">{budgetTitle}</h2>
	<div class="chips">
		{#each BUDGET_PRESETS as preset (preset)}
			<button
				class="chip"
				class:chip--on={form.budget === preset}
				type="button"
				onclick={() => (form.budget = preset)}>${preset}</button
			>
		{/each}
	</div>
</section>

{#if !form.template}
	<section class="block">
		<h2 class="block__title">Roster slots each</h2>
		<div class="chips chips--wrap">
			{#each SLOT_PRESETS as preset (preset)}
				<button
					class="chip"
					class:chip--on={form.effectiveSlots === preset}
					type="button"
					disabled={preset > form.slotCap}
					onclick={() => (form.slots = preset)}>{preset}</button
				>
			{/each}
		</div>
	</section>
{:else}
	<section class="block">
		<h2 class="block__title">{form.category?.label} roster (locked)</h2>
		<div class="chips">
			{#each form.template as slot (slot.id)}
				<span class="chip chip--static">{slot.label}</span>
			{/each}
		</div>
	</section>
{/if}

{#if visibility !== undefined}
	<section class="block">
		<h2 class="block__title">Who can join</h2>
		<div class="chips">
			<button
				class="chip"
				class:chip--on={visibility === 'public'}
				type="button"
				onclick={() => (visibility = 'public')}>Anyone</button
			>
			<button
				class="chip"
				class:chip--on={visibility === 'private'}
				type="button"
				onclick={() => (visibility = 'private')}>Link only</button
			>
		</div>
		<p class="hint">Set once. A private room never shows up in the browser.</p>
	</section>
{/if}

<section class="block">
	<h2 class="block__title">Category</h2>

	{#if form.isCustom}
		<CustomListForm
			bind:name={form.customName}
			bind:text={form.customText}
			drafted={deckSizeFor(form.effectiveSlots)}
		/>
	{/if}

	{#if form.category && hasVariants(form.category)}
		{@const category = form.category}
		<div class="variants">
			<span class="eyebrow">{category.label} pool</span>
			<div class="chips">
				{#each category.variants as option (option.id)}
					<button
						class="chip"
						class:chip--on={form.variant?.id === option.id}
						type="button"
						onclick={() => (form.variantChoice[category.id] = option.id)}>{option.label}</button
					>
				{/each}
			</div>
		</div>
	{/if}

	<div class="grid">
		{#each CATEGORIES as entry (entry.id)}
			<button
				class="tile"
				class:tile--on={form.categoryId === entry.id}
				style:--accent={`var(--${entry.accent})`}
				type="button"
				aria-pressed={form.categoryId === entry.id}
				onclick={() => (form.categoryId = entry.id)}
			>
				<span class="tile__icon"><Icon name={entry.icon} /></span>
				<span class="tile__label">{entry.label}</span>
			</button>
		{/each}
	</div>
</section>

<style>
	.block {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.block__title {
		font-size: 0.68rem;
		letter-spacing: 0.14em;
	}

	.chips {
		display: flex;
		gap: 0.4rem;
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
		font-size: 0.88rem;
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
	}

	.chip--on {
		background: var(--ink);
		color: var(--cream);
	}

	.chip--static {
		box-shadow: none;
		font-size: 0.72rem;
		font-weight: 900;
		text-align: center;
		line-height: 1.6;
	}

	.chip:disabled {
		opacity: 0.35;
		box-shadow: none;
		transform: translate(4px, 4px);
	}

	.hint {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--ink-muted);
	}

	.variants {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.6rem;
		margin-bottom: 0.2rem;
		background: var(--violet);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.tile {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		text-align: left;
	}

	.tile--on {
		background: var(--accent);
		box-shadow: var(--shadow-lg);
	}

	.tile__icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 1.6rem;
		height: 1.6rem;
		background: var(--accent);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.85rem;
	}

	.tile--on .tile__icon {
		background: var(--white);
	}

	.tile__label {
		font-size: 0.76rem;
		font-weight: 900;
		line-height: 1.1;
		text-transform: uppercase;
	}
</style>
