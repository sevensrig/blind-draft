import type { HandleClientError } from '@sveltejs/kit';
import { initAnalytics, reportError } from '$lib/analytics';

export function init(): void {
	initAnalytics();
}

export const handleError: HandleClientError = ({ error }) => {
	reportError(error);
	console.error(error);
};
