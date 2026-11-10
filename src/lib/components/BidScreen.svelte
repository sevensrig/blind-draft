<script lang="ts">
	import type { Snippet } from 'svelte';
	import AmountDial from './AmountDial.svelte';
	import PlayerStatus from './PlayerStatus.svelte';
	import {
		MIN_BID,
		canBid,
		canBuy,
		canReceive,
		canSell,
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
	import type { IconName } from '$lib/icons';

	interface Props {
		/** Omitted for local play, where the store is the truth. Remote play passes
		 * the server's state, so both modes share this screen. */
		view?: GameState;
		/** Where actions go. Defaults to applying them locally. */
		dispatch?: (action: Action) => void;
		/** The seat this device controls, or null when one device drives both. */
		seat?: 0 | 1 | null;
		/**
		 * Locally quitting means `reset`, the default below. Remotely it cannot:
		 * `reset` is a legal engine action, so it wrote `initialState()` to the
		 * server and wiped the opponent's live game too. Remote play passes a
		 * handler that closes the room and navigates out.
		 */
		onQuit?: () => void;
		/** Online only: each player's emote while it's showing. */
		emotes?: Partial<Record<PlayerId, { icon: IconName; label: string }>>;
		/** Online only: the emote buttons, beside Quit so they never sit over the controls. */
		toolbar?: Snippet;
		/**
		 * Online only: the seat turning the card over, while the server deals the
		 * face. The card starts its flip now, so the wait reads as the animation.
		 */
		revealing?: PlayerId | null;
	}

	let {
		view,
		dispatch,
		seat = null,
		onQuit,
		emotes = {},
		toolbar,
		revealing = null
	}: Props = $props();

	const s = $derived(view ?? game.state);
	// Wrapped, not passed by reference: `game.dispatch` loses its receiver when
	// detached. And the prop is `view`, not `state` — that name shadows the rune.
	const send = (action: Action) => (dispatch ? dispatch(action) : game.dispatch(action));

	/** In remote play a device may only act for its own seat. */
	const controls = (player: PlayerId) => seat === null || seat === player;
	const item = $derived(currentItem(s));
	const mode = $derived(itemMode(s));
	const facedown = $derived(s.phase === 'reveal');
	const revealCue = $derived(
		revealing === null
			? 'Tap to reveal'
			: revealing === seat
				? 'Revealing…'
				: `${s.players[revealing].name} is revealing…`
	);
	const award = $derived(s.phase === 'award' ? s.lastAward : null);
	const lastItem = $derived(s.index + 1 >= s.deck.length);

	/** Any player fits any slot, so this is just "not already taken". */
	const assignable = $derived.by(() => {
		if (!award || !s.config.positional || !controls(award.playerId)) return [];
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

	let board: HTMLDivElement;
	/**
	 * Moving the dial doesn't bid, which new players miss: give the live bid
	 * buttons a quick rattle so the next tap is obvious.
	 */
	function setAmount(next: number) {
		override = next;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		for (const button of board.querySelectorAll<HTMLButtonElement>('[data-rattle]:not(:disabled)')) {
			button.animate(
				[
					{ rotate: '0deg', scale: '1' },
					{ rotate: '-2.5deg', scale: '1.05', offset: 0.2 },
					{ rotate: '2.5deg', offset: 0.4 },
					{ rotate: '-1.5deg', offset: 0.6 },
					{ rotate: '1deg', scale: '1.02', offset: 0.8 },
					{ rotate: '0deg', scale: '1' }
				],
				{ duration: 360, easing: 'ease-out' }
			);
		}
	}
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

	/** Colour says whose button it is, so the label is only the action. */
	function bidLabel(id: PlayerId): string {
		if (s.bid?.holder === id) return `Winning at $${s.bid.amount}`;
		if (amount > s.players[id].money) return `Only $${s.players[id].money} left`;
		return `Bid $${amount}`;
	}

	/** With one seat on this device, the button also says whose move it is. */
	function bidHint(id: PlayerId): string | null {
		if (seat === null || !s.bid) return null;
		return s.bid.holder === id ? `${nameOf(other(id))}'s move` : 'your move';
	}

	/** Online and against the bot, only this device's own button is shown. */
	const bidders = $derived<PlayerId[]>(seat === null ? [0, 1] : [seat]);

	/**
	 * Whoever isn't holding the bid — accepting it is giving up, so it can't be the
	 * leader's call. With no bid the button is dead, so seat 0 is a placeholder.
	 */
	const conceder = $derived(s.bid ? other(s.bid.holder) : 0);
	/** True when this device is the one that has to let the item go. */
	const yours = $derived(controls(conceder));

	function soldLabel(): string {
		if (!s.bid) return 'Nobody has opened';
		if (!yours) return `Waiting on ${nameOf(conceder)}`;
		return `Let ${nameOf(s.bid.holder)} have it`;
	}

	function soldHint(): string {
		if (!s.bid) return 'someone has to bid first';
		if (!yours) return 'only they can hand it over';
		// One device speaks for both seats, so nobody in particular is conceding.
		return seat === null ? 'nobody else is raising' : 'stop raising and hand it over';
	}

	/** Why the uncontested player is the only one who can take this. */
	function forcedReason(shutOut: PlayerId): string {
		if (rosterFull(s, shutOut)) return `${nameOf(shutOut)}'s roster is full.`;
		return `${nameOf(shutOut)} can't take this one.`;
	}
</script>

<div class="shell board" bind:this={board}>
	<header class="bar">
		<div class="bar__meta">
			<span class="eyebrow">
				{s.config.categoryLabel}{s.config.variantLabel ? ` · ${s.config.variantLabel}` : ''}
			</span>
			<span class="count">Item {itemNumber(s)} <i>of {s.deck.length}</i></span>
		</div>
		<div class="bar__end">
			{@render toolbar?.()}
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
		</div>
	</header>

	<div class="track" data-tour="track" role="img" aria-label="Draft progress">
		{#each s.deck as entry, i (entry.id)}
			<span class="tick" class:done={i < s.index} class:live={i === s.index}></span>
		{/each}
	</div>

	<div class="players" data-tour="players">
		{#each [0, 1] as const as id (id)}
			<PlayerStatus
				player={s.players[id]}
				roster={s.config.roster}
				positional={s.config.positional}
				leading={s.bid?.holder === id}
				emote={emotes[id]}
			/>
		{/each}
	</div>

	{#if facedown}
		<button
			class="item item--back"
			class:item--turning={revealing !== null}
			data-tour="card"
			type="button"
			aria-busy={revealing !== null}
			onclick={() => send({ type: 'reveal' })}
		>
			<span class="back__mark">?</span>
			<span class="back__cue">{revealCue}</span>
		</button>
	{:else if item}
		<div class="item item--face" data-tour="card" class:item--won={!!award}>
			{#if item.position}
				<span class="item__tag item__tag--pos">{item.position}</span>
			{:else}
				<span class="item__tag">On the block</span>
			{/if}
			<h2 class="item__name">{item.name}</h2>
			{#if item.note}
				<p class="item__note">{item.note}</p>
			{/if}
			{#if s.phase === 'resolve' && mode === 'contest'}
				<!-- The price lives on the card so the controls below are only controls. -->
				{#if s.bid}
					<!-- Keyed so every new bid re-mounts, and slams down again. -->
					{#key `${s.bid.holder}:${s.bid.amount}`}
						<div
							class="price"
							data-tour="standing"
							style:--accent={s.bid.holder === 0 ? 'var(--p1)' : 'var(--p2)'}
						>
							<span class="price__amount">${s.bid.amount}</span>
							<span class="price__who">{nameOf(s.bid.holder)} leads</span>
						</div>
					{/key}
				{:else}
					<div class="price price--idle" data-tour="standing">
						<span class="price__who">No bids · anyone can open</span>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	{#if award}
		<div class="resolve">
			<div class="stamp" data-tour="stamp" style:--accent={award.playerId === 0 ? 'var(--p1)' : 'var(--p2)'}>
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
			<button class="btn btn--hot" data-tour="next" type="button" onclick={() => send({ type: 'next' })}>
				{lastItem ? 'See the results' : 'Next item'}
			</button>
		</div>
	{:else if s.phase === 'resolve'}
		{#if mode === 'contest'}
			<div class="resolve">
				<AmountDial
					value={amount}
					min={floor}
					max={ceiling}
					label={s.bid ? 'raise to' : 'open at'}
					onchange={setAmount}
				/>

				<div class="duel" class:duel--solo={bidders.length === 1}>
					{#each bidders as id (id)}
						{@const hint = bidHint(id)}
						<button
							class="btn duel__btn"
							data-rattle
							class:duel__btn--holding={s.bid?.holder === id}
							data-tour="bid-{id}"
							style:--accent={id === 0 ? 'var(--p1)' : 'var(--p2)'}
							type="button"
							aria-label="{nameOf(id)}: {bidLabel(id)}{hint ? `, ${hint}` : ''}"
							disabled={!canBid(s, id, amount) || !controls(id)}
							onclick={() => send({ type: 'bid', player: id, amount })}
						>
							{bidLabel(id)}
							{#if hint}<span class="btn__sub">{hint}</span>{/if}
						</button>
					{/each}
				</div>

				<button
					class="btn btn--hot"
					class:sold--waiting={!!s.bid && !yours}
					data-tour="sold"
					type="button"
					disabled={!canSell(s, conceder) || !yours}
					onclick={() => send({ type: 'sold', player: conceder })}
				>
					{soldLabel()}
					<span class="btn__sub">{soldHint()}</span>
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
					onchange={setAmount}
				/>

				<button
					class="btn btn--hot"
					data-rattle
					type="button"
					disabled={!canBuy(s, seller, amount) || !controls(seller)}
					onclick={() => send({ type: 'buy', player: seller, amount })}
				>
					{nameOf(seller)} takes it for ${amount}
				</button>

				<button
					class="btn btn--ghost"
					type="button"
					disabled={!controls(seller)}
					onclick={() => send({ type: 'decline', player: seller })}
				>
					Pass
					<span class="btn__sub">{nameOf(beggar)} gets it free</span>
				</button>
			</div>
		{:else}
			{@const heir = freeRecipient(s)}
			<div class="resolve">
				<p class="banner" data-tour="banner">
					{#if mode === 'alternate'}
						Both wallets are empty. The rest go out free, alternating.
					{:else}
						{forcedReason(other(heir))} Nobody to bid against, so it's
						<b>{nameOf(heir)}</b>'s for free.
					{/if}
				</p>
				<button
					class="btn btn--yellow"
					data-tour="claim"
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
		min-width: 0;
	}

	/* One line, so the online emote buttons don't stretch the header on a small phone. */
	.bar__meta .eyebrow {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.count {
		font-size: clamp(0.9rem, 4.6vw, 1.05rem);
		white-space: nowrap;
		font-weight: 900;
		letter-spacing: -0.02em;
		text-transform: uppercase;
	}

	.count i {
		font-style: normal;
		color: var(--ink-muted);
	}

	.bar__end {
		display: flex;
		flex: none;
		gap: clamp(0.3rem, 1.5vw, 0.5rem);
		align-items: center;
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
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
		margin-bottom: 0.2rem;
	}

	/* ---------- the item card ---------- */

	.item {
		display: flex;
		/* Grows into whatever the controls don't use. */
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

	/* Full-bleed tap target, so the mark scales up rather than floating. */
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

	/*
	 * Picked up and starting to turn while the server deals the face. It never
	 * gets past the edge on its own: the face arriving is what finishes the flip.
	 */
	.item--turning {
		animation: card-turning 420ms ease-in-out infinite alternate;
	}

	/* Swings in from edge-on, so it reads as the back's turn carrying through. */
	.item--face {
		background: var(--white);
		transform: rotate(1deg);
		animation: card-flip 240ms cubic-bezier(0.2, 0.8, 0.3, 1.15);
	}

	/* Steps back so the sold stamp owns the screen, without leaving a hole. */
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

	/* The leader's stamp on the card, in their colour, slammed down on every bid. */
	.price {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.7rem;
		padding: 0.3rem 0.4rem 0.3rem 0.6rem;
		background: var(--accent);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		animation: price-slam 420ms linear;
	}

	.price--idle {
		padding: 0.35rem 0.6rem;
		background: var(--cream);
		box-shadow: none;
		animation: none;
	}

	.price__amount {
		font-size: 2rem;
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.05em;
		font-variant-numeric: tabular-nums;
	}

	.price__who {
		padding: 0.15rem 0.35rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.64rem;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.price--idle .price__who {
		padding: 0;
		border: 0;
	}

	/* ---------- controls ---------- */

	/* `auto` is a no-op while the card is flex:1, and pins the controls down
	   once the card steps back during the award. */
	.resolve {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin-top: auto;
		padding-top: 0.4rem;
	}

	.duel {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.duel--solo {
		grid-template-columns: 1fr;
	}

	.duel__btn {
		background: var(--accent);
		font-size: 1.05rem;
	}

	/* Disabled because they're winning, not because anything is wrong — so it keeps
	   its colour and just sits pressed in. Same idea for `.sold--waiting` below. */
	.duel__btn--holding:disabled {
		background: var(--accent);
		opacity: 1;
	}

	.sold--waiting:disabled {
		background: var(--white);
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

	/* Each keeps its own tilt, so the animation can't drop the rotation. */
	@keyframes card-turning {
		/* A tall card's near edge grows as it turns: a long perspective and a small
		   angle keep it clear of the player cards above. */
		from {
			transform: rotate(-1deg) translate(-2px, -2px) perspective(140rem) rotateY(5deg);
		}
		to {
			transform: rotate(-1.5deg) translate(-3px, -4px) perspective(140rem) rotateY(16deg);
		}
	}

	@keyframes card-flip {
		from {
			transform: rotate(1deg) perspective(60rem) rotateY(-90deg) scale(1.07);
		}
	}

	/* Drops from above the card (big, high shadow), hits flat, rebounds a touch on Z, settles. */
	@keyframes price-slam {
		0% {
			opacity: 0;
			transform: perspective(40rem) translateZ(18rem) rotate(-8deg);
			box-shadow: 18px 18px 0 var(--ink);
			animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
		}
		45% {
			opacity: 1;
			transform: perspective(40rem) translateZ(-2.5rem) rotate(0deg);
			box-shadow: 0 0 0 var(--ink);
			animation-timing-function: cubic-bezier(0, 0.55, 0.45, 1);
		}
		70% {
			transform: perspective(40rem) translateZ(1.5rem);
			box-shadow: 5px 5px 0 var(--ink);
			animation-timing-function: cubic-bezier(0.55, 0, 0.45, 1);
		}
		100% {
			transform: none;
		}
	}

	@keyframes slam-stamp {
		from {
			transform: rotate(-2deg) scale(1.12);
		}
	}
</style>
