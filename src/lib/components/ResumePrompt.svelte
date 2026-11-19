<script lang="ts">
	import type { GameState } from '$lib/game/types';

	interface Props {
		saved: GameState;
		resume: () => void;
		discard: () => void;
	}

	let { saved, resume, discard }: Props = $props();

	const names = $derived(saved.players.map((player) => player.name).join(' vs '));
	const where = $derived(
		saved.phase === 'results'
			? 'Finished — results waiting'
			: `Item ${Math.min(saved.index + 1, saved.deck.length)} of ${saved.deck.length}`
	);
</script>

<div class="shell ask">
	<span class="eyebrow">Game in progress</span>
	<h1>Pick up where you left off?</h1>
	<p class="ask__sub">{names} · {saved.config.categoryLabel}</p>
	<p class="ask__sub">{where}</p>

	<button class="btn btn--hot" type="button" onclick={resume}>Resume</button>
	<button class="btn btn--ghost" type="button" onclick={discard}>New game</button>
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
		margin: 0;
		font-size: 0.85rem;
		font-weight: 700;
	}

	.ask__sub:last-of-type {
		margin-bottom: 0.4rem;
	}
</style>
