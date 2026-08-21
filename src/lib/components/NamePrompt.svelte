<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Small caps line above the heading. */
		eyebrow: string;
		heading: string;
		sub: string;
		/** The typed name. Bound so the caller keeps it across a failed join. */
		value: string;
		busy?: boolean;
		error?: string | null;
		submitLabel?: string;
		submit: () => void;
		/** The way out — a link back, or a cancel button. */
		secondary?: Snippet;
	}

	let {
		eyebrow,
		heading,
		sub,
		value = $bindable(''),
		busy = false,
		error = null,
		submitLabel = 'Join the draft',
		submit,
		secondary
	}: Props = $props();

	/*
	 * An empty name defeats the point of asking. The server names an unnamed seat
	 * "Player 2" and nothing edits it afterwards, so a prompt that accepts nothing
	 * lands the player exactly where not being asked did.
	 */
	const ready = $derived(value.trim().length > 0);

	/** Unique per instance, so the label still points at its own input. */
	const fieldId = $props.id();
</script>

<div class="shell ask">
	<span class="eyebrow">{eyebrow}</span>
	<h1>{heading}</h1>
	<p class="ask__sub">{sub}</p>

	{#if error}
		<p class="status status--bad" role="alert">{error}</p>
	{/if}

	<form
		class="ask__form"
		onsubmit={(event) => {
			event.preventDefault();
			if (ready && !busy) submit();
		}}
	>
		<label class="ask__label" for={fieldId}>Your name</label>
		<input
			id={fieldId}
			class="field"
			type="text"
			bind:value
			placeholder="Player"
			maxlength="14"
			autocomplete="nickname"
		/>
		<button class="btn btn--hot" type="submit" disabled={!ready || busy}>
			{busy ? 'Joining…' : submitLabel}
		</button>
	</form>

	{@render secondary?.()}
</div>

<style>
	.ask {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding-top: 3rem;
	}

	.ask h1 {
		font-size: 1.8rem;
	}

	.ask__sub {
		margin: 0 0 0.4rem;
		font-size: 0.85rem;
		font-weight: 700;
	}

	.status--bad {
		margin: 0;
		padding: 0.6rem 0.7rem;
		background: var(--red);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 0.9rem;
		font-weight: 900;
	}

	.ask__form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.ask__label {
		font-size: 0.68rem;
		font-weight: 900;
		letter-spacing: 0.14em;
		text-transform: uppercase;
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
</style>
