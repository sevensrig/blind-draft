<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { track } from '$lib/analytics';
	import { botSuggestionEvent } from '$lib/analytics/events';
	import NamePrompt from '$lib/components/NamePrompt.svelte';
	import { LOBBY_HOSTS, RemoteError, supabase } from '$lib/remote/client';
	import { recallName, rememberName } from '$lib/remote/identity';
	import { room } from '$lib/remote/room.svelte';
	import type { RoomListing } from '$lib/remote/types';
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
	$effect(() => {
		if (loading || error || rooms.length > 0 || suggested) return;
		suggested = true;
		track(botSuggestionEvent('bot_suggestion_shown', 'empty_lobby', null));
	});

	let channel: ReturnType<ReturnType<typeof supabase>['channel']> | null = null;
	/** Present ids already looked up, so a key with no listing isn't fetched every sync. */
	const looked = new Set<string>();

	const COLUMNS = 'room_id, category_label, variant_label, budget, slots, created_at';

	onMount(() => {
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

	function cancel() {
		pending = null;
		error = null;
	}

	async function join(listing: RoomListing, playerName: string) {
		if (joining) return;
		joining = listing.room_id;
		error = null;
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

<svelte:head><title>Open rooms — {SITE_NAME}</title></svelte:head>

{#if pending}
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
		{:else if rooms.length === 0}
			<p class="empty">Nothing open right now. Play the bot, or start a room and share the link.</p>
			<a
				class="btn btn--hot"
				href="/?opponent=bot"
				onclick={() => track(botSuggestionEvent('bot_suggestion_clicked', 'empty_lobby', null))}
			>Play vs. the bot</a>
			<a class="btn btn--ghost" href="/online">Start a room</a>
		{:else}
			<ul class="list">
				{#each rooms as listing (listing.room_id)}
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
							<span class="row__meta">${listing.budget} · {listing.slots} slots</span>
							<span class="row__go">{joining === listing.room_id ? '…' : 'Join'}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<style>
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
