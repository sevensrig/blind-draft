<script lang="ts">
	import { onMount } from 'svelte';
	import BidScreen from '$lib/components/BidScreen.svelte';
	import ResultsScreen from '$lib/components/ResultsScreen.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import SetupScreen from '$lib/components/SetupScreen.svelte';
	import { other } from '$lib/game/engine';
	import { game } from '$lib/game/store.svelte';
	import { SITE_DESCRIPTION } from '$lib/site';

	onMount(() => {
		// Picks a game back up if the phone reloaded mid-draft.
		game.hydrate();
		// Marks the client bundle as alive. The page is prerendered, so a dead
		// hydration still renders perfectly with every control inert — a failure
		// this app has shipped. The E2E suite waits on this before its first tap.
		document.documentElement.dataset.hydrated = 'true';
	});

	const phase = $derived(game.state.phase);
	const bot = $derived(game.state.config.bot);
	/** Against the bot this device only drives the human's seat. */
	const seat = $derived(bot === undefined ? null : other(bot));
</script>

<Seo
	title="$20 Draft Game — free two-player bidding party game"
	description={SITE_DESCRIPTION}
	path="/"
/>

<main>
	{#if phase === 'setup'}
		<SetupScreen />
	{:else if phase === 'results'}
		<ResultsScreen />
	{:else}
		<BidScreen {seat} />
	{/if}
</main>
