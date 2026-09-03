<script lang="ts">
	import type { SlotSpec } from '$lib/data/types';
	import type { Player } from '$lib/game/types';

	interface Props {
		player: Player;
		roster: SlotSpec[];
		/** True when slots carry positions and should be labelled. */
		positional: boolean;
		/** Draws attention while this player holds the standing bid. */
		leading?: boolean;
	}

	let { player, roster, positional, leading = false }: Props = $props();

	const accent = $derived(player.id === 0 ? 'var(--p1)' : 'var(--p2)');
	/** Opposing tilts, per the style's "slightly rotated cards". */
	const tilt = $derived(player.id === 0 ? '-1deg' : '1deg');
	const broke = $derived(player.money <= 0);
	const filled = $derived(new Map(player.roster.map((entry) => [entry.slotId, entry])));
	const latest = $derived(player.roster.at(-1));
</script>

<div class="status" class:leading style:--accent={accent} style:--tilt={tilt}>
	{#if leading}
		<span class="badge">Leading</span>
	{/if}

	<span class="name">{player.name}</span>

	<div class="wallet" class:broke>
		{broke ? 'Broke' : `$${player.money}`}
	</div>

	{#if positional}
		<!-- Named slots, so both players can see what's still missing. -->
		<div class="slots">
			{#each roster as slot (slot.id)}
				{@const entry = filled.get(slot.id)}
				<span class="slot" class:on={!!entry}>{slot.label}</span>
			{/each}
		</div>
	{:else}
		<div
			class="pips"
			role="img"
			aria-label="{player.roster.length} of {roster.length} roster slots filled"
		>
			{#each roster as slot (slot.id)}
				<span class="pip" class:on={filled.has(slot.id)}></span>
			{/each}
		</div>
	{/if}

	<div class="latest">
		{#if latest}
			<b>{latest.free ? 'FREE' : `$${latest.price}`}</b>
			<span>{latest.item.name}</span>
		{:else}
			<span class="empty">Nothing yet</span>
		{/if}
	</div>
</div>

<style>
	.status {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.6rem 0.6rem 0.5rem;
		background: var(--accent);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		transform: rotate(var(--tilt));
	}

	.status.leading {
		box-shadow: var(--shadow-lg);
		transform: rotate(var(--tilt)) translate(-2px, -2px);
	}

	/* Slapped on at an angle, per the style's badge rule. */
	.badge {
		position: absolute;
		top: -0.7rem;
		right: -0.4rem;
		z-index: 1;
		padding: 0.15rem 0.35rem;
		background: var(--red);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.55rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		transform: rotate(6deg);
	}

	.name {
		font-size: 0.78rem;
		font-weight: 900;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.wallet {
		font-size: 1.85rem;
		font-weight: 900;
		line-height: 0.9;
		letter-spacing: -0.045em;
		font-variant-numeric: tabular-nums;
	}

	.wallet.broke {
		align-self: flex-start;
		padding: 0.1rem 0.3rem;
		background: var(--ink);
		color: var(--cream);
		font-size: 1.05rem;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.pips {
		display: flex;
		gap: 3px;
	}

	/* Hard blocks, filled black — no soft states in this style. */
	.pip {
		width: 100%;
		height: 8px;
		background: var(--white);
		border: 2px solid var(--ink);
	}

	.pip.on {
		background: var(--ink);
	}

	.slots {
		display: flex;
		gap: 2px;
	}

	.slot {
		flex: 1;
		padding: 1px 0;
		background: var(--white);
		border: 2px solid var(--ink);
		font-size: 0.48rem;
		font-weight: 900;
		line-height: 1.35;
		letter-spacing: 0.02em;
		text-align: center;
	}

	/* Open slots stay neutral: any takes any player, so highlighting one
	   would imply a restriction. */
	.slot.on {
		background: var(--ink);
		color: var(--cream);
	}

	.latest {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
		min-height: 0.9rem;
		font-size: 0.6rem;
		font-weight: 800;
		text-transform: uppercase;
	}

	.latest b {
		flex: none;
		font-weight: 900;
	}

	.latest span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty {
		opacity: 0.5;
	}
</style>
