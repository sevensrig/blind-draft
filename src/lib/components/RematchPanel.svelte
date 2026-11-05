<script lang="ts">
	import { getCategory } from '$lib/data';
	import { loadCustomDraft } from '$lib/game/persist';
	import type { GameConfig, PlayerId } from '$lib/game/types';
	import { SettingsForm } from '$lib/remote/settings.svelte';
	import type { RematchOffer, RoomSettings } from '$lib/remote/types';
	import RoomSettingsFields from './RoomSettingsFields.svelte';

	/** Rematch controls for the online results screen. Knows nothing about transport. */
	let {
		offer,
		seat,
		opponentName,
		opponentGone,
		config,
		onPropose,
		onAccept,
		onCancel
	}: {
		offer: RematchOffer | null;
		seat: PlayerId;
		opponentName: string;
		opponentGone: boolean;
		/** The game just played, which the picker starts from. */
		config: GameConfig;
		onPropose: (settings: RoomSettings) => Promise<void>;
		onAccept: () => Promise<void>;
		onCancel: () => Promise<void>;
	} = $props();

	let busy = $state(false);
	let dialog = $state<HTMLDialogElement | null>(null);
	let form = $state<SettingsForm | null>(null);

	const mine = $derived(offer?.by === seat);
	const summary = (o: RematchOffer) =>
		`${o.categoryLabel}${o.variantLabel ? ` · ${o.variantLabel}` : ''} · $${o.budget} · ${o.slots} slots`;

	async function run(action: () => Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await action();
		} finally {
			busy = false;
		}
	}

	/** Starts from the offer on the table if there is one, else the game just played. */
	function openPicker() {
		const from = offer ?? config;
		// Online configs never carry the custom pool, so fall back to this device's draft.
		const draft = getCategory(from.categoryId)?.custom ? loadCustomDraft() : null;
		form = new SettingsForm({
			categoryId: from.categoryId,
			variantId: from.variantId,
			budget: from.budget,
			slots: from.slots,
			customName: draft?.name,
			customItems: draft?.text.split('\n')
		});
		dialog?.showModal();
	}

	function send() {
		const settings = form?.toSettings();
		if (!settings) return;
		void run(async () => {
			await onPropose(settings);
			dialog?.close();
		});
	}
</script>

{#if opponentGone}
	<p class="note" role="status">{opponentName} left the room. Start a new one to play again.</p>
{:else if offer && mine}
	<div class="note" role="status">
		<span class="eyebrow">Rematch offered</span>
		<p>Waiting on {opponentName} to accept</p>
		<strong>{summary(offer)}</strong>
	</div>
	<button class="btn" type="button" onclick={openPicker} disabled={busy}>Change it</button>
	<button class="btn btn--ghost" type="button" onclick={() => run(onCancel)} disabled={busy}>
		Cancel offer
	</button>
{:else if offer}
	<div class="note note--incoming" role="status">
		<span class="eyebrow">Rematch?</span>
		<p>{opponentName} wants to play again</p>
		<strong>{summary(offer)}</strong>
	</div>
	<button class="btn btn--hot" type="button" onclick={() => run(onAccept)} disabled={busy}>
		{busy ? 'Starting…' : 'Accept'}
		<span class="btn__sub">fresh deck, same opponent</span>
	</button>
	<button class="btn" type="button" onclick={openPicker} disabled={busy}>
		Pick something else
	</button>
	<button class="btn btn--ghost" type="button" onclick={() => run(onCancel)} disabled={busy}>
		No thanks
	</button>
{:else}
	<button class="btn btn--hot" type="button" onclick={openPicker}>
		Play again
		<span class="btn__sub">same opponent · change the category if you like</span>
	</button>
{/if}

<dialog bind:this={dialog} class="picker" aria-labelledby="rematch-title" onclose={() => (form = null)}>
	{#if form}
		<div class="picker__body">
			<span class="eyebrow">Rematch with {opponentName}</span>
			<h2 id="rematch-title">Pick the next draft</h2>
			<RoomSettingsFields {form} />
		</div>
		<div class="picker__dock">
			<button class="btn btn--hot" type="button" onclick={send} disabled={!form.ready || busy}>
				{busy ? 'Sending…' : form.category ? `Offer ${form.label}` : 'Pick a category'}
				{#if form.category}
					<span class="btn__sub">${form.budget} · {form.effectiveSlots} slots</span>
				{/if}
			</button>
			<button class="btn btn--ghost" type="button" onclick={() => dialog?.close()}>Cancel</button>
		</div>
	{/if}
</dialog>

<style>
	.note {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin: 0;
		padding: 0.7rem 0.8rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
		font-size: 0.85rem;
		font-weight: 800;
	}

	.note--incoming {
		background: var(--yellow);
	}

	.note p {
		margin: 0;
	}

	.note strong {
		font-size: 1rem;
		font-weight: 900;
	}

	.picker {
		width: min(28rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 2rem);
		padding: 0;
		background: var(--cream);
		color: var(--ink);
		border: var(--bw) solid var(--ink);
		box-shadow: var(--shadow-sm);
	}

	.picker[open] {
		display: flex;
		flex-direction: column;
	}

	.picker::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.picker__body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.1rem 1rem;
		overflow-y: auto;
	}

	.picker h2 {
		margin: -0.6rem 0 0;
		font-size: 1.5rem;
	}

	.picker__dock {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.8rem 1rem 1rem;
		border-top: var(--bw) solid var(--ink);
	}
</style>
