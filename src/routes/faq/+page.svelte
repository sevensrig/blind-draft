<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { CATEGORIES } from '$lib/data';
	import { CATEGORY_COPY, FAQ } from '$lib/seo';
	import { SITE_NAME } from '$lib/site';

	const guides = CATEGORIES.filter((entry) => CATEGORY_COPY[entry.id]);

	/**
	 * Lives here rather than on the home page: the questions are this page's whole
	 * content, and a page that is about the questions is what ranks for them.
	 */
	const schema = {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: FAQ.map(({ q, a }) => ({
			'@type': 'Question',
			name: q,
			acceptedAnswer: { '@type': 'Answer', text: a }
		}))
	};
</script>

<Seo
	title="$20 Draft Game — how to play, rules and FAQ"
	description="How to play the $20 TikTok draft game: the rules, how many people can play, what you can draft, and what happens if you spend your whole budget early."
	path="/faq"
	{schema}
/>

<main class="shell faq">
	<nav class="back"><a href="/">← {SITE_NAME}</a></nav>

	<header class="head">
		<h1>How to play</h1>
		<p class="lede">
			Everything people ask about the $20 draft game from TikTok, answered. If you just want to
			play, the game is on the <a href="/">home page</a> — no account, nothing to install.
		</p>
	</header>

	{#each FAQ as entry (entry.q)}
		<section class="qa">
			<h2>{entry.q}</h2>
			<p>{entry.a}</p>
		</section>
	{/each}

	<nav class="browse" aria-label="Category guides">
		<h2>Guides for each category</h2>
		<p class="note">What's in the pool and how the draft works, one page per category.</p>
		<ul>
			{#each guides as entry (entry.id)}
				<li><a href="/{entry.id}">{entry.label}</a></li>
			{/each}
		</ul>
	</nav>

	<footer class="foot">
		<a class="btn btn--hot" href="/">Play a draft</a>
	</footer>
</main>

<style>
	.faq {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-bottom: 3rem;
	}

	.back {
		padding-top: 1rem;
		font-size: 0.78rem;
		font-weight: 900;
		letter-spacing: 0.04em;
	}

	.back a,
	.lede a {
		color: var(--ink);
	}

	.back a {
		text-decoration: none;
	}

	h1 {
		margin: 0;
		font-size: 2.1rem;
		line-height: 0.95;
	}

	.lede {
		margin: 0.5rem 0 0;
		font-size: 0.95rem;
		font-weight: 700;
		line-height: 1.4;
	}

	.qa {
		padding: 0.9rem 1rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
	}

	/* The global heading rule shouts these; full questions don't survive it. */
	.qa h2 {
		margin: 0 0 0.35rem;
		font-size: 0.95rem;
		font-weight: 900;
		line-height: 1.3;
		text-transform: none;
	}

	.qa p {
		margin: 0;
		font-size: 0.88rem;
		font-weight: 600;
		line-height: 1.45;
	}

	.browse h2 {
		margin: 0 0 0.3rem;
		font-size: 0.68rem;
		font-weight: 900;
		letter-spacing: 0.12em;
	}

	.note {
		margin: 0 0 0.6rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ink-muted);
	}

	.browse ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.browse a {
		display: inline-block;
		padding: 0.2rem 0.45rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
	}

	.foot :global(.btn) {
		width: 100%;
		text-decoration: none;
	}
</style>
