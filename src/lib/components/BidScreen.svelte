<script lang="ts">
	import AmountDial from './AmountDial.svelte';
	import PlayerStatus from './PlayerStatus.svelte';
	import {
		MIN_BID,
		canBid,
		canBuy,
		canReceive,
		currentItem,
		freeRecipient,
		itemMode,
		itemNumber,
		maxBid,
		minBid,
		other,
		rosterFull,
		solventPlayer
	} from '$lib/game/engine';
	import { game } from '$lib/game/store.svelte';
	import type { Action, GameState, PlayerId } from '$lib/game/types';

	interface Props {
		/**
		 * Omitted for local play, where the in-memory store is the truth. Remote
		 * play passes the server's state so both modes share this screen rather
		 * than growing a second copy of it.
		 */
		view?: GameState;
		/** Where actions go. Defaults to applying them locally. */
		dispatch?: (action: Action) => void;
		/** The seat this device controls, or null when one device drives both. */
		seat?: 0 | 1 | null;
		/**
		 * What quitting means here.
		 *
		 * Locally it means `reset` — drop back to the setup screen, which is the
		 * default below. Remotely it cannot: `reset` is a legal engine action, so
		 * sending it through the remote transport wrote `initialState()` to the
		 * server as the authoritative state. That left the quitter on the same page
		 * staring at an empty deck, and silently wiped the opponent's live game with
		 * them. Remote play passes a handler that closes the room and navigates out.
		 */
		onQuit?: () => void;
	}

	let { view, dispatch, seat = null, onQuit }: Props = $props();

	const s = $derived(view ?? game.state);
	/*
	 * Wrapped rather than passed by reference: `game.dispatch` is a class method
	 * and loses its receiver when detached. The prop is named `view`, not `state`,
	 * because a local binding called `state` shadows the `$state` rune and breaks
	 * every `$state(...)` below it.
	 */
	const send = (action: Action) => (dispatch ? dispatch(action) : game.dispatch(action));

	/** In remote play a device may only act for its own seat. */
	const controls = (player: PlayerId) => seat === null || seat === player;
	const item = $derived(currentItem(s));
	const mode = $derived(itemMode(s));
	const facedown = $derived(s.phase === 'reveal');
	const award = $derived(s.phase === 'award' ? s.lastAward : null);
	const lastItem = $derived(s.index + 1 >= s.deck.length);

	/**
	 * Slots the winner can still choose from. Any player fits any slot, so this is
	 * just "not already taken" — a centre can start at point guard.
	 */
	const assignable = $derived.by(() => {
		if (!award || !s.config.positional) return [];
		const taken = new Set(
			s.players[award.playerId].roster
				.filter((entry) => entry.item.id !== award.item.id)
				.map((entry) => entry.slotId)
		);
		return s.config.roster.filter((slot) => !taken.has(slot.id));
	});

	/** Lowest legal amount for the dial, given who's acting. */
	const floor = $derived(mode === 'solo' ? MIN_BID : minBid(s));
	const ceiling = $derived(
		mode === 'solo' ? maxBid(s, solventPlayer(s)) : Math.max(maxBid(s, 0), maxBid(s, 1), floor)
	);

	/** Dial position. Null means "sitting at the minimum". */
	let override = $state<number | null>(null);
	const amount = $derived(Math.min(Math.max(override ?? floor, floor), Math.max(floor, ceiling)));

	$effect(() => {
		// A new item or a fresh standing bid snaps the dial back to the minimum.
		void s.index;
		void s.bid?.amount;
		void mode;
		override = null;
	});

	let confirmQuit = $state(false);

	const nameOf = (id: PlayerId) => s.players[id].name;

	function bidLabel(id: PlayerId): string {
		if (s.bid?.holder === id) return `holding $${s.bid.amount}`;
		if (amount > s.players[id].money) return `only $${s.players[id].money} left`;
		return `bid $${amount}`;
	}

	/** Why the uncontested player is the only one who can take this. */
	function forcedReason(shutOut: PlayerId): string {
		if (rosterFull(s, shutOut)) return `${nameOf(shutOut)}'s roster is full.`;
		return `${nameOf(shutOut)} can't take this one.`;
	}
</script>

<div class="shell board">
	<header class="bar">
		<div class="bar__meta">
			<span class="eyebrow">
				{s.config.categoryLabel}{s.config.variantLabel ? ` · ${s.config.variantLabel}` : ''}
			</span>
			<span class="count">Item {itemNumber(s)} <i>of {s.deck.length}</i></span>
		</div>
		<button
			class="quit"
			type="button"
			onclick={() => {
				if (!confirmQuit) confirmQuit = true;
				else if (onQuit) onQuit();
				else send({ type: 'reset' });
			}}
			onblur={() => (confirmQuit = false)}
		>
			{confirmQuit ? 'End it?' : 'Quit'}
		</button>
	</header>

	<div class="track" role="img" aria-label="Draft progress">
		{#each s.deck as entry, i (entry.id)}
			<span class="tick" class:done={i < s.index} class:live={i === s.index}></span>
		{/each}
	</div>

	<div class="players">
		{#each [0, 1] as const as id (id)}
			<PlayerStatus
				player={s.players[id]}
				roster={s.config.roster}
				positional={s.config.positional}
				leading={s.bid?.holder === id}
			/>
		{/each}
	</div>

	{#if facedown}
		<button class="item item--back" type="button" onclick={() => send({ type: 'reveal' })}>
			<span class="back__mark">?</span>
			<span class="back__cue">Tap to reveal</span>
		</button>
	{:else if item}
		<div class="item item--face" class:item--won={!!award}>
			{#if item.position}
				<span class="item__tag item__tag--pos">{item.position}</span>
			{:else}
				<span class="item__tag">On the block</span>
			{/if}
			<h2 class="item__name">{item.name}</h2>
			{#if item.note}
				<p class="item__note">{item.note}</p>
			{/if}
		</div>
	{/if}

	{#if award}
		<div class="resolve">
			<div class="stamp" style:--accent={award.playerId === 0 ? 'var(--p1)' : 'var(--p2)'}>
				<span class="stamp__price">{award.free ? 'Free' : `$${award.price}`}</span>
				<span class="stamp__to">
					to {nameOf(award.playerId)}{s.config.positional ? ` · ${award.slotLabel}` : ''}
				</span>
			</div>
			{#if award.declined}
				<p class="note">{nameOf(other(award.playerId))} passed, so it's a freebie.</p>
			{/if}

			{#if assignable.length > 1}
				<!-- Slot labels are a suggestion; put them anywhere that's open. -->
				<div class="assign">
					<span class="assign__label">Start {nameOf(award.playerId)}'s pick at</span>
					<div class="assign__row">
						{#each assignable as slot (slot.id)}
							<button
								class="assign__slot"
								class:on={slot.id === award.slotId}
								type="button"
								onclick={() => send({ type: 'assign', slotId: slot.id })}
							>
								{slot.label}
							</button>
						{/each}
					</div>
				</div>
			{/if}
			<button class="btn btn--hot" type="button" onclick={() => send({ type: 'next' })}>
				{lastItem ? 'See the results' : 'Next item'}
			</button>
		</div>
	{:else if s.phase === 'resolve'}
		{#if mode === 'contest'}
			<div class="resolve">
				<div class="standing" class:standing--idle={!s.bid}>
					{#if s.bid}
						<span class="standing__amount">${s.bid.amount}</span>
						<span class="standing__who">{nameOf(s.bid.holder)} leads</span>
					{:else}
						<span class="standing__amount">$&mdash;</span>
						<span class="standing__who">No bids · anyone can open</span>
					{/if}
				</div>

				<AmountDial
					value={amount}
					min={floor}
					max={ceiling}
					label={s.bid ? 'raise to' : 'open at'}
					onchange={(next) => (override = next)}
				/>

				<div class="duel">
					{#each [0, 1] as const as id (id)}
						<button
							class="btn duel__btn"
							class:duel__btn--holding={s.bid?.holder === id}
							style:--accent={id === 0 ? 'var(--p1)' : 'var(--p2)'}
							type="button"
							disabled={!canBid(s, id, amount) || !controls(id)}
							onclick={() => send({ type: 'bid', player: id, amount })}
						>
							{nameOf(id)}
							<span class="btn__sub">{bidLabel(id)}</span>
						</button>
					{/each}
				</div>

				<button
					class="btn btn--hot"
					type="button"
					disabled={!s.bid}
					onclick={() => send({ type: 'sold' })}
				>
					{s.bid ? `Sold to ${nameOf(s.bid.holder)}` : 'Nobody has opened'}
					<span class="btn__sub">
						{s.bid ? 'nobody else is raising' : 'every item gets claimed — someone has to bid'}
					</span>
				</button>
			</div>
		{:else if mode === 'solo'}
			{@const seller = solventPlayer(s)}
			{@const beggar = other(seller)}
			<div class="resolve">
				<p class="banner">
					<b>{nameOf(beggar)}</b> is out of money. <b>{nameOf(seller)}</b> names the price — there's
					nobody left to outbid.
				</p>

				<AmountDial
					value={amount}
					min={MIN_BID}
					max={maxBid(s, seller)}
					label="name your price"
					onchange={(next) => (override = next)}
				/>

				<button
					class="btn btn--hot"
					type="button"
					disabled={!canBuy(s, seller, amount)}
					onclick={() => send({ type: 'buy', player: seller, amount })}
				>
					{nameOf(seller)} takes it for ${amount}
				</button>

				<button
					class="btn btn--ghost"
					type="button"
					onclick={() => send({ type: 'decline', player: seller })}
				>
					Pass
					<span class="btn__sub">{nameOf(beggar)} gets it free</span>
				</button>
			</div>
		{:else}
			{@const heir = freeRecipient(s)}
			<div class="resolve">
				<p class="banner">
					{#if mode === 'alternate'}
						Both wallets are empty. The rest go out free, alternating.
					{:else}
						{forcedReason(other(heir))} Nobody to bid against, so it's
						<b>{nameOf(heir)}</b>'s for free.
					{/if}
				</p>
				<button
					class="btn btn--yellow"
					type="button"
					disabled={!item || !canReceive(s, heir, item)}
					onclick={() => send({ type: 'claim' })}
				>
					{nameOf(heir)} takes it
					<span class="btn__sub">free</span>
				</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.board {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		min-height: 100dvh;
	}

	.bar {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		padding-top: 0.3rem;
	}

	.bar__meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.count {
		font-size: 1.05rem;
		font-weight: 900;
		letter-spacing: -0.02em;
		text-transform: uppercase;
	}

	.count i {
		font-style: normal;
		color: var(--ink-muted);
	}

	.quit {
		flex: none;
		padding: 0.3rem 0.5rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		box-shadow: 3px 3px 0 var(--ink);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.quit:active {
		background: var(--ink);
		color: var(--cream);
		transform: translate(3px, 3px);
		box-shadow: none;
	}

	/* Hard blocks, not a soft progress bar. */
	.track {
		display: flex;
		gap: 3px;
	}

	.tick {
		flex: 1;
		height: 10px;
		background: var(--white);
		border: 2px solid var(--ink);
	}

	.tick.done {
		background: var(--ink);
	}

	.tick.live {
		background: var(--red);
	}

	.players {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
		margin-bottom: 0.2rem;
	}

	/* ---------- the item card ---------- */

	.item {
		display: flex;
		/* Grows into whatever the controls don't use, so the card carries the screen. */
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		width: 100%;
		min-height: 11rem;
		padding: 1.3rem 1rem;
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-lg);
		text-align: center;
	}

	.item--back {
		background: var(--violet);
		transform: rotate(-1deg);
	}

	.item--back:active {
		background: var(--ink);
		color: var(--cream);
		transform: rotate(-1deg) translate(8px, 8px);
		box-shadow: none;
	}

	/* The card is a full-bleed tap target, so the mark scales up to fill it
	   rather than floating in dead violet. */
	.back__mark {
		font-size: clamp(4rem, 34vw, 10rem);
		font-weight: 900;
		line-height: 0.85;
	}

	.back__cue {
		font-size: 0.72rem;
		font-weight: 900;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.item--face {
		background: var(--white);
		transform: rotate(1deg);
		animation: slam-card 90ms linear;
	}

	/* Steps back so the sold stamp owns the screen, but still absorbs the slack
	   above it rather than leaving a hole. */
	.item--won {
		min-height: 7.5rem;
		box-shadow: var(--shadow-sm);
	}

	.item__tag {
		padding: 0.1rem 0.3rem;
		background: var(--yellow);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.56rem;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	/* The position is load-bearing information, so it gets more weight. */
	.item__tag--pos {
		padding: 0.15rem 0.5rem;
		background: var(--red);
		font-size: 0.95rem;
		letter-spacing: 0.06em;
	}

	.item__name {
		font-size: clamp(1.55rem, 8.5vw, 2.4rem);
		line-height: 0.98;
		text-wrap: balance;
	}

	.item__note {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	/* ---------- controls ---------- */

	/* `auto` is a no-op while the card is flex:1, and pins the controls to the
	   bottom once the card steps back during the award. */
	.resolve {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin-top: auto;
		padding-top: 0.4rem;
	}

	.standing {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		/* Money on the table, so --money rather than a player's colour. */
		background: var(--money);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.standing--idle {
		background: var(--white);
	}

	.standing__amount {
		font-size: 1.8rem;
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.05em;
		font-variant-numeric: tabular-nums;
	}

	.standing__who {
		font-size: 0.64rem;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.duel {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.duel__btn {
		background: var(--accent);
		font-size: 0.92rem;
	}

	/*
	 * The player holding the bid can't raise themselves, so the button is
	 * disabled — but they're winning, not unavailable. Invert it instead of
	 * letting the washed-out disabled style imply something is wrong.
	 */
	.duel__btn--holding:disabled {
		background: var(--ink);
		color: var(--cream);
		opacity: 1;
	}

	.banner {
		margin: 0;
		padding: 0.65rem 0.7rem;
		background: var(--violet);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 0.82rem;
		font-weight: 700;
		line-height: 1.3;
	}

	.banner b {
		font-weight: 900;
		text-transform: uppercase;
	}

	.note {
		margin: 0;
		text-align: center;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
	}

	/* ---------- slot picker ---------- */

	.assign {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.5rem 0.55rem 0.55rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.assign__label {
		font-size: 0.58rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.assign__row {
		display: flex;
		gap: 0.3rem;
	}

	.assign__slot {
		flex: 1;
		padding: 0.4rem 0.1rem;
		background: var(--cream);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.78rem;
		text-transform: uppercase;
	}

	.assign__slot.on {
		background: var(--ink);
		color: var(--cream);
	}

	.assign__slot:active:not(.on) {
		background: var(--yellow);
	}

	/* ---------- sold stamp ---------- */

	.stamp {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.05rem;
		padding: 0.8rem;
		background: var(--accent);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-lg);
		transform: rotate(-2deg);
		animation: slam-stamp 110ms linear;
	}

	.stamp__price {
		font-size: 2.8rem;
		font-weight: 900;
		line-height: 0.95;
		letter-spacing: -0.06em;
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
	}

	.stamp__to {
		font-size: 0.74rem;
		font-weight: 900;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	/* Mechanical, linear — no eased overshoot. Each keeps its own tilt so the
	   animation can't drop the rotation mid-flight. */
	@keyframes slam-card {
		from {
			transform: rotate(1deg) scale(1.07);
		}
	}

	@keyframes slam-stamp {
		from {
			transform: rotate(-2deg) scale(1.12);
		}
	}
</style>
