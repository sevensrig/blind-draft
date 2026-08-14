<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import {
		OG_IMAGE,
		OG_IMAGE_ALT,
		SITE_DESCRIPTION,
		SITE_NAME,
		SITE_TAGLINE,
		SITE_URL
	} from '$lib/site';

	let { children } = $props();

	/**
	 * Structured data, for search rich results and for answer engines that parse
	 * JSON-LD rather than guessing from markup.
	 *
	 * Everything here is a build-time constant. Nothing player-entered goes in —
	 * a custom category name is arbitrary text and has no business in the page
	 * head.
	 */
	const schema = {
		'@context': 'https://schema.org',
		'@type': 'VideoGame',
		name: SITE_NAME,
		url: SITE_URL,
		description: SITE_DESCRIPTION,
		image: OG_IMAGE,
		applicationCategory: 'GameApplication',
		gamePlatform: 'Web browser',
		operatingSystem: 'Any',
		playMode: 'MultiPlayer',
		numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 2 },
		genre: ['Party game', 'Auction game'],
		isAccessibleForFree: true,
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
	};
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#fffdf5" />
	<link rel="canonical" href={SITE_URL} />

	<!-- Open Graph: what iMessage, Discord, Slack and most link previews read. -->
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={SITE_NAME} />
	<meta property="og:description" content={SITE_TAGLINE} />
	<meta property="og:url" content={SITE_URL} />
	<meta property="og:image" content={OG_IMAGE} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={OG_IMAGE_ALT} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SITE_NAME} />
	<meta name="twitter:description" content={SITE_TAGLINE} />
	<meta name="twitter:image" content={OG_IMAGE} />
	<meta name="twitter:image:alt" content={OG_IMAGE_ALT} />

	{@html `<script type="application/ld+json">${JSON.stringify(schema)}</script>`}
</svelte:head>

{@render children()}
