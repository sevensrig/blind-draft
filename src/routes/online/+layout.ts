/**
 * Rooms are live data, so these render as an empty shell and fill in from
 * Supabase in the browser. Prerendering the shell keeps the deploy static.
 */
export const prerender = true;
export const ssr = false;
