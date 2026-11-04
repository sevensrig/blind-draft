export type ShareMethod = 'image' | 'text' | 'clipboard';

/**
 * Must be called straight from the tap, with the image already rendered: iOS
 * Safari refuses `navigator.share` once anything has been awaited before it.
 * The full `text` only goes out when there's no image; with one, the card already
 * shows the rosters, so the short `caption` rides along instead.
 * Resolves to how it was shared, or null if the player backed out or nothing worked.
 */
export async function shareResults(
	text: string,
	image: File | null,
	caption: string
): Promise<ShareMethod | null> {
	const withImage = image ? { files: [image], text: caption } : null;
	try {
		if (withImage && navigator.canShare?.(withImage)) {
			await navigator.share(withImage);
			return 'image';
		}
		if (typeof navigator.share === 'function') {
			await navigator.share({ text });
			return 'text';
		}
	} catch (error) {
		// Dismissing the share sheet rejects with AbortError; that's a choice, not a failure.
		if (error instanceof DOMException && error.name === 'AbortError') return null;
	}
	try {
		await navigator.clipboard.writeText(text);
		return 'clipboard';
	} catch {
		return null;
	}
}
