<script lang="ts">
	import { CHAT_MAX, containsSlur } from '$lib/data/moderation';
	import type { ChatMessage } from '$lib/remote/types';

	interface Props {
		seat: 0 | 1;
		names: [string, string];
		messages: ChatMessage[];
		/** Rejects with a readable message when the server refuses. */
		send: (text: string) => Promise<void>;
		/** The other player has typed in the last few seconds. */
		opponentTyping?: boolean;
		/** Called on every keystroke; the caller decides how often to pass it on. */
		onTyping?: () => void;
	}

	let { seat, names, messages, send, opponentTyping = false, onTyping }: Props = $props();

	let draft = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let log = $state<HTMLOListElement | null>(null);

	const opponent = $derived(seat === 0 ? 1 : 0);
	// Only a warning: `room-chat` is what actually refuses it.
	const blocked = $derived(containsSlur(draft));

	$effect(() => {
		void messages.length;
		void opponentTyping;
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

	{#if messages.length || opponentTyping}
		<ol class="log" bind:this={log} aria-live="polite">
			{#each messages as message (message.id)}
				<li
					class:mine={message.seat === seat}
					style:--accent={message.seat === 0 ? 'var(--p1)' : 'var(--p2)'}
				>
					<!-- Like a text thread: your own messages need no name, just your colour. -->
					{#if message.seat === seat}
						<span class="sr-only">You:</span>
					{:else}
						<b>{names[message.seat]}</b>
					{/if}
					<span>{message.body}</span>
				</li>
			{/each}
			{#if opponentTyping}
				<li class="typing" style:--accent={opponent === 0 ? 'var(--p1)' : 'var(--p2)'}>
					<b>{names[opponent]}</b>
					<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
					<span class="sr-only">is typing</span>
				</li>
			{/if}
		</ol>
	{:else}
		<p class="empty">Who won the draft? Make your case.</p>
	{/if}

	<form onsubmit={submit}>
		<label class="sr-only" for="chat-input">Message</label>
		<input
			id="chat-input"
			bind:value={draft}
			oninput={() => onTyping?.()}
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
		gap: 0.85rem;
		max-height: 16rem;
		margin: 0;
		/* Room under the last bubble for its tail, which the scroll box would clip. */
		padding: 0 0 0.75rem;
		overflow-y: auto;
		list-style: none;
	}

	.log li {
		--fill: var(--white);
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		align-self: flex-start;
		max-width: 85%;
		padding: 0.4rem 0.6rem;
		background: var(--fill);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}

	.log li.mine {
		--fill: var(--accent);
		align-self: flex-end;
	}

	/*
	 * The tail: a black triangle under the bubble's corner, with a smaller one in
	 * the bubble's fill laid over it so the outline runs unbroken round the tail.
	 * The inner one starts inside the border, which is what erases the bottom edge
	 * where they join.
	 */
	.log li::before,
	.log li::after {
		content: '';
		position: absolute;
		left: calc(-1 * var(--bw-thin));
		bottom: -12px;
		border-top: 12px solid var(--ink);
		border-right: 12px solid transparent;
	}

	.log li::after {
		left: 0;
		bottom: -7px;
		border-top: 9px solid var(--fill);
		border-right: 9px solid transparent;
	}

	.log li.mine::before,
	.log li.mine::after {
		right: calc(-1 * var(--bw-thin));
		left: auto;
		border-right: 0;
		border-left: 12px solid transparent;
	}

	.log li.mine::after {
		right: 0;
		border-left-width: 9px;
	}

	/* The player's colour lives on the name tag only; the message stays white. */
	.log b {
		align-self: flex-start;
		padding: 0.05rem 0.3rem;
		background: var(--accent);
		border: var(--bw-thin) solid var(--ink);
		font-size: 0.62rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.dots {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem 0;
	}

	.dots i {
		width: 0.45rem;
		height: 0.45rem;
		background: var(--ink);
		animation: blink 900ms steps(1) infinite;
	}

	.dots i:nth-child(2) {
		animation-delay: 300ms;
	}

	.dots i:nth-child(3) {
		animation-delay: 600ms;
	}

	/* Stepped, not eased: each dot is either lit or not. */
	@keyframes blink {
		0% {
			opacity: 1;
		}
		33% {
			opacity: 0.25;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dots i {
			animation: none;
		}
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
