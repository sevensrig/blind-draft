<script lang="ts">
	import Icon from './Icon.svelte';
	import { EMOTES, emoteById, type EmoteId } from '$lib/remote/emotes';
	import type { EmoteEvent } from '$lib/remote/types';

	interface Props {
		/** The seat this device plays, so only the opponent's emotes are announced. */
		seat: 0 | 1;
		names: [string, string];
		bubbles: EmoteEvent[];
		send: (id: EmoteId) => void;
	}

	let { seat, names, bubbles, send }: Props = $props();

	/** Long enough to stop a mash from flooding the other screen. */
	const COOLDOWN_MS = 1200;
	let cooling = $state(false);
	let open = $state(false);
	let root = $state<HTMLDivElement | null>(null);
	let toggle = $state<HTMLButtonElement | null>(null);

	/** Unrolls from the button and rolls back into it. Linear, like every motion here. */
	function reveal(_node: Element) {
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		return {
			duration: still ? 0 : 110,
			css: (t: number) => `clip-path: inset(0 0 0 ${(1 - t) * 100}%)`
		};
	}

	/* Sighted players see it on the sender's panel; this is for screen readers. */
	const heard = $derived(bubbles.findLast((bubble) => bubble.seat !== seat));

	function close(refocus = false) {
		open = false;
		if (refocus) toggle?.focus();
	}

	/** One tap sends and folds the tray away, so it never lingers over the header. */
	function fire(id: EmoteId) {
		if (cooling) return;
		send(id);
		close(true);
		cooling = true;
		setTimeout(() => (cooling = false), COOLDOWN_MS);
	}

	$effect(() => {
		if (!open) return;
		const outside = (event: PointerEvent) => {
			if (root && !root.contains(event.target as Node)) close();
		};
		window.addEventListener('pointerdown', outside);
		return () => window.removeEventListener('pointerdown', outside);
	});
</script>

<p class="sr-only" role="status">
	{#if heard}{names[heard.seat]}: {emoteById(heard.emote)?.label}{/if}
</p>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && open) close(true);
	}}
/>

<div class="emotes" bind:this={root}>
	{#if open}
		<div class="tray" id="emote-tray" role="group" transition:reveal aria-label="Send an emote">
			{#each EMOTES as emote (emote.id)}
				<button
					type="button"
					class="emote"
					aria-label={emote.label}
					title={emote.label}
					onclick={() => fire(emote.id)}
				>
					<Icon name={emote.icon} />
				</button>
			{/each}
		</div>
	{/if}

	<button
		bind:this={toggle}
		type="button"
		class="emote toggle"
		class:on={open}
		aria-label="Emotes"
		aria-expanded={open}
		aria-controls="emote-tray"
		disabled={cooling}
		onclick={() => (open = !open)}
	>
		<Icon name="face-smile" />
	</button>
</div>

<style>
	.emotes {
		position: relative;
		display: flex;
	}

	/* Slides out leftwards over the header text, covering it only while open. */
	.tray {
		position: absolute;
		top: 50%;
		right: calc(100% + 0.3rem);
		z-index: 5;
		display: flex;
		gap: 0.3rem;
		padding: 0.25rem;
		background: var(--cream);
		border: var(--bw-thin) solid var(--ink);
		box-shadow: 3px 3px 0 var(--ink);
		translate: 0 -50%;
	}

	.emote {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		box-shadow: 2px 2px 0 var(--ink);
		font-size: 1.1rem;
		cursor: pointer;
	}

	.emote:active:not(:disabled) {
		translate: 2px 2px;
		box-shadow: none;
	}

	.toggle.on {
		background: var(--ink);
		color: var(--cream);
	}

	.toggle:disabled {
		cursor: default;
		background: var(--cream);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
