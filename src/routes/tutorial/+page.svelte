<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import BidScreen from '$lib/components/BidScreen.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import TourSpotlight from '$lib/components/TourSpotlight.svelte';
	import { applyAction, totalSpent } from '$lib/game/engine';
	import type { Action } from '$lib/game/types';
	import { STEPS, TUTOR, initialTutorial, sameAction } from '$lib/tutorial/script';

	/** How long Coach "thinks" before a move, so it reads as an opponent and not a glitch. */
	const TUTOR_DELAY = 900;

	/**
	 * Kept out of the game store on purpose: a tutorial must not overwrite a saved
	 * draft, and its finish shouldn't count as a `game_finished`.
	 */
	let view = $state(initialTutorial());
	let index = $state(0);
	let hint = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const step = $derived(STEPS[index]);
	const lessons = STEPS.filter((entry) => entry.kind !== 'tutor').length;
	const lesson = $derived(STEPS.slice(0, index + 1).filter((entry) => entry.kind !== 'tutor').length);

	onMount(() => {
		document.documentElement.dataset.hydrated = 'true';
		return () => clearTimeout(timer);
	});

	function advance(): void {
		hint = null;
		index++;
		const next = STEPS[index];
		if (next?.kind === 'tutor') {
			timer = setTimeout(() => {
				view = applyAction(view, next.action);
				advance();
			}, TUTOR_DELAY);
		}
	}

	/** Only the move the current step asks for gets through. */
	function dispatch(action: Action): void {
		if (step?.kind !== 'do') return;
		if (sameAction(action, step.expect)) {
			view = applyAction(view, action);
			advance();
		} else if (action.type === step.expect.type) {
			hint = step.hint ?? 'Tap the highlighted spot.';
		}
	}

	function restart(): void {
		clearTimeout(timer);
		view = initialTutorial();
		index = 0;
		hint = null;
	}

	const leave = () => goto('/');
</script>

<Seo
	title="$20 Draft Game — interactive tutorial"
	description="Learn the $20 draft game in a minute: a guided practice draft that walks you through revealing items, bidding, raising and letting things go."
	path="/tutorial"
/>

<main>
	{#if view.phase === 'results'}
		<div class="shell done">
			<span class="eyebrow">Tutorial complete</span>
			<h1>You're ready</h1>
			<div class="rosters">
				{#each view.players as player (player.id)}
					<div class="roster" style:--accent={player.id === 0 ? 'var(--p1)' : 'var(--p2)'}>
						<h2>{player.name}</h2>
						<ul>
							{#each player.roster as entry (entry.item.id)}
								<li>
									<span>{entry.item.name}</span>
									<b>{entry.free ? 'Free' : `$${entry.price}`}</b>
								</li>
							{/each}
						</ul>
						<span class="spent">Spent ${totalSpent(player)}</span>
					</div>
				{/each}
			</div>
			<p class="recap">
				That's it: flip, bid, raise, or let it go. A real game deals 2 items per slot from a
				category you pick, against a friend or the bot.
			</p>
			<a class="btn btn--hot" href="/">Play for real</a>
			<button class="btn btn--ghost" type="button" onclick={restart}>Run the tutorial again</button>
		</div>
	{:else}
		<BidScreen {view} {dispatch} seat={0} onQuit={leave} />

		{#if step?.kind === 'tutor'}
			<TourSpotlight targets={[]} title="{TUTOR}'s move" body="{TUTOR} is thinking…" />
		{:else if step}
			<TourSpotlight
				targets={step.target ?? []}
				title={step.title}
				body={step.body}
				{hint}
				progress="Step {lesson} of {lessons}"
				onnext={step.kind === 'info' ? advance : undefined}
				onskip={leave}
			/>
		{/if}
	{/if}
</main>

<style>
	.done {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding-top: 2rem;
	}

	h1 {
		margin: 0;
		font-size: 2.4rem;
		line-height: 0.95;
	}

	.rosters {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.roster {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.6rem;
		background: var(--accent);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.roster h2 {
		margin: 0;
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.roster ul {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.roster li {
		display: flex;
		justify-content: space-between;
		gap: 0.3rem;
		font-size: 0.85rem;
		font-weight: 800;
	}

	.spent {
		font-size: 0.6rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.recap {
		margin: 0;
		font-size: 0.88rem;
		font-weight: 700;
		line-height: 1.35;
	}
</style>
