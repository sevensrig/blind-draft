import type { HandleClientError } from '@sveltejs/kit';
import { initAnalytics } from '$lib/analytics';
import { initErrorTracking, reportError } from '$lib/analytics/errors';

export function init(): void {
	initErrorTracking();
	initAnalytics();
}

export const handleError: HandleClientError = ({ error }) => {
	reportError(error);
	console.error(error);
};
