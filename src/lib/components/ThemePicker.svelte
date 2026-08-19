<script lang="ts">
	import { onMount } from 'svelte';
	import { applyTheme, DEFAULT_THEME, loadTheme, setTheme, THEMES } from '$lib/theme';

	/*
	 * The page is prerendered, so the first render can't know what's in storage.
	 * app.html has already applied the stored theme before paint; this catches the
	 * radio group up once the client is alive, the same way the saved game hydrates.
	 */
	let current = $state(DEFAULT_THEME);

	onMount(() => {
		current = loadTheme();
		/*
		 * Re-applies what the guard in app.html could only shape-check. That guard
		 * can't know the preset list without keeping a second copy of it, so a
		 * well-formed but unknown id — a hand-edited value, or a preset that has
		 * since been retired — gets as far as the attribute. It matches no rule, so
		 * the page looks right, but the document and this radio group would then
		 * disagree about which theme is active. Re-applying the validated id here
		 * means they can't.
		 */
		applyTheme(current);
	});

	function pick(id: string) {
		current = id;
		setTheme(id);
	}
</script>

<!--
	Native radios rather than buttons with ARIA: arrow-key navigation, the group
	label and the checked state all come for free and correctly. Each chip carries
	`data-theme`, so app.css themes the chip itself — the preview is the real
	thing, and no colour value is repeated outside the stylesheet.
-->
<fieldset class="theme">
	<legend class="eyebrow">Colour</legend>
	<div class="theme__row">
		{#each THEMES as preset (preset.id)}
			<input
				class="theme__chip"
				type="radio"
				name="theme"
				data-theme={preset.id}
				value={preset.id}
				aria-label={preset.label}
				checked={current === preset.id}
				onchange={() => pick(preset.id)}
			/>
		{/each}
	</div>
</fieldset>

<style>
	.theme {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.theme legend {
		/* `float` takes the legend out of the fieldset's reserved slot so it sits
		   inline with the swatches instead of notching the (absent) border. */
		float: left;
		padding: 0;
		color: var(--foreground-muted);
	}

	.theme__row {
		display: flex;
		gap: 0.3rem;
	}

	/*
	 * The input *is* the swatch. Styling the control directly rather than hiding it
	 * behind a fake one keeps the native focus ring on the thing that actually has
	 * focus.
	 *
	 * No shadow at rest: six swatches all casting one would be exactly the kind of
	 * flattening this style avoids. The selected one earns it.
	 */
	.theme__chip {
		appearance: none;
		width: 1.5rem;
		height: 1.5rem;
		margin: 0;
		background: var(--main);
		border: var(--bw) solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		/* Inputs don't inherit the button reset, and without this the press state is
		   held back on touch while the browser waits to see if it's a scroll. */
		touch-action: manipulation;
	}

	/*
	 * The selected swatch is the raised one — the same way a chosen category tile
	 * reads, so the cue is already learned. Elevation rather than colour is doing
	 * the work, which matters when the six things being distinguished are colours.
	 *
	 * Left to `box-shadow` deliberately: `outline` belongs to the focus ring, and
	 * borrowing it for selection would override the one the browser draws.
	 */
	.theme__chip:checked {
		box-shadow: var(--shadow-hard);
	}

	.theme__chip:active {
		translate: var(--press) var(--press);
		box-shadow: none;
	}
</style>
