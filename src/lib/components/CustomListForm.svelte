<script lang="ts">
	import { CUSTOM_MIN_ITEMS, CUSTOM_NAME_MAX, blockedEntry, customSeeds } from '$lib/data/custom';

	/** Shared by local and online setup, so a list typed for one works in the other. */
	let {
		name = $bindable(),
		text = $bindable(),
		drafted
	}: { name: string; text: string; drafted: number } = $props();

	const seeds = $derived(customSeeds(text.split('\n')));
	const count = $derived(seeds.length);
	const blocked = $derived(blockedEntry(name, seeds));
</script>

<div class="custom">
	<label class="custom__field">
		<span class="eyebrow">Category name</span>
		<input
			type="text"
			bind:value={name}
			placeholder="Custom Draft"
			maxlength={CUSTOM_NAME_MAX}
			autocomplete="off"
		/>
	</label>

	<label class="custom__field">
		<span class="eyebrow">Draft options — one per line</span>
		<textarea
			bind:value={text}
			rows="7"
			placeholder={'Pizza\nSushi\nTacos\nRamen\nBurgers\nWings'}
			autocomplete="off"
			spellcheck="false"
		></textarea>
	</label>

	<p class="custom__count" class:custom__count--short={blocked || count < CUSTOM_MIN_ITEMS}>
		{#if blocked}
			No slurs — remove “{blocked}” to start
		{:else if count < CUSTOM_MIN_ITEMS}
			{count}/{CUSTOM_MIN_ITEMS} options — add
			{CUSTOM_MIN_ITEMS - count} more to start
		{:else}
			{count} options · {drafted} get drafted, picked at
			random each game
		{/if}
	</p>
</div>

<style>
	.custom {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.7rem 0.6rem;
		background: var(--yellow);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.custom__field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.custom input,
	.custom textarea {
		width: 100%;
		padding: 0.5rem 0.55rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.95rem;
		font-weight: 800;
	}

	.custom textarea {
		font-size: 0.9rem;
		line-height: 1.5;
		/* Vertical only — horizontal would break the tile grid beside it. */
		resize: vertical;
	}

	.custom input:focus,
	.custom textarea:focus {
		outline: var(--bw-thin) solid var(--ink);
		outline-offset: 2px;
	}

	.custom input::placeholder,
	.custom textarea::placeholder {
		color: var(--ink-muted);
		font-weight: 700;
	}

	.custom__count {
		margin: 0;
		font-size: 0.68rem;
		font-weight: 900;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	/* Sits on yellow, so the warning inverts rather than going red. */
	.custom__count--short {
		align-self: flex-start;
		padding: 0.15rem 0.35rem;
		background: var(--ink);
		color: var(--cream);
	}
</style>
