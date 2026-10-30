<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		/** `data-tour` values to light up as one box. None dims the whole screen. */
		targets: string[];
		title: string;
		body: string;
		/** Shown when the player tried the right move with the wrong amount. */
		hint?: string | null;
		/** "Step 3 of 20". */
		progress?: string;
		/** Present on steps that only explain; the player taps it to carry on. */
		onnext?: () => void;
		onskip?: () => void;
	}

	let { targets, title, body, hint = null, progress, onnext, onskip }: Props = $props();

	const PAD = 6;
	const GAP = 12;

	interface Box {
		top: number;
		left: number;
		width: number;
		height: number;
	}

	let hole = $state<Box | null>(null);
	let vw = $state(0);
	let vh = $state(0);
	let cardHeight = $state(0);

	function elements(): HTMLElement[] {
		return targets.flatMap((name) => [
			...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)
		]);
	}

	function measure(): Box | null {
		const rects = elements().map((el) => el.getBoundingClientRect());
		if (rects.length === 0) return null;
		const top = Math.min(...rects.map((r) => r.top)) - PAD;
		const left = Math.min(...rects.map((r) => r.left)) - PAD;
		const bottom = Math.max(...rects.map((r) => r.bottom)) + PAD;
		const right = Math.max(...rects.map((r) => r.right)) + PAD;
		return { top, left, width: right - left, height: bottom - top };
	}

	onMount(() => {
		// Polled rather than observed: card slams, stamps and scrolling all move the
		// target, and one rAF read per frame is cheaper than wiring each of them.
		let frame = 0;
		const tick = () => {
			vw = window.innerWidth;
			vh = window.innerHeight;
			hole = measure();
			frame = requestAnimationFrame(tick);
		};
		tick();
		return () => cancelAnimationFrame(frame);
	});

	$effect(() => {
		void targets;
		// Waits a frame so a target that only just rendered can be found.
		requestAnimationFrame(() => {
			const found = elements();
			found[0]?.scrollIntoView({ block: 'nearest' });
			found.at(-1)?.scrollIntoView({ block: 'nearest' });
		});
	});

	/** Below the box when there's more room there, else above; centred with no box. */
	const cardTop = $derived.by(() => {
		if (!hole) return Math.max(GAP, (vh - cardHeight) / 2);
		const below = vh - (hole.top + hole.height);
		const top = below >= hole.top ? hole.top + hole.height + GAP : hole.top - GAP - cardHeight;
		return Math.min(Math.max(GAP, top), Math.max(GAP, vh - cardHeight - GAP));
	});
</script>

<div class="tour">
	{#if hole}
		<!-- Four panels around the box, so taps outside it are swallowed and taps
		     inside reach the real control. -->
		<div class="scrim" style:top="0" style:left="0" style:width="100%" style:height="{Math.max(0, hole.top)}px"></div>
		<div
			class="scrim"
			style:top="{hole.top + hole.height}px"
			style:left="0"
			style:width="100%"
			style:height="{Math.max(0, vh - hole.top - hole.height)}px"
		></div>
		<div
			class="scrim"
			style:top="{hole.top}px"
			style:left="0"
			style:width="{Math.max(0, hole.left)}px"
			style:height="{hole.height}px"
		></div>
		<div
			class="scrim"
			style:top="{hole.top}px"
			style:left="{hole.left + hole.width}px"
			style:width="{Math.max(0, vw - hole.left - hole.width)}px"
			style:height="{hole.height}px"
		></div>
		<div
			class="ring"
			style:top="{hole.top}px"
			style:left="{hole.left}px"
			style:width="{hole.width}px"
			style:height="{hole.height}px"
		></div>
	{:else}
		<div class="scrim" style:inset="0"></div>
	{/if}

	<div class="card" role="dialog" aria-label={title} bind:offsetHeight={cardHeight} style:top="{cardTop}px">
		{#if progress}
			<span class="eyebrow">{progress}</span>
		{/if}
		<h2 class="title">{title}</h2>
		<p class="body" aria-live="polite">{body}</p>
		{#if hint}
			<p class="hint" role="alert">{hint}</p>
		{/if}
		<div class="actions">
			{#if onskip}
				<button class="skip" type="button" onclick={onskip}>Skip tutorial</button>
			{/if}
			{#if onnext}
				<!-- svelte-ignore a11y_autofocus -->
				<button class="btn btn--hot next" type="button" autofocus onclick={onnext}>Got it</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.tour {
		position: fixed;
		inset: 0;
		z-index: 50;
		pointer-events: none;
	}

	.scrim {
		position: fixed;
		background: color-mix(in srgb, var(--ink) 55%, transparent);
		pointer-events: auto;
	}

	.ring {
		position: fixed;
		border: var(--bw) solid var(--red);
		outline: var(--bw-thin) solid var(--ink);
		animation: blink 1.2s steps(2, jump-none) infinite;
	}

	.card {
		position: fixed;
		left: 50%;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: min(22rem, calc(100vw - 32px));
		padding: 0.8rem 0.9rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-lg);
		translate: -50% 0;
		pointer-events: auto;
	}

	.title {
		margin: 0;
		font-size: 1.15rem;
		line-height: 1.05;
	}

	.body {
		margin: 0;
		font-size: 0.86rem;
		font-weight: 700;
		line-height: 1.35;
	}

	.hint {
		margin: 0;
		padding: 0.35rem 0.5rem;
		background: var(--yellow);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.76rem;
		font-weight: 900;
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.2rem;
	}

	.skip {
		padding: 0.3rem 0;
		background: none;
		border: 0;
		font-size: 0.68rem;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-decoration: underline;
		text-transform: uppercase;
	}

	.next {
		margin-left: auto;
		width: auto;
		padding: 0.5rem 1.1rem;
	}

	@keyframes blink {
		50% {
			border-color: var(--yellow);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ring {
			animation: none;
		}
	}
</style>
