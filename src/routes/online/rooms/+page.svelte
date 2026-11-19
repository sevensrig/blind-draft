<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { track } from '$lib/analytics';
	import { botSuggestionEvent } from '$lib/analytics/events';
	import BidScreen from '$lib/components/BidScreen.svelte';
	import EmoteBar from '$lib/components/EmoteBar.svelte';
	import FeedbackPrompt from '$lib/components/FeedbackPrompt.svelte';
	import NamePrompt from '$lib/components/NamePrompt.svelte';
	import RematchPanel from '$lib/components/RematchPanel.svelte';
	import ResultsScreen from '$lib/components/ResultsScreen.svelte';
	import { clearState, loadState } from '$lib/game/persist';
	import { game } from '$lib/game/store.svelte';
	import { LOBBY_HOSTS, RemoteError, supabase } from '$lib/remote/client';
	import {
		ACCEPT_DELAY_MS,
		DECOY_REMATCHES,
		DECOY_TTL_MS,
		type Decoy,
		EMOTE_DELAY_MS,
		EMOTE_QUIET_MS,
		IDLE_NUDGE_MS,
		IDLE_QUIT_MS,
		OFFER_DELAY_MS,
		awardEmote,
		between,
		decoyAge,
		decoyDeal,
		decoySettings,
		isDecoy,
		makeDecoy,
		offerFor,
		recallDecoy,
		rememberDecoy,
		replyEmote,
		settingsOf
	} from '$lib/remote/decoy';
	import { EMOTE_MS, type EmoteId, emoteById } from '$lib/remote/emotes';
	import { recallName, rememberName } from '$lib/remote/identity';
	import { room } from '$lib/remote/room.svelte';
	import type { EmoteEvent, RematchOffer, RoomListing, RoomSettings } from '$lib/remote/types';
	import { SITE_NAME } from '$lib/site';

	/**
	 * Live list of open public rooms that someone is actually waiting in.
	 * `public_room_listings` says a room is public and open, but a lobby whose
	 * host dropped stays open for them to come back to — so a listing is shown
	 * only while its host is present on `LOBBY_HOSTS`.
	 */
	let listings = $state<Record<string, RoomListing>>({});
	let hosted = $state<string[]>([]);
	const rooms = $derived(
		hosted
			.map((id) => listings[id])
			.filter((entry): entry is RoomListing => !!entry)
			.sort((a, b) => b.created_at.localeCompare(a.created_at))
	);
	/** Stands in while no real room is open. One per device per `DECOY_TTL_MS`, reloads included. */
	let decoy = $state<Decoy | null>(null);
	/** Rematches played against this decoy's bot. */
	let rematches = $state(0);
	const shown = $derived(rooms.length > 0 ? rooms : decoy ? [decoy.listing] : []);
	/** The disguised bot game, played here like the waiting room's so the URL stays put. */
	let decoyGame = $state(false);
	const playing = $derived(decoyGame && game.state.phase !== 'setup');
	/** Few enough real rooms that the bot is still worth offering for another category. */
	const SUGGEST_BELOW = 3;

	let loading = $state(true);
	let error = $state<string | null>(null);
	let joining = $state<string | null>(null);
	// The room a nameless player tapped, held while they're asked who they are.
	// `/online` has the only name field and it's easy to walk past on the way
	// here, at which point the server named the joiner "Player 2".
	let pending = $state<RoomListing | null>(null);
	let name = $state('');

	/** Once per visit: the list emptying and refilling shouldn't count as many sightings. */
	let suggested = false;
	function adopt(next: Decoy, count = 0) {
		decoy = next;
		rematches = count;
		rememberDecoy({ decoy: next, rematches: count });
	}

	$effect(() => {
		if (loading || error || rooms.length > 0 || decoy) return;
		const saved = recallDecoy();
		if (saved && decoyAge(saved.decoy) < DECOY_TTL_MS) adopt(saved.decoy, saved.rematches);
		else adopt(makeDecoy(Math.random, saved?.decoy));
	});

	// Swapped once it's had its minute, but never out from under a join or a game.
	$effect(() => {
		const current = decoy;
		if (!current || playing || pending || joining) return;
		const timer = setTimeout(
			() => adopt(makeDecoy(Math.random, current)),
			Math.max(0, DECOY_TTL_MS - decoyAge(current))
		);
		return () => clearTimeout(timer);
	});

	/* The bot's side of the online rematch flow, so a decoy results screen behaves like one. */
	let offer = $state<RematchOffer | null>(null);
	let botLeft = $state(false);
	/** This results screen's offer (or exit) already happened, so the bot doesn't ask twice. */
	let settled = $state(false);
	let acceptTimer: ReturnType<typeof setTimeout> | undefined;
	const atResults = $derived(playing && game.state.phase === 'results');
	const botName = $derived(game.state.players[1].name);

	$effect(() => {
		if (!atResults || settled) return;
		const timer = setTimeout(() => {
			settled = true;
			if (rematches >= DECOY_REMATCHES) botLeft = true;
			else offer = offerFor(settingsOf(game.state.config), 1);
		}, between(OFFER_DELAY_MS));
		return () => clearTimeout(timer);
	});

	/* Emotes, kept here since there's no room channel: the player's, and the bot's own. */
	let bubbles = $state<EmoteEvent[]>([]);
	let emoteKey = 0;
	const emoteTimers = new Set<ReturnType<typeof setTimeout>>();
	const emotes = $derived(
		Object.fromEntries(
			bubbles.flatMap((bubble) => {
				const emote = emoteById(bubble.emote);
				return emote ? [[bubble.seat, emote]] : [];
			})
		)
	);
	const names = $derived(game.state.players.map((player) => player.name) as string[]);

	function later(run: () => void, ms: number) {
		const timer = setTimeout(() => {
			emoteTimers.delete(timer);
			run();
		}, ms);
		emoteTimers.add(timer);
	}

	function showEmote(seat: number, emote: EmoteId) {
		const key = ++emoteKey;
		bubbles = [...bubbles.slice(-3), { key, seat, emote }];
		later(() => (bubbles = bubbles.filter((bubble) => bubble.key !== key)), EMOTE_MS);
	}

	/** When the bot last emoted (or is about to), for its quiet spell. */
	let botEmotedAt = 0;
	function botEmote(emote: EmoteId | null) {
		const now = Date.now();
		if (!emote || now - botEmotedAt < EMOTE_QUIET_MS) return;
		const delay = between(EMOTE_DELAY_MS);
		botEmotedAt = now + delay;
		later(() => showEmote(1, emote), delay);
	}

	function sendEmote(id: EmoteId) {
		showEmote(0, id);
		botEmote(replyEmote(id));
		pokes++;
	}

	/*
	 * Idling: the player's, not the bot's, so only their taps, keys and emotes
	 * restart the clock. After a minute the bot nudges with "Bid!" (not on the
	 * results sheet, where there's nothing to bid on); after three it leaves
	 * mid-draft the way a bored person would.
	 */
	let pokes = $state(0);
	/** The bot walked out mid-draft. At results, `botLeft` says it instead. */
	let botQuit = $state(false);

	$effect(() => {
		void pokes;
		if (!playing || botQuit || botLeft) return;
		const nudge = setTimeout(() => {
			if (game.state.phase === 'results') return;
			botEmotedAt = Date.now();
			showEmote(1, 'bid');
		}, IDLE_NUDGE_MS);
		const quit = setTimeout(() => {
			if (game.state.phase === 'results') {
				offer = null;
				settled = true;
				botLeft = true;
				return;
			}
			clearEmotes();
			botQuit = true;
			// A reload shouldn't bring them back to finish it.
			clearState();
		}, IDLE_QUIT_MS);
		return () => {
			clearTimeout(nudge);
			clearTimeout(quit);
		};
	});

	function clearEmotes() {
		for (const timer of emoteTimers) clearTimeout(timer);
		emoteTimers.clear();
		bubbles = [];
	}

	/** The award the bot last reacted to. Plain, so reacting doesn't re-run the effect. */
	let reacted: unknown = null;
	$effect(() => {
		const award = game.state.lastAward;
		if (!playing || !award || award === reacted) return;
		reacted = award;
		botEmote(awardEmote(award, 1));
	});

	function playAgain(settings: RoomSettings) {
		const [human, bot] = game.state.players;
		offer = null;
		settled = false;
		if (decoy) adopt(decoy, rematches + 1);
		game.dispatch(decoyDeal(settings, [human.name, bot.name]));
	}

	async function proposeRematch(settings: RoomSettings) {
		settled = true;
		offer = offerFor(settings, 0);
		clearTimeout(acceptTimer);
		acceptTimer = setTimeout(() => {
			if (rematches < DECOY_REMATCHES) return playAgain(settings);
			offer = null;
			botLeft = true;
		}, between(ACCEPT_DELAY_MS));
	}

	async function acceptRematch() {
		playAgain(settingsOf(game.state.config));
	}

	async function cancelRematch() {
		clearTimeout(acceptTimer);
		offer = null;
	}

	$effect(() => {
		if (loading || error || rooms.length >= SUGGEST_BELOW || suggested) return;
		suggested = true;
		track(botSuggestionEvent('bot_suggestion_shown', 'empty_lobby', null));
	});

	let channel: ReturnType<ReturnType<typeof supabase>['channel']> | null = null;
	/** Present ids already looked up, so a key with no listing isn't fetched every sync. */
	const looked = new Set<string>();

	const COLUMNS =
		'room_id, category_label, variant_label, budget, slots, max_players, players, created_at';

	onMount(() => {
		// A reload mid decoy game resumes it here. Any other saved game is left for
		// `/`, since hydrating it would start its bot ticking on this page.
		if (loadState()?.config.disguised) {
			// Silently, even in a fresh tab: a prompt would give the decoy away.
			game.hydrate({ ask: false });
			decoyGame = game.state.phase !== 'setup';
			const saved = recallDecoy();
			if (decoyGame && saved) {
				decoy = saved.decoy;
				rematches = saved.rematches;
			}
		}
		try {
			const client = supabase();
			channel = client
				.channel(LOBBY_HOSTS)
				.on('presence', { event: 'sync' }, () => {
					const ids = Object.keys(channel?.presenceState() ?? {});
					hosted = ids;
					void lookUp(ids.filter((id) => !looked.has(id)));
				})
				.on(
					'postgres_changes',
					{ event: '*', schema: 'public', table: 'public_room_listings' },
					(payload) => {
						if (payload.eventType === 'DELETE') {
							const gone = (payload.old as { room_id?: string }).room_id;
							if (gone) delete listings[gone];
							return;
						}
						const row = payload.new as RoomListing;
						listings[row.room_id] = row;
					}
				)
				.subscribe((status) => {
					if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
						error = 'Could not load rooms';
						loading = false;
					}
				});
		} catch (failure) {
			error = failure instanceof Error ? failure.message : 'Could not load rooms';
			loading = false;
		}
	});

	/** Fetches the listings for hosts we haven't seen yet. The first sync ends "Looking…". */
	async function lookUp(ids: string[]): Promise<void> {
		try {
			if (ids.length > 0) {
				for (const id of ids) looked.add(id);
				const { data, error: failure } = await supabase()
					.from('public_room_listings')
					.select(COLUMNS)
					.in('room_id', ids);
				if (failure) throw new Error(failure.message);
				for (const row of (data ?? []) as RoomListing[]) listings[row.room_id] = row;
			}
		} catch (failure) {
			for (const id of ids) looked.delete(id);
			error = failure instanceof Error ? failure.message : 'Could not load rooms';
		} finally {
			loading = false;
		}
	}

	onDestroy(() => {
		clearTimeout(acceptTimer);
		clearEmotes();
		if (channel) void supabase().removeChannel(channel);
	});

	/** A remembered name goes straight in; anyone else gets asked for one first. */
	function start(listing: RoomListing) {
		if (joining) return;
		const remembered = recallName();
		if (!remembered) {
			name = '';
			error = null;
			pending = listing;
			return;
		}
		void join(listing, remembered);
	}

	function confirmName() {
		const listing = pending;
		if (!listing) return;
		void join(listing, name.trim());
	}

	/** Back to the list, where somebody new replaces the room just played. */
	function leaveDecoy() {
		clearTimeout(acceptTimer);
		clearEmotes();
		decoyGame = false;
		offer = null;
		botLeft = false;
		botQuit = false;
		settled = false;
		if (game.state.phase !== 'setup') game.dispatch({ type: 'reset' });
		adopt(makeDecoy(Math.random, decoy));
	}

	function cancel() {
		pending = null;
		error = null;
	}

	async function join(listing: RoomListing, playerName: string) {
		if (joining) return;
		joining = listing.room_id;
		error = null;
		if (decoy && isDecoy(listing)) {
			rememberName(playerName);
			track(botSuggestionEvent('bot_suggestion_clicked', 'decoy_room', decoy.categoryId));
			// A real join takes a beat; an instant one would read as a trick.
			await new Promise((resolve) => setTimeout(resolve, 700));
			adopt(decoy);
			game.dispatch(decoyDeal(decoySettings(decoy), [playerName, decoy.hostName]));
			decoyGame = true;
			pending = null;
			joining = null;
			return;
		}
		try {
			rememberName(playerName);
			const { roomId } = await room.join({ roomId: listing.room_id, name: playerName });
			await goto(`/online/room?id=${roomId}`);
		} catch (failure) {
			// Losing a race for the last seat is ordinary. The prompt stays up with
			// the name still typed, so it costs a tap rather than the whole flow.
			error =
				failure instanceof RemoteError && failure.code === 'room_full'
					? 'Someone took that seat first.'
					: failure instanceof RemoteError
						? failure.message
						: 'Could not join that room';
			joining = null;
		}
	}
</script>

<svelte:window onpointerdown={() => playing && pokes++} onkeydown={() => playing && pokes++} />

<svelte:head><title>Open rooms — {SITE_NAME}</title></svelte:head>

{#if playing && botQuit}
	<!-- Same as a real room an opponent walks out of: no winner for a draft that didn't finish. -->
	<div class="shell centre">
		<span class="eyebrow">Game over</span>
		<p class="status status--bad" role="alert">{botName} left the draft.</p>
		<button class="btn btn--hot" type="button" onclick={leaveDecoy}>Back to rooms</button>
		<FeedbackPrompt />
	</div>
{:else if playing}
	<!-- No `view`: the decoy game lives in the local store. -->
	{#if game.state.phase === 'results'}
		<ResultsScreen onLeave={leaveDecoy} leaveLabel="Back to rooms">
			{#snippet rematch()}
				<RematchPanel
					{offer}
					seat={0}
					opponentName={botName}
					opponentGone={botLeft}
					config={game.state.config}
					onPropose={proposeRematch}
					onAccept={acceptRematch}
					onCancel={cancelRematch}
				/>
			{/snippet}
		</ResultsScreen>
	{:else}
		<BidScreen seat={0} onQuit={leaveDecoy} {emotes}>
			{#snippet toolbar()}
				<EmoteBar seat={0} {names} {bubbles} send={sendEmote} />
			{/snippet}
		</BidScreen>
	{/if}
{:else if pending}
	<!-- Nothing is claimed on the server until this is submitted, so the seat is
	     still up for grabs and a lost race lands back here. -->
	<NamePrompt
		eyebrow={`${pending.category_label}${pending.variant_label ? ` · ${pending.variant_label}` : ''} · $${pending.budget} · ${pending.slots} slots`}
		heading="Who's playing?"
		sub="Your opponent sees this name on the board."
		bind:value={name}
		busy={joining !== null}
		{error}
		submit={confirmName}
	>
		{#snippet secondary()}
			<button class="btn btn--ghost" type="button" onclick={cancel} disabled={joining !== null}>
				Back to rooms
			</button>
		{/snippet}
	</NamePrompt>
{:else}
	<div class="shell browse">
		<header class="head">
			<a class="back" href="/online">Back</a>
			<h1>Open rooms</h1>
			<p class="sub">Updates as rooms open and fill.</p>
		</header>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		{#if loading}
			<p class="empty">Looking…</p>
		{:else}
			<ul class="list">
				{#each shown as listing (listing.room_id)}
					<!-- Test hook: the visible row shows only category and budget, so a
					     spec watching one room drop off has nothing else to grab. -->
					<li data-room-id={listing.room_id}>
						<button
							class="row"
							type="button"
							disabled={joining !== null}
							onclick={() => start(listing)}
						>
							<span class="row__cat">
								{listing.category_label}{listing.variant_label ? ` · ${listing.variant_label}` : ''}
							</span>
							<span class="row__meta">
								${listing.budget} · {listing.slots} slots{#if (listing.max_players ?? 2) > 2}
									· {listing.players ?? 1}/{listing.max_players} players{/if}
							</span>
							<span class="row__go">{joining === listing.room_id ? '…' : 'Join'}</span>
						</button>
					</li>
				{/each}
			</ul>
			{#if rooms.length < SUGGEST_BELOW}
				<p class="empty">Want a different category? Play the bot, or start a room and share the link.</p>
				<a
					class="btn btn--hot"
					href="/?opponent=bot"
					onclick={() => track(botSuggestionEvent('bot_suggestion_clicked', 'empty_lobby', null))}
				>Play vs. the bot</a>
				<a class="btn btn--ghost" href="/online">Start a room</a>
			{/if}
		{/if}
	</div>
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
	}

	.status--bad {
		padding: 0.6rem 0.7rem;
		background: var(--red);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.browse {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.head {
		padding-top: 1.1rem;
	}

	.back {
		display: inline-block;
		margin-bottom: 0.6rem;
		padding: 0.25rem 0.5rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		box-shadow: 3px 3px 0 var(--ink);
		font-size: 0.62rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink);
		text-decoration: none;
	}

	.head h1 {
		font-size: 2rem;
	}

	.sub {
		margin: 0.35rem 0 0;
		font-size: 0.85rem;
		font-weight: 700;
	}

	.error {
		margin: 0;
		padding: 0.6rem 0.7rem;
		background: var(--red);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 0.82rem;
		font-weight: 800;
	}

	.empty {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--ink-muted);
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas: 'cat go' 'meta go';
		align-items: center;
		gap: 0.1rem 0.6rem;
		width: 100%;
		padding: 0.6rem 0.7rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		text-align: left;
	}

	.row:active:not(:disabled) {
		transform: translate(4px, 4px);
		box-shadow: none;
	}

	.row:disabled {
		opacity: 0.5;
	}

	.row__cat {
		grid-area: cat;
		font-size: 0.9rem;
		font-weight: 900;
		text-transform: uppercase;
		line-height: 1.15;
	}

	.row__meta {
		grid-area: meta;
		font-size: 0.7rem;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.row__go {
		grid-area: go;
		padding: 0.3rem 0.6rem;
		background: var(--green);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.7rem;
		font-weight: 900;
		text-transform: uppercase;
	}
</style>
