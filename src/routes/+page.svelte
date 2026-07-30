<script lang="ts">
	import { onMount } from 'svelte';
	import BidScreen from '$lib/components/BidScreen.svelte';
	import ResultsScreen from '$lib/components/ResultsScreen.svelte';
	import SetupScreen from '$lib/components/SetupScreen.svelte';
	import { game } from '$lib/game/store.svelte';

	onMount(() => {
		// Picks a game back up if the phone reloaded mid-draft.
		game.hydrate();
		/*
		 * Marks the client bundle as alive. The page is prerendered, so if hydration
		 * ever dies the HTML still renders perfectly while every control does
		 * nothing — a failure mode this app has actually shipped. The E2E suite waits
		 * on this before its first tap, which both removes a click race and turns a
		 * broken hydration into an immediate, obvious test failure.
		 */
		document.documentElement.dataset.hydrated = 'true';
	});

	const phase = $derived(game.state.phase);
</script>

<svelte:head>
	<title>$20 Blind Draft</title>
	<meta
		name="description"
		content="A two-player blind bidding draft. One phone, twenty dollars, no idea what's coming next."
	/>
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
