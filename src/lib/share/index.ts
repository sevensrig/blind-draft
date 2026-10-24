export type ShareMethod = 'image' | 'text' | 'clipboard';

/**
 * Must be called straight from the tap, with the image already rendered: iOS
 * Safari refuses `navigator.share` once anything has been awaited before it.
 * Resolves to how it was shared, or null if the player backed out or nothing worked.
 */
export async function shareResults(text: string, image: File | null): Promise<ShareMethod | null> {
	const withImage = image ? { files: [image], text } : null;
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
