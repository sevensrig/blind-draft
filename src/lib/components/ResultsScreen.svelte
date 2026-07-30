<script lang="ts">
	import { getCategory, getVariant } from '$lib/data';
	import { buildDeck } from '$lib/game/deck';
	import { entryInSlot, totalSpent } from '$lib/game/engine';
	import { game } from '$lib/game/store.svelte';
	import type { Player } from '$lib/game/types';

	const s = $derived(game.state);
	const [p1, p2] = $derived(s.players);

	const priciest = $derived(
		s.history.reduce(
			(top, award) => (award.price > (top?.price ?? 0) ? award : top),
			null as (typeof s.history)[number] | null
		)
	);
	const freebies = $derived(s.history.filter((award) => award.free).length);

	/** Same names, same settings, brand new blind order. */
	function runItBack() {
		const category = getCategory(s.config.categoryId);
		if (!category) return;
		const pool = getVariant(category, s.config.variantId);
		game.dispatch({
			type: 'start',
			config: s.config,
			names: [p1.name, p2.name],
			deck: buildDeck(pool.items, s.config.roster)
		});
	}

	const accentFor = (player: Player) => (player.id === 0 ? 'var(--p1)' : 'var(--p2)');
	const tiltFor = (player: Player) => (player.id === 0 ? '-0.6deg' : '0.6deg');
</script>

<div class="shell results">
	<!-- Framed as one unit so a screenshot explains itself. -->
	<div class="sheet">
		<header class="sheet__head">
			<span class="stampline">$20 Blind Draft</span>
			<h1>Rosters are full</h1>
			<p class="sheet__sub">
				{s.config.categoryLabel}{s.config.variantLabel
					? ` · ${s.config.variantLabel}`
					: ''} · ${s.config.budget} each · {s.config.slots} slots
			</p>
		</header>

		<div class="rosters">
			{#each s.players as player (player.id)}
				<section
					class="roster"
					style:--accent={accentFor(player)}
					style:--tilt={tiltFor(player)}
				>
					<header class="roster__head">
						<h2>{player.name}</h2>
						<div class="roster__totals">
							<span class="spent">${totalSpent(player)}</span>
							<span class="left">${player.money} left</span>
						</div>
					</header>

					<!-- Walk the template so positional rosters read PG, SG, SF, PF, C in order. -->
					<ol class="picks">
						{#each s.config.roster as slot (slot.id)}
							{@const entry = entryInSlot(s, player.id, slot.id)}
							{#if entry}
								<li class="pick">
									{#if s.config.positional}
										<span class="pick__slot">{slot.label}</span>
									{/if}
									<span class="pick__price" class:pick__price--free={entry.free}>
										{entry.free ? 'Free' : `$${entry.price}`}
									</span>
									<span class="pick__name">
										{entry.item.name}
										{#if entry.item.note}<i>{entry.item.note}</i>{/if}
									</span>
								</li>
							{/if}
						{/each}
					</ol>
				</section>
			{/each}
		</div>

		<footer class="stats">
			{#if priciest}
				<div class="stat">
					<span class="eyebrow">Top price</span>
					<b>${priciest.price}</b>
					<span class="stat__detail">{priciest.item.name}</span>
				</div>
			{/if}
			<div class="stat stat--alt">
				<span class="eyebrow">Free pickups</span>
				<b>{freebies}</b>
				<span class="stat__detail">of {s.history.length} items</span>
			</div>
		</footer>
	</div>

	<p class="verdict">No scores here — argue about who won.</p>

	<div class="actions">
		<button class="btn btn--hot" type="button" onclick={runItBack}>
			Run it back
			<span class="btn__sub">same players, fresh deck</span>
		</button>
		<button class="btn btn--ghost" type="button" onclick={() => game.dispatch({ type: 'reset' })}>
			New setup
		</button>
	</div>
</div>

<style>
	.results {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding-top: 1rem;
	}

	.sheet {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 1rem 0.85rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-lg);
	}

	.stampline {
		display: inline-block;
		align-self: flex-start;
		padding: 0.15rem 0.35rem;
		background: var(--yellow);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.6rem;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		transform: rotate(-1.5deg);
	}

	.sheet__head h1 {
		margin: 0.45rem 0 0.3rem;
		font-size: 2rem;
	}

	.sheet__sub {
		margin: 0;
		font-size: 0.7rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.rosters {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.roster {
		padding: 0.65rem 0.7rem 0.7rem;
		background: var(--accent);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		transform: rotate(var(--tilt));
	}

	.roster__head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		padding-bottom: 0.45rem;
		margin-bottom: 0.5rem;
		border-bottom: var(--bw-thin) solid var(--ink);
	}

	.roster__head h2 {
		font-size: 1.1rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.roster__totals {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-variant-numeric: tabular-nums;
	}

	.spent {
		font-size: 1.05rem;
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.03em;
	}

	.left {
		font-size: 0.58rem;
		font-weight: 800;
		text-transform: uppercase;
	}

	.picks {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.pick {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
	}

	.pick__slot {
		flex: none;
		width: 2.6rem;
		padding: 0.1rem 0.2rem;
		background: var(--ink);
		color: var(--cream);
		font-size: 0.62rem;
		font-weight: 900;
		letter-spacing: 0.04em;
		text-align: center;
	}

	/* Price chips keep the column aligned for a clean screenshot. */
	.pick__price {
		flex: none;
		width: 2.9rem;
		padding: 0.1rem 0.2rem;
		background: var(--white);
		border: 2px solid var(--ink);
		font-size: 0.78rem;
		font-weight: 900;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.pick__price--free {
		background: var(--ink);
		color: var(--cream);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.pick__name {
		font-size: 0.92rem;
		font-weight: 900;
		line-height: 1.15;
		text-transform: uppercase;
	}

	.pick__name i {
		display: block;
		font-size: 0.6rem;
		font-style: normal;
		font-weight: 700;
		letter-spacing: 0.04em;
	}

	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		padding: 0.55rem 0.6rem;
		background: var(--cream);
		border: var(--bw-thin) solid var(--ink);
	}

	.stat--alt {
		background: var(--red);
	}

	.stat b {
		font-size: 1.35rem;
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.04em;
		font-variant-numeric: tabular-nums;
	}

	.stat__detail {
		font-size: 0.62rem;
		font-weight: 800;
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.verdict {
		margin: 0;
		text-align: center;
		font-size: 0.74rem;
		font-weight: 900;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>
