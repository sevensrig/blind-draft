<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { track } from '$lib/analytics';
	import { categoryLandingEvent } from '$lib/analytics/events';
	import { hasVariants } from '$lib/data';
	import { canonical } from '$lib/seo';
	import { SITE_NAME, SITE_URL } from '$lib/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const { category, copy } = $derived(data);
	const path = $derived(`/${category.id}`);

	/** Enough names to be real content, few enough to stay a page and not a list. */
	const SAMPLE = 24;

	/**
	 * A breadcrumb is the one rich result this page can realistically earn, and it
	 * tells Google the home page is the parent rather than leaving these orphaned
	 * in the hierarchy.
	 */
	const schema = $derived({
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
			{ '@type': 'ListItem', position: 2, name: category.label, item: canonical(path) }
		]
	});
</script>

<Seo title={copy.title} description={copy.description} {path} {schema} />

<main class="shell landing">
	<nav class="back"><a href="/">← {SITE_NAME}</a></nav>

	<header class="head" style:--accent="var(--{category.accent})">
		<span class="chip"><Icon name={category.icon} /></span>
		<h1>{category.label}</h1>
		<p class="blurb">{copy.intro}</p>
	</header>

	<a
		class="btn btn--hot start"
		href="/?category={category.id}"
		onclick={() => track(categoryLandingEvent(category.id))}
	>
		Draft {category.label}
		<span class="btn__sub">Two players · $20 each · free</span>
	</a>

	{#if category.roster}
		<section class="block">
			<h2>The roster</h2>
			<p>
				This category drafts a fixed lineup, so the deck always stocks enough players to fill it.
				Slots suggest a position but never restrict one — any player can go anywhere still open.
			</p>
			<ul class="slots">
				{#each category.roster as slot (slot.id)}
					<li>{slot.label}</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#each category.variants as pool (pool.id)}
		<section class="block">
			<h2>
				{hasVariants(category) ? `${pool.label} — ${pool.items.length} in the pool` : `What's in the pool`}
			</h2>
			<p class="count">
				{#if !hasVariants(category)}
					{pool.items.length} items, and each game samples a fresh deck from them — so two drafts in a
					row never play the same.
				{:else}
					A separate deck from the other sub-mode. Pick one at setup.
				{/if}
			</p>
			<ul class="pool">
				{#each pool.items.slice(0, SAMPLE) as item (item.id)}
					<li>{item.name}</li>
				{/each}
			</ul>
			{#if pool.items.length > SAMPLE}
				<p class="more">…and {pool.items.length - SAMPLE} more.</p>
			{/if}
		</section>
	{/each}

	<section class="block">
		<h2>How a draft works</h2>
		<ol>
			<li>An item is revealed. Neither of you knew it was coming.</li>
			<li>Either player opens the bidding — no turn order — and you raise by at least $1.</li>
			<li>One of you stops. The other wins it at the final price.</li>
			<li>Repeat until both rosters are full, then compare.</li>
		</ol>
	</section>

	<footer class="foot">
		<a class="btn btn--ghost" href="/">Pick a different category</a>
	</footer>
</main>

<style>
	.landing {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding-bottom: 3rem;
	}

	.back {
		padding-top: 1rem;
		font-size: 0.78rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.back a {
		color: var(--ink);
		text-decoration: none;
	}

	.head {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.6rem;
	}

	/* Same coloured chip as the category tile, so the page reads as that tile. */
	.chip {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		background: var(--accent);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		transform: rotate(-2deg);
	}

	h1 {
		margin: 0;
		font-size: 2.1rem;
		line-height: 0.95;
	}

	.blurb {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		line-height: 1.35;
	}

	.start {
		text-decoration: none;
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 1rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
	}

	.block h2 {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.block p,
	.block li {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 600;
		line-height: 1.45;
	}

	.count {
		color: var(--ink-muted);
	}

	.slots {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.slots li {
		padding: 0.25rem 0.5rem;
		background: var(--yellow);
		border: var(--bw-thin) solid var(--ink);
		font-weight: 900;
		font-size: 0.78rem;
	}

	.pool {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.pool li {
		padding: 0.2rem 0.45rem;
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.8rem;
		font-weight: 700;
	}

	.more {
		color: var(--ink-muted);
		font-size: 0.8rem;
	}

	.block ol {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.foot {
		display: flex;
	}

	.foot :global(.btn) {
		width: 100%;
		text-decoration: none;
	}
</style>
