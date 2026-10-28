import { error } from '@sveltejs/kit';
import { CATEGORIES, getCategory } from '$lib/data';
import { CATEGORY_COPY } from '$lib/seo';
import type { EntryGenerator, PageLoad } from './$types';

export const prerender = true;

/**
 * The only paths generated. A root-level `[category]` would otherwise match any
 * unknown top-level URL; listing entries explicitly means the static host 404s
 * everything else, and `/online`, `/robots.txt` and `/sitemap.xml` keep winning
 * as static routes.
 */
export const entries: EntryGenerator = () =>
	CATEGORIES.filter((entry) => !entry.custom).map((entry) => ({ category: entry.id }));

export const load: PageLoad = ({ params }) => {
	const category = getCategory(params.category);
	const copy = CATEGORY_COPY[params.category];
	// Custom has no bundled pool, so there's nothing to write a page about.
	if (!category || category.custom || !copy) error(404, 'No such category');
	return { category, copy };
};
