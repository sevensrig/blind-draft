<script lang="ts">
	import { onMount } from 'svelte';
	import BidScreen from '$lib/components/BidScreen.svelte';
	import ResultsScreen from '$lib/components/ResultsScreen.svelte';
	import SetupScreen from '$lib/components/SetupScreen.svelte';
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
</script>

<svelte:head>
	<title>$20 Budget Draft — two-player blind bidding party game</title>
	<meta name="description" content={SITE_DESCRIPTION} />
</svelte:head>

<main>
	{#if phase === 'setup'}
		<SetupScreen />
	{:else if phase === 'results'}
		<ResultsScreen />
	{:else}
		<BidScreen />
	{/if}
</main>
