<script lang="ts">
	import { canonical } from '$lib/seo';

	interface Props {
		title: string;
		description: string;
		/** Route path, e.g. `/nba`. Becomes the canonical and `og:url`. */
		path: string;
		/** JSON-LD for this page, on top of the site-wide `VideoGame` in the layout. */
		schema?: unknown;
	}

	let { title, description, path, schema }: Props = $props();

	const url = $derived(canonical(path));
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />

	<!-- Per page, so a shared category link doesn't unfurl as the home page. -->
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />

	{#if schema}
		{@html `<script type="application/ld+json">${JSON.stringify(schema)}</script>`}
	{/if}
</svelte:head>
