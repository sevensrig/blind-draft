<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BidScreen from '$lib/components/BidScreen.svelte';
	import ResultsScreen from '$lib/components/ResultsScreen.svelte';
	import { toGameState } from '$lib/remote/adapt';
	import { RemoteError } from '$lib/remote/client';
	import { recallName, recallSeat, rememberName } from '$lib/remote/identity';
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
	/*
	 * An invite link is the one way into a room that never passed through the
	 * name field on `/online`, so this page has to ask. It used to just take the
	 * seat, which left the joiner permanently called "Player 2" with no way to
	 * change it — the server names an unnamed seat and nothing edits it after.
	 */
	let asking = $state(false);
	let name = $state('');

	/** The invite URL is just this page — landing here joins you. */
	const shareUrl = $derived(`${page.url.origin}/online/room?id=${roomId}`);
	/* From the store after creating, or the URL after a refresh. Joiners have
	   no need for it — they are already in. */
	const code = $derived(room.code ?? page.url.searchParams.get('code'));

	const view = $derived(room.state ? toGameState(room.state) : null);
	const waiting = $derived(room.status === 'waiting');
	const away = $derived(room.status === 'opponent-away');
	/*
	 * The opponent quit, as opposed to `away`, which is a presence blip that
	 * clears itself. This one is a server fact, so it outranks every other branch
	 * below — including `waiting`, since a host whose guest quit in the lobby is
	 * not waiting for anybody.
	 */
	const ended = $derived(room.opponentLeft);
	const opponentName = $derived(
		room.state && room.seat !== null ? room.state.players[room.seat === 0 ? 1 : 0].name : 'They'
	);

	onMount(async () => {
		// Already seated? Reuse it, and don't ask a returning player who they are.
		// Everyone else arrived on an invite link and needs to be asked first.
		const seat = recallSeat(roomId);
		if (seat === null) {
			name = recallName();
			asking = true;
			joining = false;
			return;
		}
		await attach(seat);
	});

	async function attach(seat: 0 | 1): Promise<void> {
		try {
			await room.connect(roomId, seat);
		} catch (failure) {
			error = failure instanceof RemoteError ? failure.message : 'Could not join that room';
		} finally {
			joining = false;
		}
	}

	/** Take the second seat under the name just typed. */
	async function joinAsGuest(): Promise<void> {
		if (joining) return;
		joining = true;
		error = null;
		try {
			const chosen = name.trim();
			rememberName(chosen);
			const { seat } = await room.join({ roomId, name: chosen });
			asking = false;
			await attach(seat);
		} catch (failure) {
			// Back to the prompt rather than a dead end: a room that filled up in
			// the meantime is the likeliest failure, and the name is still typed.
			error = failure instanceof RemoteError ? failure.message : 'Could not join that room';
			joining = false;
		}
	}

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

	/**
	 * Quit: close the room, then get out.
	 *
	 * Navigation waits on the server call so the room is really shut before the
	 * page unmounts — `onDestroy` only drops the channel, and firing them
	 * concurrently raced the request against teardown. `room.leave()` swallows its
	 * own failures, so this cannot strand anyone on a dead screen.
	 */
	let leaving = $state(false);

	async function leave() {
		if (leaving) return;
		leaving = true;
		await room.leave();
		await goto('/online');
	}
</script>

<svelte:head><title>Room — $20 Blind Draft</title></svelte:head>

{#if joining}
	<div class="shell centre"><p class="status">Joining…</p></div>
{:else if asking}
	<!-- Invite-link landing. Nothing is claimed on the server until this is
	     submitted, so a stray tap on a link doesn't fill someone's room. -->
	<div class="shell ask">
		<span class="eyebrow">You're invited</span>
		<h1>Who's playing?</h1>
		<p class="ask__sub">Your opponent sees this name on the board.</p>

		{#if error}
			<p class="status status--bad" role="alert">{error}</p>
		{/if}

		<form
			class="ask__form"
			onsubmit={(event) => {
				event.preventDefault();
				void joinAsGuest();
			}}
		>
			<label class="ask__label" for="guest-name">Your name</label>
			<input
				id="guest-name"
				class="field"
				type="text"
				bind:value={name}
				placeholder="Player"
				maxlength="14"
				autocomplete="nickname"
			/>
			<button class="btn btn--hot" type="submit">Join the draft</button>
		</form>
		<a class="btn btn--ghost" href="/online">Back to online</a>
	</div>
{:else if error}
	<div class="shell centre">
		<p class="status status--bad" role="alert">{error}</p>
		<a class="btn" href="/online">Back to online</a>
	</div>
{:else if ended}
	<!-- Terminal. No wait-it-out option, and deliberately no results sheet: the
	     draft didn't finish, so there is no honest winner to declare. -->
	<div class="shell centre">
		<span class="eyebrow">Game over</span>
		<p class="status status--bad" role="alert">{opponentName} left the draft.</p>
		<button class="btn btn--hot" type="button" onclick={leave} disabled={leaving}>
			Back to online
		</button>
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
		<button class="btn btn--ghost" type="button" onclick={leave} disabled={leaving}>
			{leaving ? 'Leaving…' : 'Leave room'}
		</button>
	</div>
{:else if view}
	{#if away}
		<p class="away" role="status">
			Your opponent dropped out. They may be reconnecting — you can wait, or end it.
			<button type="button" onclick={leave} disabled={leaving}>End the game</button>
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
		<!-- `onQuit` is what stops the Quit button dispatching `reset` at the server. -->
		<BidScreen
			{view}
			seat={room.seat}
			dispatch={(action) => void room.dispatch(action)}
			onQuit={leave}
		/>
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
