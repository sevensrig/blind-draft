/**
 * Loads the real stylesheet into the component test browser.
 *
 * `+layout.svelte` is what imports `app.css` in the app, and component tests
 * never render the layout — so without this they ran against components whose
 * design tokens were all undefined. Scoped styles applied, but every
 * `background: var(--accent)` resolved to nothing, which meant the axe contrast
 * assertions were measuring black text on a bare white body rather than on the
 * colours this app actually ships.
 *
 * With the tokens present those scans measure the real palette, and setting
 * `data-theme` in a test re-skins the component exactly as the picker does.
 */
import '../../app.css';
