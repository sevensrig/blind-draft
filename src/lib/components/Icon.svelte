<script lang="ts">
	import { ICONS, type IconName } from '$lib/icons';

	interface Props {
		name: IconName;
		/**
		 * Only when the icon is the sole carrier of meaning. Every current use sits
		 * beside a visible label, so the default is decorative.
		 */
		label?: string;
	}

	let { name, label }: Props = $props();

	const icon = $derived(ICONS[name]);
</script>

<svg
	class="icon"
	viewBox={icon.viewBox}
	xmlns="http://www.w3.org/2000/svg"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
>
	<path d={icon.path} />
</svg>

<style>
	.icon {
		display: block;
		/* Sized and coloured by whatever is using it. */
		width: 1em;
		height: 1em;
		fill: currentColor;
	}
</style>
