<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BidScreen from '$lib/components/BidScreen.svelte';
	import ResultsScreen from '$lib/components/ResultsScreen.svelte';
	import { toGameState } from '$lib/remote/adapt';
	import { RemoteError } from '$lib/remote/client';
	import { recallSeat } from '$lib/remote/identity';
	import { room } from '$lib/remote/room.svelte';

	/*
	 * The room id is a query parameter, not a path segment.
	 *
	 * A dynamic `[roomId]` route can't be prerendered — the ids don't exist at
	 * build time — so it would have to be served by a function, and this app is a
	 * static shell by design. A query param keeps the whole deploy static and the
	 * link just as shareable.
	 */
	const roomId = $derived(page.url.searchParams.get('id') ?? '');

	let joining = $state(true);
	let error = $state<string | null>(null);
	let copied = $state(false);

	/** The invite URL is just this page — landing here joins you. */
	const shareUrl = $derived(`${page.url.origin}/online/room?id=${roomId}`);
	/* From the store after creating, or the URL after a refresh. Joiners have
	   no need for it — they are already in. */
	const code = $derived(room.code ?? page.url.searchParams.get('code'));

	const view = $derived(room.state ? toGameState(room.state) : null);
	const waiting = $derived(room.status === 'waiting');
	const away = $derived(room.status === 'opponent-away');

	onMount(async () => {
		try {
			// Already seated? Reuse it. Otherwise this URL is an invite, so take a seat.
			const seat = recallSeat(roomId) ?? (await room.join({ roomId })).seat;
			await room.connect(roomId, seat);
		} catch (failure) {
			error =
				failure instanceof RemoteError
					? failure.message
					: 'Could not join that room';
		} finally {
			joining = false;
		}
	});

	onDestroy(() => room.disconnect());

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			copied = false;
		}
	}

	function leave() {
		room.leave();
		void goto('/online');
	}
</script>

<svelte:head><title>Room — $20 Blind Draft</title></svelte:head>

{#if joining}
	<div class="shell centre"><p class="status">Joining…</p></div>
{:else if error}
	<div class="shell centre">
		<p class="status status--bad" role="alert">{error}</p>
		<a class="btn" href="/online">Back to online</a>
	</div>
{:else if waiting}
	<!-- Lobby: one seat filled. Both join methods are shown because a code is
	     easier to read out loud and a link is easier to send. -->
	<div class="shell lobby">
		<h1>Waiting for your opponent</h1>
		<p class="lobby__sub">They join, the draft starts. Nobody sees the deck.</p>

		{#if code}
			<div class="code">
				<span class="eyebrow">Room code</span>
				<strong>{code}</strong>
			</div>
		{/if}

		<button class="btn btn--hot" type="button" onclick={copyLink}>
			{copied ? 'Link copied' : 'Copy invite link'}
		</button>
		<button class="btn btn--ghost" type="button" onclick={leave}>Leave room</button>
	</div>
{:else if view}
	{#if away}
		<p class="away" role="status">
			Your opponent dropped out. They may be reconnecting — you can wait, or end it.
			<button type="button" onclick={leave}>End the game</button>
		</p>
	{/if}

	{#if view.phase === 'results'}
		<ResultsScreen
			{view}
			onRunItBack={null}
			onLeave={leave}
			leaveLabel="Leave room"
		/>
	{:else}
		<BidScreen {view} seat={room.seat} dispatch={(action) => void room.dispatch(action)} />
	{/if}

	{#if room.lastRejection}
		<p class="rejected" role="status">{room.lastRejection}</p>
	{/if}
{/if}

<style>
	.centre {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		align-items: center;
		justify-content: center;
		min-height: 60dvh;
	}

	.status {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.status--bad {
		padding: 0.6rem 0.7rem;
		background: var(--red);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		text-transform: none;
		letter-spacing: 0;
	}

	.lobby {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding-top: 3rem;
	}

	.lobby h1 {
		font-size: 1.8rem;
	}

	.lobby__sub {
		margin: 0 0 0.6rem;
		font-size: 0.85rem;
		font-weight: 700;
	}

	.code {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.8rem;
		margin-bottom: 0.3rem;
		background: var(--yellow);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.code strong {
		font-size: 2.4rem;
		font-weight: 900;
		letter-spacing: 0.2em;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	/* Sits above the board without shifting it. */
	.away {
		position: sticky;
		top: 0;
		z-index: 3;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0.6rem 0.8rem;
		background: var(--red);
		border-bottom: var(--bw) solid var(--ink);
		font-size: 0.78rem;
		font-weight: 800;
	}

	.away button {
		padding: 0.25rem 0.5rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.66rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	.rejected {
		position: sticky;
		bottom: 0;
		margin: 0;
		padding: 0.5rem 0.8rem;
		background: var(--ink);
		color: var(--cream);
		font-size: 0.76rem;
		font-weight: 800;
		text-align: center;
	}
</style>
