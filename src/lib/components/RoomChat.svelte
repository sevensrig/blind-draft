<script lang="ts">
	import { CHAT_MAX, containsSlur } from '$lib/data/moderation';
	import type { ChatMessage } from '$lib/remote/types';

	interface Props {
		seat: 0 | 1;
		names: [string, string];
		messages: ChatMessage[];
		/** Rejects with a readable message when the server refuses. */
		send: (text: string) => Promise<void>;
		/** Set once the other player has left: the log stays, the input goes. */
		closed?: string | null;
	}

	let { seat, names, messages, send, closed = null }: Props = $props();

	let draft = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let log = $state<HTMLOListElement | null>(null);

	// Only a warning: `room-chat` is what actually refuses it.
	const blocked = $derived(containsSlur(draft));

	$effect(() => {
		void messages.length;
		if (log) log.scrollTop = log.scrollHeight;
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const text = draft.trim();
		if (!text || busy || blocked) return;
		busy = true;
		error = null;
		try {
			await send(text);
			// Anything typed while it was sending stays.
			if (draft.trim() === text) draft = '';
		} catch (failure) {
			error = failure instanceof Error ? failure.message : 'Could not send that';
		} finally {
			busy = false;
		}
	}
</script>

<section class="chat" aria-labelledby="chat-title">
	<h2 id="chat-title">Talk it out</h2>

	{#if messages.length}
		<ol class="log" bind:this={log} aria-live="polite">
			{#each messages as message (message.id)}
				<li class:mine={message.seat === seat} style:--accent={message.seat === 0 ? 'var(--p1)' : 'var(--p2)'}>
					<b>{message.seat === seat ? 'You' : names[message.seat]}</b>
					<span>{message.body}</span>
				</li>
			{/each}
		</ol>
	{:else if !closed}
		<p class="empty">Who won the draft? Make your case.</p>
	{/if}

	{#if closed}
		<p class="empty">{closed}</p>
	{:else}
		<form onsubmit={submit}>
			<label class="sr-only" for="chat-input">Message</label>
			<input
				id="chat-input"
				bind:value={draft}
				maxlength={CHAT_MAX}
				autocomplete="off"
				placeholder="Say something"
				aria-invalid={blocked}
				aria-describedby={blocked || error ? 'chat-error' : undefined}
			/>
			<button class="btn send" type="submit" disabled={busy || blocked || !draft.trim()}>Send</button>
		</form>

		{#if blocked || error}
			<p class="error" id="chat-error" role="alert">
				{blocked ? "Slurs aren't allowed in chat." : error}
			</p>
		{/if}
	{/if}
</section>

<style>
	.chat {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.85rem;
		background: var(--white);
		border: var(--bw) solid var(--ink);
	}

	h2 {
		font-size: 1.2rem;
	}

	.log {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		max-height: 16rem;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	.log li {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		max-width: 85%;
		padding: 0.4rem 0.6rem;
		background: var(--accent);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}

	.log li.mine {
		align-self: flex-end;
	}

	.log b {
		font-size: 0.62rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.empty {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-muted);
	}

	form {
		display: flex;
		gap: 0.4rem;
	}

	input {
		flex: 1;
		min-width: 0;
		padding: 0.55rem 0.6rem;
		background: var(--cream);
		color: var(--ink);
		border: var(--bw-thin) solid var(--ink);
		font: inherit;
		font-size: 1rem;
	}

	.send {
		width: auto;
		padding: 0.5rem 0.9rem;
	}

	.error {
		margin: 0;
		padding: 0.4rem 0.6rem;
		background: var(--red);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.8rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
