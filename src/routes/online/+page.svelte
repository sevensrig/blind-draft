<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { CATEGORIES, getCategory, getVariant, hasVariants, openRoster } from '$lib/data';
	import { maxSlotsFor } from '$lib/game/deck';
	import { DEFAULT_BUDGET, DEFAULT_SLOTS } from '$lib/game/engine';
	import Icon from '$lib/components/Icon.svelte';
	import { RemoteError } from '$lib/remote/client';
	import { recallName, rememberName } from '$lib/remote/identity';
	import { room } from '$lib/remote/room.svelte';

	const BUDGET_PRESETS = [10, 20, 50];
	const SLOT_PRESETS = [3, 4, 5, 6, 7, 8];

	let name = $state('');
	let budget = $state(DEFAULT_BUDGET);
	let slots = $state(DEFAULT_SLOTS);
	let categoryId = $state<string | null>(null);
	let variantChoice = $state<Record<string, string>>({});
	let visibility = $state<'public' | 'private'>('public');
	let joinCode = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	/* Custom pools live on one device, so the server has no deck to build. */
	const creatable = CATEGORIES.filter((entry) => !entry.custom);

	const category = $derived(categoryId ? getCategory(categoryId) : undefined);
	const activeVariant = $derived(
		category ? getVariant(category, variantChoice[category.id] ?? '') : undefined
	);
	const template = $derived(category?.roster ?? null);
	const slotCap = $derived(
		activeVariant ? Math.min(10, maxSlotsFor(activeVariant.items.length)) : 10
	);
	const effectiveSlots = $derived(template ? template.length : Math.min(slots, slotCap));

	/* Typed once, then reused by the rooms browser and by an invite link, neither
	   of which has a name field of its own. */
	onMount(() => {
		name = recallName();
	});

	async function create() {
		if (!category || !activeVariant || busy) return;
		busy = true;
		error = null;
		rememberName(name);
		try {
			const { roomId, code } = await room.create({
				categoryId: category.id,
				variantId: activeVariant.id,
				budget,
				slots: effectiveSlots,
				visibility,
				name: name.trim()
			});
			// Code rides in the URL so refreshing the lobby still shows it.
			await goto(`/online/room?id=${roomId}&code=${code}`);
		} catch (failure) {
			error = failure instanceof RemoteError ? failure.message : 'Could not create that room';
			busy = false;
		}
	}

	async function join() {
		const code = joinCode.replace(/\D/g, '');
		if (code.length < 4 || busy) return;
		busy = true;
		error = null;
		rememberName(name);
		try {
			const { roomId } = await room.join({ code, name: name.trim() });
			await goto(`/online/room?id=${roomId}`);
		} catch (failure) {
			error = failure instanceof RemoteError ? failure.message : 'Could not join that room';
			busy = false;
		}
	}
</script>

<svelte:head><title>Play online — $20 Blind Draft</title></svelte:head>

<div class="shell online">
	<header class="head">
		<a class="back" href="/">Back</a>
		<h1>Play online</h1>
		<p class="sub">Two phones, two places. Same blind draft.</p>
	</header>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	<section class="block">
		<h2 class="block__title">Your name</h2>
		<input class="field" type="text" bind:value={name} placeholder="Player" maxlength="14" />
	</section>

	<section class="block">
		<h2 class="block__title">Join a room</h2>
		<div class="join">
			<input
				class="field code"
				type="text"
				inputmode="numeric"
				bind:value={joinCode}
				placeholder="000000"
				maxlength="6"
				aria-label="Room code"
			/>
			<button
				class="btn"
				type="button"
				disabled={joinCode.replace(/\D/g, '').length < 4 || busy}
				onclick={join}>Join</button
			>
		</div>
		<!-- A button, not a footnote link: this is the second real way in, and as a
		     link under the code field it read as fine print.

		     It banks the name on the way out. `rememberName` otherwise only ran on
		     create/join, so a player who typed their name here and then browsed
		     arrived at the room list with nothing remembered — the very case the
		     saved name exists for. -->
		<a class="btn btn--yellow browse" href="/online/rooms" onclick={() => rememberName(name)}>
			Browse open rooms
		</a>
	</section>

	<hr class="rule" />

	<section class="block">
		<h2 class="block__title">Or start one</h2>
		<div class="chips">
			{#each BUDGET_PRESETS as preset (preset)}
				<button
					class="chip"
					class:chip--on={budget === preset}
					type="button"
					onclick={() => (budget = preset)}>${preset}</button
				>
			{/each}
		</div>
	</section>

	{#if !template}
		<section class="block">
			<h2 class="block__title">Roster slots each</h2>
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
		</section>
	{:else}
		<section class="block">
			<h2 class="block__title">{category?.label} roster (locked)</h2>
			<div class="chips">
				{#each template as slot (slot.id)}
					<span class="chip chip--static">{slot.label}</span>
				{/each}
			</div>
		</section>
	{/if}

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

	<section class="block">
		<h2 class="block__title">Category</h2>

		{#if category && hasVariants(category)}
			<div class="variants">
				<span class="eyebrow">{category.label} pool</span>
				<div class="chips">
					{#each category.variants as option (option.id)}
						<button
							class="chip"
							class:chip--on={activeVariant?.id === option.id}
							type="button"
							onclick={() => (variantChoice[category.id] = option.id)}>{option.label}</button
						>
					{/each}
				</div>
			</div>
		{/if}

		<div class="grid">
			{#each creatable as entry (entry.id)}
				<button
					class="tile"
					class:tile--on={categoryId === entry.id}
					style:--accent={`var(--${entry.accent})`}
					type="button"
					aria-pressed={categoryId === entry.id}
					onclick={() => (categoryId = entry.id)}
				>
					<span class="tile__icon"><Icon name={entry.icon} /></span>
					<span class="tile__label">{entry.label}</span>
				</button>
			{/each}
		</div>
	</section>

	<div class="dock">
		<button class="btn btn--hot" type="button" disabled={!category || busy} onclick={create}>
			{busy ? 'Working…' : category ? 'Create room' : 'Pick a category'}
			{#if category}
				<span class="btn__sub">
					{category.label} · ${budget} · {effectiveSlots} slots · {visibility === 'public'
						? 'anyone'
						: 'link only'}
				</span>
			{/if}
		</button>
	</div>
</div>

<style>
	.online {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}

	.head {
		padding-top: 1.1rem;
	}

	.back {
		display: inline-block;
		margin-bottom: 0.6rem;
		padding: 0.25rem 0.5rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		box-shadow: 3px 3px 0 var(--ink);
		font-size: 0.62rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink);
		text-decoration: none;
	}

	.head h1 {
		font-size: 2rem;
	}

	.sub {
		margin: 0.35rem 0 0;
		font-size: 0.88rem;
		font-weight: 700;
	}

	.error {
		margin: 0;
		padding: 0.6rem 0.7rem;
		background: var(--red);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 0.82rem;
		font-weight: 800;
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

	.field {
		width: 100%;
		padding: 0.6rem 0.55rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 1rem;
		font-weight: 900;
	}

	.field:focus {
		outline: var(--bw-thin) solid var(--ink);
		outline-offset: 2px;
	}

	.join {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.5rem;
	}

	.code {
		font-size: 1.4rem;
		letter-spacing: 0.28em;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.join .btn {
		width: auto;
		padding-inline: 1.3rem;
	}

	.browse {
		min-height: 3rem;
		margin-top: 0.1rem;
		font-size: 0.85rem;
	}

	.rule {
		height: var(--bw);
		margin: 0;
		background: var(--ink);
		border: 0;
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

	.dock {
		position: sticky;
		bottom: 0;
		z-index: 2;
		margin: -0.3rem -1rem 0;
		padding: 0.8rem 1rem 1rem;
		background: var(--cream);
		border-top: var(--bw) solid var(--ink);
	}
</style>
