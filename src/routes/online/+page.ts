/**
 * Overrides the `ssr = false` in `online/+layout.ts`, which exists for the live
 * room pages. This page is a static form, so rendering it at build time is what
 * gives it a title, a description and copy a crawler can read — without it the
 * prerendered file had no `<head>` tags at all.
 */
export const ssr = true;
export const prerender = true;
