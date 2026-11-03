<script lang="ts">
	import { FEEDBACK_URL } from '$lib/site';
</script>

<!-- End of a game is when players have opinions, so ask there rather than only on setup. -->
<p class="feedback">
	Hated a card? Missing a category?
	<a href={FEEDBACK_URL} target="_blank" rel="noopener">Send feedback</a>
</p>

<style>
	.feedback {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.3rem 0.5rem;
		font-size: 0.72rem;
		font-weight: 700;
		text-align: center;
	}

	a {
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink);
	}
</style>
