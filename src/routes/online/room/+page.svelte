<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BidScreen from '$lib/components/BidScreen.svelte';
	import EmoteBar from '$lib/components/EmoteBar.svelte';
	import FeedbackPrompt from '$lib/components/FeedbackPrompt.svelte';
	import NamePrompt from '$lib/components/NamePrompt.svelte';
	import RematchPanel from '$lib/components/RematchPanel.svelte';
	import ResultsScreen from '$lib/components/ResultsScreen.svelte';
	import RoomChat from '$lib/components/RoomChat.svelte';
	import { track } from '$lib/analytics';
	import { botSuggestionEvent, botWaitEvent, type BotWaitChoice } from '$lib/analytics/events';
	import { getCategory, getVariant } from '$lib/data';
	import { buildBench, buildDeck } from '$lib/game/deck';
	import { game } from '$lib/game/store.svelte';
	import { toGameState } from '$lib/remote/adapt';
	import { RemoteError } from '$lib/remote/client';
	import { recallName, recallSeat, rememberName } from '$lib/remote/identity';
	import { emoteById } from '$lib/remote/emotes';
	import { room } from '$lib/remote/room.svelte';
	import { SITE_NAME } from '$lib/site';

	// A query param, not a path segment: a dynamic `[roomId]` route can't be
	// prerendered, so it would need a function and this deploy stays static.
	const roomId = $derived(page.url.searchParams.get('id') ?? '');

	let joining = $state(true);
	let error = $state<string | null>(null);
	let copied = $state(false);
	// An invite link never passed the name field on `/online`, so this page has to
	// ask — otherwise the server names the guest "Player 2" for the whole draft.
	let asking = $state(false);
	let name = $state('');

	/** The invite URL is just this page — landing here joins you. */
	const shareUrl = $derived(`${page.url.origin}/online/room?id=${roomId}`);
	/* From the store after creating, or the URL after a refresh. */
	const code = $derived(room.code ?? page.url.searchParams.get('code'));

	const view = $derived(room.state ? toGameState(room.state) : null);
	const waiting = $derived(room.status === 'waiting');
	// Not once they've left the results for good: "may be reconnecting" would be wrong.
	const away = $derived(room.status === 'opponent-away' && !room.opponentGone);
	// A server fact, unlike `away`, so it outranks every branch below — including
	// `waiting`, since a host whose guest quit isn't waiting for anybody.
	const ended = $derived(room.opponentLeft);
	const names = $derived(
		(room.state?.players.map((player) => player.name) ?? ['', '']) as [string, string]
	);
	/** The newest emote from each seat, for its player panel. */
	const emotes = $derived(
		Object.fromEntries(
			room.emotes.flatMap((event) => {
				const emote = emoteById(event.emote);
				return emote ? [[event.seat, emote]] : [];
			})
		)
	);
	const opponentName = $derived(
		room.state && room.seat !== null ? room.state.players[room.seat === 0 ? 1 : 0].name : 'They'
	);

	/** How long a host sits alone before being offered the bot instead. */
	const BOT_NUDGE_MS = 60_000;
	let lonely = $state(false);
	let waitingSince = 0;

	$effect(() => {
		// Restarts if the lobby is left and re-entered, so a reconnect isn't
		// greeted by a nudge it didn't earn.
		lonely = false;
		if (!waiting) return;
		waitingSince = Date.now();
		const timer = setTimeout(() => {
			lonely = true;
			track(botSuggestionEvent('bot_suggestion_shown', 'waiting_room', nudgeCategory));
		}, BOT_NUDGE_MS);
		return () => clearTimeout(timer);
	});

	const nudgeCategory = $derived(room.state?.config.categoryId ?? null);

	/**
	 * A bot game played on this page, against the local store, so the room stays
	 * connected — and listed — the whole time. Navigating to `/` would drop the
	 * host's presence and take the room off the browser.
	 */
	let botting = $state(false);
	const botGame = $derived(botting && game.state.phase !== 'setup');
	/** Somebody took the second seat mid bot game: time to choose. */
	const joinedMidBot = $derived(botGame && !waiting && !ended && view !== null);

	/** Same category and settings as the room, so the switch costs nothing. */
	function playBot() {
		const state = room.state;
		if (!state || room.seat === null) return;
		const config = { ...state.config, bot: 1 as const };
		const category = getCategory(config.categoryId);
		const pool =
			config.customItems ?? (category ? getVariant(category, config.variantId).items : []);
		if (!pool.length) return;

		const waited = Math.round((Date.now() - waitingSince) / 1000);
		track(botSuggestionEvent('bot_suggestion_clicked', 'waiting_room', nudgeCategory, waited));
		const deck = buildDeck(pool, config.roster);
		game.dispatch({
			type: 'start',
			config,
			names: [state.players[room.seat].name, 'Bot'],
			deck,
			bench: buildBench(pool, config.roster, deck)
		});
		botting = true;
	}

	/** Drops the bot game. Counts as a bot quit, which is what it is. */
	function stopBot() {
		botting = false;
		if (game.state.config.bot !== undefined && game.state.phase !== 'setup') {
			game.dispatch({ type: 'reset' });
		}
	}

	$effect(() => {
		if (joinedMidBot) {
			track(botWaitEvent('bot_wait_interrupted', nudgeCategory, game.state.history.length));
		}
	});

	let joinDialog = $state<HTMLDialogElement | null>(null);
	$effect(() => {
		// `showModal`, not `open`: it traps focus and inerts the bot board behind it.
		if (joinedMidBot && joinDialog && !joinDialog.open) joinDialog.showModal();
	});

	function chooseAfterJoin(choice: BotWaitChoice) {
		track(botWaitEvent('bot_wait_resolved', nudgeCategory, game.state.history.length, choice));
		joinDialog?.close();
		if (choice === 'room') {
			stopBot();
			return;
		}
		// The bot game is saved, so the home page picks it straight back up.
		botting = false;
		void leave('/');
	}

	onMount(async () => {
		// Already seated? Reuse it. Everyone else arrived on an invite link.
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
			// Back to the prompt, name still typed — a room that filled in the
			// meantime is the likeliest failure.
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
	 * Navigation waits on the server call so the room is really shut before the
	 * page unmounts; firing them concurrently raced teardown. `room.leave()`
	 * swallows its own failures, so nobody gets stranded.
	 */
	let leaving = $state(false);

	async function leave(to = '/online') {
		if (leaving) return;
		leaving = true;
		if (botting) stopBot();
		await room.leave();
		await goto(to);
	}
</script>

<svelte:head><title>Room — {SITE_NAME}</title></svelte:head>

{#if joining}
	<div class="shell centre"><p class="status">Joining…</p></div>
{:else if asking}
	<!-- Nothing is claimed on the server until this is submitted, so a stray tap
	     on a link doesn't fill someone's room. -->
	<NamePrompt
		eyebrow="You're invited"
		heading="Who's playing?"
		sub="Your opponent sees this name on the board."
		bind:value={name}
		busy={joining}
		{error}
		submit={() => void joinAsGuest()}
	>
		{#snippet secondary()}
			<a class="btn btn--ghost" href="/online">Back to online</a>
		{/snippet}
	</NamePrompt>
{:else if error}
	<div class="shell centre">
		<p class="status status--bad" role="alert">{error}</p>
		<a class="btn" href="/online">Back to online</a>
	</div>
{:else if ended}
	<!-- No results sheet on purpose: the draft didn't finish, so there is no
	     honest winner to declare. -->
	<div class="shell centre">
		<span class="eyebrow">Game over</span>
		<p class="status status--bad" role="alert">{opponentName} left the draft.</p>
		<button class="btn btn--hot" type="button" onclick={() => leave()} disabled={leaving}>
			Back to online
		</button>
		<FeedbackPrompt />
	</div>
{:else if botGame}
	{#if waiting}
		<p class="waitbar" role="status">
			Your room's still open. We'll call you back when someone joins.
			<button type="button" onclick={stopBot}>Back to the lobby</button>
		</p>
	{/if}

	<!-- No `view`: these read the local store, where the bot game lives. -->
	{#if game.state.phase === 'results'}
		<ResultsScreen onLeave={stopBot} leaveLabel="Back to the lobby" />
	{:else}
		<BidScreen seat={0} onQuit={stopBot} />
	{/if}

	<!-- Escape is swallowed: closing without a choice would strand the guest. -->
	<dialog
		bind:this={joinDialog}
		class="joined"
		aria-labelledby="joined-title"
		oncancel={(event) => event.preventDefault()}
	>
		<span class="eyebrow">Your room filled</span>
		<h2 id="joined-title">{opponentName} joined</h2>
		<p>They're waiting on the draft. Jump in, or stay with the bot and close the room.</p>
		<button class="btn btn--hot" type="button" onclick={() => chooseAfterJoin('room')}>
			Play {opponentName}
		</button>
		<button
			class="btn btn--ghost"
			type="button"
			onclick={() => chooseAfterJoin('bot')}
			disabled={leaving}
		>
			Keep playing the bot
		</button>
	</dialog>
{:else if waiting}
	<!-- Both join methods: a code reads out loud, a link sends. -->
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
		<button class="btn btn--ghost" type="button" onclick={() => leave()} disabled={leaving}>
			{leaving ? 'Leaving…' : 'Leave room'}
		</button>

		<!-- The room stays open underneath, so this never costs the host a guest. -->
		{#snippet botButton()}
			<button class="btn btn--yellow" type="button" onclick={playBot} disabled={leaving}>
				Play the bot while you wait
			</button>
		{/snippet}
		{#if lonely}
			<div class="nudge" role="status">
				<p>Still nobody? Play the bot while you wait.</p>
				{@render botButton()}
			</div>
		{:else}
			{@render botButton()}
		{/if}
	</div>
{:else if view}
	{#if away}
		<p class="away" role="status">
			Your opponent dropped out. They may be reconnecting — you can wait, or end it.
			<button type="button" onclick={() => leave()} disabled={leaving}>End the game</button>
		</p>
	{/if}

	{#if view.phase === 'results'}
		<ResultsScreen {view} onLeave={() => leave()} leaveLabel="Leave room">
			{#snippet rematch()}
				{#if room.seat !== null}
					<RematchPanel
						offer={room.rematch}
						seat={room.seat}
						{opponentName}
						opponentGone={room.opponentGone}
						config={view.config}
						onPropose={(settings) => room.proposeRematch(settings)}
						onAccept={() => room.acceptRematch()}
						onCancel={() => room.cancelRematch()}
					/>
				{/if}
			{/snippet}
			{#snippet chat()}
				{#if room.seat !== null}
					<RoomChat
						seat={room.seat}
						{names}
						messages={room.chat}
						send={(text) => room.say(text)}
						closed={room.opponentGone ? `${opponentName} left, so chat is closed.` : null}
					/>
				{/if}
			{/snippet}
		</ResultsScreen>
	{:else}
		<!-- `onQuit` is what stops the Quit button dispatching `reset` at the server. -->
		<BidScreen
			{view}
			seat={room.seat}
			dispatch={(action) => void room.dispatch(action)}
			onQuit={() => leave()}
			{emotes}
		>
			{#snippet toolbar()}
				{#if room.seat !== null}
					<EmoteBar seat={room.seat} {names} bubbles={room.emotes} send={(id) => room.emote(id)} />
				{/if}
			{/snippet}
		</BidScreen>
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
		background: var(--white);
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

	.nudge {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.6rem;
		padding: 0.8rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.nudge p {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 800;
	}

	.waitbar {
		position: sticky;
		top: 0;
		z-index: 6;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0.6rem 0.8rem;
		background: var(--yellow);
		border-bottom: var(--bw) solid var(--ink);
		font-size: 0.78rem;
		font-weight: 800;
	}

	.waitbar button {
		padding: 0.25rem 0.5rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.66rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	.joined {
		width: min(22rem, calc(100vw - 2rem));
		padding: 1.2rem;
		background: var(--cream);
		color: var(--ink);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.joined[open] {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.joined::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.joined h2 {
		margin: 0;
		font-size: 1.5rem;
	}

	.joined p {
		margin: 0 0 0.3rem;
		font-size: 0.85rem;
		font-weight: 700;
	}

	/* Sits above the board without shifting it, and above the open emote tray. */
	.away {
		position: sticky;
		top: 0;
		z-index: 6;
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
