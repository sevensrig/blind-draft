<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { loadCustomDraft, saveCustomDraft } from '$lib/game/persist';
	import RoomSettingsFields from '$lib/components/RoomSettingsFields.svelte';
	import { RemoteError } from '$lib/remote/client';
	import { recallName, rememberName } from '$lib/remote/identity';
	import { room } from '$lib/remote/room.svelte';
	import { SettingsForm } from '$lib/remote/settings.svelte';
	import Seo from '$lib/components/Seo.svelte';

	const form = new SettingsForm();
	let name = $state('');
	let visibility = $state<'public' | 'private'>('public');
	let joinCode = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	/* Typed once, then reused by the rooms browser and by invite links. */
	onMount(() => {
		// Only when still empty. This page server-renders now, so the field is real
		// and typable before hydration — overwriting it here wiped the name of
		// anyone who typed faster than the bundle loaded.
		if (!name) name = recallName();
		// The same draft the local setup screen keeps, so a list typed there is here too.
		const saved = loadCustomDraft();
		if (saved) {
			form.customName = saved.name;
			form.customText = saved.text;
		}
		// Same signal the home page raises, for the same reason: the form is
		// clickable before its handlers attach, so taps land on nothing.
		document.documentElement.dataset.hydrated = 'true';
	});

	$effect(() => {
		saveCustomDraft({ name: form.customName, text: form.customText });
	});

	async function create() {
		const settings = form.toSettings();
		if (!settings || busy) return;
		busy = true;
		error = null;
		rememberName(name);
		try {
			const { roomId, code } = await room.create({ ...settings, visibility, name: name.trim() });
			// Code rides in the URL so refreshing the lobby still shows it.
			await goto(`/online/room?id=${roomId}&code=${code}`);
		} catch (failure) {
			error = failure instanceof RemoteError ? failure.message : 'Could not create that room';
			busy = false;
		}
	}

	async function join() {
		const code = joinCode.replace(/\D/g, '');
		if (code.length < 4 || busy) return;
		busy = true;
		error = null;
		rememberName(name);
		try {
			const { roomId } = await room.join({ code, name: name.trim() });
			await goto(`/online/room?id=${roomId}`);
		} catch (failure) {
			error = failure instanceof RemoteError ? failure.message : 'Could not join that room';
			busy = false;
		}
	}
</script>

<Seo
	title="Play the $20 Draft Game online with a friend"
	description="Play the $20 draft game online on two phones. Create a room, send the invite link, and draft together in real time. Free, no account, nothing to install."
	path="/online"
/>

<div class="shell online">
	<header class="head">
		<a class="back" href="/">Back</a>
		<h1>Play online</h1>
		<p class="sub">Two phones, two places. Same blind draft.</p>
		<p class="lede">
			Create a room and send the link. You each draft from your own phone, the reveals stay in sync,
			and nobody has to pass a device around. No account, no download — the room disappears when
			you're done.
		</p>
	</header>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	<section class="block">
		<h2 class="block__title">Your name</h2>
		<input class="field" type="text" bind:value={name} placeholder="Player" maxlength="14" />
	</section>

	<section class="block">
		<h2 class="block__title">Join a room</h2>
		<div class="join">
			<input
				class="field code"
				type="text"
				inputmode="numeric"
				bind:value={joinCode}
				placeholder="000000"
				maxlength="6"
				aria-label="Room code"
			/>
			<button
				class="btn"
				type="button"
				disabled={joinCode.replace(/\D/g, '').length < 4 || busy}
				onclick={join}>Join</button
			>
		</div>
		<!-- A button, not a footnote link: this is the second real way in. It banks
		     the name on the way out, or a player who typed one and then browsed
		     arrives at the room list with nothing remembered. -->
		<a class="btn btn--yellow browse" href="/online/rooms" onclick={() => rememberName(name)}>
			Browse open rooms
		</a>
	</section>

	<hr class="rule" />

	<RoomSettingsFields {form} bind:visibility budgetTitle="Or start one" />

	<div class="dock">
		<button class="btn btn--hot" type="button" disabled={!form.ready || busy} onclick={create}>
			{busy ? 'Working…' : form.category ? 'Create room' : 'Pick a category'}
			{#if form.category}
				<span class="btn__sub">
					{form.label} · ${form.budget} · {form.effectiveSlots} slots · {visibility === 'public'
						? 'anyone'
						: 'link only'}
				</span>
			{/if}
		</button>
	</div>
</div>

<style>
	.online {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}

	.head {
		padding-top: 1.1rem;
	}

	.back {
		display: inline-block;
		margin-bottom: 0.6rem;
		padding: 0.25rem 0.5rem;
		background: var(--white);
		border: var(--bw-thin) solid var(--ink);
		box-shadow: 3px 3px 0 var(--ink);
		font-size: 0.62rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink);
		text-decoration: none;
	}

	.head h1 {
		font-size: 2rem;
	}

	.sub {
		margin: 0.35rem 0 0;
		font-size: 0.88rem;
		font-weight: 700;
	}

	.lede {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		font-weight: 600;
		line-height: 1.4;
		color: var(--ink-muted);
	}

	.error {
		margin: 0;
		padding: 0.6rem 0.7rem;
		background: var(--red);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 0.82rem;
		font-weight: 800;
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.block__title {
		font-size: 0.68rem;
		letter-spacing: 0.14em;
	}

	.field {
		width: 100%;
		padding: 0.6rem 0.55rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 1rem;
		font-weight: 900;
	}

	.field:focus {
		outline: var(--bw-thin) solid var(--ink);
		outline-offset: 2px;
	}

	.join {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.5rem;
	}

	.code {
		font-size: 1.4rem;
		letter-spacing: 0.28em;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.join .btn {
		width: auto;
		padding-inline: 1.3rem;
	}

	.browse {
		min-height: 3rem;
		margin-top: 0.1rem;
		font-size: 0.85rem;
	}

	.rule {
		height: var(--bw);
		margin: 0;
		background: var(--ink);
		border: 0;
	}

	.dock {
		position: sticky;
		bottom: 0;
		z-index: 2;
		margin: -0.3rem -1rem 0;
		padding: 0.8rem 1rem 1rem;
		background: var(--cream);
		border-top: var(--bw) solid var(--ink);
	}
</style>
