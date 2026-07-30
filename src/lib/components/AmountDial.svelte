<script lang="ts">
	interface Props {
		value: number;
		min: number;
		max: number;
		onchange: (next: number) => void;
		/** Label above the number, e.g. "your bid". */
		label?: string;
	}

	let { value, min, max, onchange, label = 'amount' }: Props = $props();

	const clamp = (n: number) => Math.min(max, Math.max(min, n));
	const nudge = (delta: number) => onchange(clamp(value + delta));

	/** Jump chips sized to the range so short ranges don't show useless steps. */
	const jumps = $derived([1, 2, 5].filter((step) => min + step <= max));
	const atMax = $derived(value >= max);
</script>

<div class="dial">
	<div class="row">
		<button
			class="knob"
			type="button"
			onclick={() => nudge(-1)}
			disabled={value <= min}
			aria-label="Decrease by one dollar">&minus;</button
		>

		<div class="readout">
			<span class="eyebrow">{label}</span>
			<span class="value">${value}</span>
		</div>

		<button
			class="knob"
			type="button"
			onclick={() => nudge(1)}
			disabled={atMax}
			aria-label="Increase by one dollar">+</button
		>
	</div>

	<div class="jumps">
		{#each jumps as step (step)}
			<button class="chip" type="button" onclick={() => nudge(step)} disabled={atMax}>
				+{step}
			</button>
		{/each}
		<button class="chip chip--max" type="button" onclick={() => onchange(max)} disabled={atMax}>
			All in ${max}
		</button>
	</div>
</div>

<style>
	.dial {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.row {
		display: grid;
		grid-template-columns: 3.4rem 1fr 3.4rem;
		gap: 0.45rem;
		align-items: stretch;
	}

	.knob {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 1.7rem;
		line-height: 1;
	}

	.knob:active:not(:disabled) {
		background: var(--ink);
		color: var(--cream);
		transform: translate(4px, 4px);
		box-shadow: none;
	}

	.knob:disabled {
		transform: translate(4px, 4px);
		box-shadow: none;
		opacity: 0.4;
		cursor: not-allowed;
	}

	.readout {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.05rem;
		padding: 0.35rem;
		/* Money, not Player 2. */
		background: var(--money);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.value {
		font-size: 2.2rem;
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.05em;
		font-variant-numeric: tabular-nums;
	}

	.jumps {
		display: flex;
		gap: 0.35rem;
	}

	.chip {
		flex: 1;
		padding: 0.45rem 0.2rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.chip:active:not(:disabled) {
		background: var(--ink);
		color: var(--cream);
	}

	.chip--max {
		flex: 1.7;
		background: var(--violet);
	}

	.chip:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
