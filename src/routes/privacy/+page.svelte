<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { SITE_NAME } from '$lib/site';

	/**
	 * Keep this in step with the code it describes: `$lib/analytics`, the Vercel
	 * injection in `+layout.ts`, `$lib/game/persist.ts`, `$lib/remote/identity.ts`
	 * and the `request_log` table behind the Edge Functions' rate limiting.
	 */
	const sections = [
		{
			q: 'No accounts, no cookies',
			a: "There's nothing to sign up for, and the site sets no cookies. There's no consent banner because there's nothing to consent to."
		},
		{
			q: 'What stays on your device',
			a: "Your browser's local storage keeps a game in progress (so a refresh doesn't lose it), your custom list, the name you last played under, and for online play a random device code that lets you rejoin your seat. There's also a note of the current week (like 2026-W43) so a weekly visit is counted once. None of it is sent to analytics. Clearing your site data deletes all of it."
		},
		{
			q: 'Anonymous usage stats',
			a: "We use Vercel Web Analytics and PostHog in cookieless mode to count visits and see which categories get played. Events carry the page path, category, budget and number of slots — never player names or the items you type in. Visitors aren't given an ID: the services hash a few request details with a salt that changes every day, so a visit can't be followed from one day to the next. IP address collection is switched off in both. We also send crash reports so we can fix bugs, with the same limits."
		},
		{
			q: 'Online play',
			a: "When you play online, the room's settings, the two players' names, the device code and the game itself are stored on our server (Supabase) so both screens stay in sync. Rooms are deleted automatically 24 to 36 hours after they go quiet. To stop people flooding the server, each request to create, join or act in a room is briefly logged against your IP address; that log is wiped within a day and used for nothing else."
		},
		{
			q: 'Hosting and feedback',
			a: "Like any website, our hosts (Vercel and Supabase) see your IP address in order to deliver the page. The Send feedback button opens a Google Form, which is run by Google under Google's own privacy policy. It only collects what you choose to type."
		},
		{
			q: 'What we never do',
			a: "No ads, no selling or sharing data, no session recordings, no fingerprinting. Questions or want something removed? Send it through the feedback form."
		}
	];
</script>

<Seo
	title="Privacy — {SITE_NAME}"
	description="What the $20 Draft Game collects: no accounts, no cookies, cookieless anonymous stats, and online rooms that delete themselves within a day and a half."
	path="/privacy"
/>

<main class="shell privacy">
	<nav class="back"><a href="/">← {SITE_NAME}</a></nav>

	<header class="head">
		<h1>Privacy</h1>
		<p class="lede">
			Short version: we collect as little as we can, and nothing that says who you are.
		</p>
	</header>

	{#each sections as entry (entry.q)}
		<section class="qa">
			<h2>{entry.q}</h2>
			<p>{entry.a}</p>
		</section>
	{/each}

	<p class="note">Last updated October 2026.</p>
</main>

<style>
	.privacy {
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

	.back a {
		color: var(--ink);
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

	/* Same as the FAQ: the global heading rule shouts these. */
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

	.note {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ink-muted);
	}
</style>
