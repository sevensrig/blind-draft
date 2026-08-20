# $20 Blind Draft

A two-player blind bidding draft. One phone, one shuffled deck of items nobody
has seen, and a budget you can absolutely set on fire chasing the first thing
you like.

Pass-and-play, or one person holds the phone as game master and taps in bids for
two people arguing out loud. Same mode either way.

## Running it

```bash
npm install
```

```bash
npm run dev
```

`npm run check` is the single pre-push command: typecheck, lint, then every test.
See [Testing and quality tooling](#testing-and-quality-tooling) for the rest.

## Deploying

Push it to Vercel. `@sveltejs/adapter-auto` detects the platform and there is
nothing to configure. The page is prerendered (`src/routes/+layout.ts`) and all
state lives in the browser, so the deploy is a static shell — no server, no
database, no runtime network calls of any kind. Building locally prints
"Could not detect a supported production environment", which is just
adapter-auto saying your laptop isn't Vercel; the build itself is fine.

## How a game plays

1. **Setup** — names, budget (default $20), roster slots each (default 5), and a
   category. Sports categories have a Current / All-Time toggle.
2. **Deck** — exactly `2 x slots` items are sampled and shuffled, so the deck
   covers both rosters precisely and every item ends up owned.
3. **Reveal** — tap the card. Neither player knew what was coming.
4. **Bid** — no turn order. Either player opens at $1 or more, then it's raises
   of at least $1 back and forth until one stops. Tap *Sold* to close it.
5. **Broke** — nothing stops you bidding to $0 with slots still empty. That is
   the point. Once you're out, your opponent just names a price on everything
   after; anything they pass on is yours for free.
6. **Both broke** — the rest are handed out free, strictly alternating.
7. **Results** — both rosters with prices paid, laid out to screenshot.

## Positional rosters (NBA and NFL)

Those two categories lock the roster and draft by position:

- **NBA** — a starting five: PG, SG, SF, PF, C.
- **NFL** — QB, RB, WR, WR, FLEX.

The positions shape the **deck**, not the rules. A starting-five deck stocks
exactly two players for each slot, so a realistic five is always buildable. But
**any player can go in any open slot** — a won player lands in the slot they
naturally suit, and the winner can move them anywhere still open, so starting
Shaq at point guard is one tap.

That's deliberate: gating slots by position would mean the second centre could
only ever go to whoever still needed one, handing out half the deck uncontested
and draining the bidding of tension. Free placement keeps every item contested
and turns "where do I put him" into its own decision.

Everything else — budget, the fallback rules, the deck curve — behaves the same.
`FLEX` and `WR` are just labels; they don't restrict anything.

Three spec gaps were resolved by decision rather than guess, and are worth
knowing because they shape the endgame:

- The `good` tier splits the 60–70% middle band with `mid`, weighted so `mid`
  still dominates (it's the hesitation zone).
- If one roster fills while items remain, the other player takes the rest
  **free** — there is nothing left to compete over.
- Opening a bid is **mandatory** while both players are solvent. Deck size
  equals total roster slots, so every item must find an owner.

## Editing the content

One file per category in `src/lib/data/`, each a plain array you can edit by
hand:

```ts
export const FOODS: ItemSeed[] = [
	{ name: 'Wood-fired pizza', tier: 'great' },
	{ name: 'Grilled cheese', tier: 'mid' }
];
```

`tier` is one of `bad | mid | good | great` and is **never shown to players** —
it only shapes the deck curve. An item's real value is whatever someone bids.
Ids are generated from the name, so you only write names and tiers.

NBA and NFL items carry a `position` too (`{ name, tier, position }`). Keep at
least ~8 per position in each pool: the deck needs two of every position, and
`npm test` fails if a pool can't supply them. NFL pools are offence-only, since
the requested roster has no defensive slot.

Every pool holds roughly 47–55 items so repeated games in one category don't
repeat themselves. Keep at least ~8 per tier and you'll stay clear of the
curve's fallbacks; `npm test` fuzzes 40 full games per pool and will tell you if
a pool gets too thin to fill both rosters.

Two content rules matter more than anything else, because both were learned the
hard way:

1. **Recognition is the floor, in every tier.** An item nobody at the table
   recognizes kills the round — there's nothing to argue about. `bad` means
   *famous and disappointing*, never unknown. Luke Kennard is a good `bad` card;
   an obscure bench player is not a card at all.
2. **Keep names to 1–4 words.** These get shouted across a room. "Baja Blast"
   works; "iced coffee you forgot about for three hours" dies out loud.

The audience is 14–26, so the nostalgia window is roughly a 2008–2020 childhood
and all-time sports pools should stick to legends whose names are genuinely
universal.

To add a category, create the data file and add one entry to `CATEGORIES` in
`src/lib/data/index.ts`. Two or more `variants` automatically renders a toggle.

Real-people categories are names-only as plain text by design — no photos,
logos, or team branding.

## Code layout

```
src/lib/data/      content pools, one file per category
src/lib/game/
  types.ts         GameState + the Action union
  engine.ts        the entire rulebook as one pure reducer
  deck.ts          sampling, the tier curve, finale weighting
  store.svelte.ts  the only seam between UI and rules
  persist.ts       localStorage, so a mid-game refresh doesn't lose the draft
src/lib/components/  SetupScreen, BidScreen, ResultsScreen
```

`engine.ts` is pure and knows nothing about Svelte or the DOM. Components never
mutate state; they read `game.state` and call `game.dispatch(action)`.

### Tier 2: two devices over Supabase

The seam is deliberate. Actions are plain serialisable data and the reducer is
pure, so adding real-time 2-device play means changing one file:

- `dispatch()` broadcasts the action (or writes it to a table) instead of
  applying it locally.
- A subscription calls the existing `game.replace(state)` with whatever the
  server says is authoritative.

No component changes, because no component knows how state travels. The rules
stay in one testable place either way.

## Testing and quality tooling

```bash
npm run check
```

That's typecheck + lint + every test, and it's the one command worth running
before you push. The pieces individually:

| Script                  | What it does                                                |
| ----------------------- | ----------------------------------------------------------- |
| `npm run typecheck`     | `tsc --noEmit` for modules, `svelte-check` for `.svelte`     |
| `npm run lint`          | Biome on `.ts`/`.js`/`.json`                                 |
| `npm run format`        | Biome (everything) + Prettier (`.svelte` only), write mode   |
| `npm run format:check`  | Same pair, check-only                                        |
| `npm run test:unit`     | Vitest, the game engine in Node                              |
| `npm run test:component`| Vitest browser mode, components in real Chromium             |
| `npm run test:e2e`      | Playwright, full journeys against the built app              |
| `npm run test:a11y`     | axe at both levels, for iterating on a11y alone              |
| `npm run test`          | unit → component → e2e (a11y included in the last two)       |
| `npm run coverage`      | Coverage report, scoped to the engine                        |

### The shape of the suite

**Unit (Vitest, Node).** The rulebook is a pure reducer, so this is where the
tricky rules live: deck size and tier ratios across hundreds of builds, the
probabilistic polarised ending, bid/raise/sold resolution, both fallback rules,
and a fuzz suite that plays 40 full games per content pool sweeping budgets,
roster sizes and bidding aggression. The fuzz test is the one that actually
guarantees no line of play can strand a player with an unfillable roster.

**Component (`vitest-browser-svelte`, real Chromium).** Real browser rather than
jsdom, so computed styles and pointer events are genuine — which matters because
the axe contrast checks need real rendering. Components read the shared store, so
tests seed state via `game.replace()`, the same seam Tier 2 would use for
server-pushed state. Fixtures in `src/lib/testing/fixtures.ts` are built by
running real actions through the reducer, so a fixture can't describe a state the
rules wouldn't produce.

**E2E (Playwright).** Runs against `build` + `preview`, not `vite dev`. That's
deliberate: the worst bug this app has shipped was a hydration crash visible only
in the built output, where the prerendered HTML rendered perfectly and every
control was dead. The journeys cover a full game, both fallback paths, setup
choices changing the game shape, a positional draft, mid-game reload recovery,
and quitting.

### Coverage

Scoped to `src/lib/game/**` rather than a repo-wide number, which would just be
padded by markup and config. Lines and functions are held at **100%** — every
function in the rulebook executes. Statements and branches sit slightly lower
(engine 90/87) because the reducer is full of defensive guards for states it
can't actually reach; forcing those to 100 would mean asserting against
impossible inputs, which tests the guard rather than the game. `store.svelte.ts`
is excluded from this Node run and covered by the component and E2E suites.

### Accessibility

axe-core runs at two levels, and violations are treated as bugs rather than
suppressed:

- **Component level** — each component scanned in isolation, so a violation
  points at the component that owns it. Includes the states where regressions
  hide: a standing bid disabling and inverting the holder's button, the
  broke-player fallback, the award slot picker.
- **Page level** — the assembled routes via `@axe-core/playwright`, where
  document-scoped rules (landmarks, headings, title) actually apply.

This found two real WCAG AA failures on first run, both mine: de-emphasised text
using `opacity` on black landed at 3.36:1 and 3.94:1 against the cream
background, under the 4.5:1 minimum. Fixed by adding an `--ink-muted` token that
measures ~5:1. **Don't reach for `opacity` to mute text in this palette** — it
looks fine and quietly fails.

### Known gap: Biome doesn't lint `.svelte`

Biome's Svelte support is **experimental**. It has no parser for Svelte template
syntax, so it can't see `{#if}` / `{#each}` blocks, and the docs recommend
disabling `noUnusedVariables`, `noUnusedImports`, `useConst` and `useImportType`
for `.svelte` files — which is most of the value.

Rather than pretend, the split is explicit:

- **Biome** owns `.ts` / `.js` / `.json`: lint and format, full recommended rule
  set. Verified by planting violations and confirming they're caught.
- **Prettier + `prettier-plugin-svelte`** owns `.svelte` files, formatting only.
  `.prettierignore` restricts it to `src/**/*.svelte` so the two never fight.

The honest consequence: **`.svelte` markup gets no linting**, only formatting.
Biome's accessibility rules are also JSX/HTML-attribute oriented, so with all
markup living in excluded `.svelte` files they contribute effectively nothing
here — a11y coverage comes from axe at two levels plus `svelte-check`, which does
report Svelte's own `a11y_*` warnings on markup. Treat that as the a11y linter.

Worth revisiting once Biome ships a real Svelte parser; at that point Prettier
can probably go.

## Metadata and sharing

`src/lib/site.ts` holds the origin, description and card paths. **`SITE_URL` is the
only thing to change when the real domain is set** — the canonical link, Open
Graph tags, JSON-LD and sitemap all read from it, and `robots.txt` and
`sitemap.xml` are prerendered routes rather than static files precisely so a
hardcoded domain can't rot in a corner.

The social card is generated, not hand-drawn:

```bash
node scripts/generate-og.mjs
```

That renders HTML with the app's own tokens and screenshots it to
`static/og.png` at 1200x630 using the Playwright browser already installed for
the E2E suite. Re-run it after a palette change so the card doesn't drift from
the app.

Two deliberate choices worth knowing. Nothing player-entered goes in the page
head — a custom category name is arbitrary text and belongs nowhere near
metadata. And `robots.txt` disallows nothing, AI crawlers included: being
readable by them is the whole on-site half of getting cited by answer engines.

`e2e/metadata.spec.ts` covers all of it against the built output, because
metadata is uniquely prone to silent rot — nothing on screen breaks when an OG
tag disappears, and the cost only shows up as a dead link preview months later.

## Styling

Neo-brutalism: cream canvas, 4px black borders, hard offset shadows with no
blur, zero radius, no gradients, and a mechanical press that slides a control
onto its own shadow. Palette and rules follow the "Neo Brutalism (Mobile)" spec
from [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).

### The accent palette

Six accents, every one carrying black text at well over 4.5:1 — that's what lets
the system put ink straight onto colour with no light/dark variants:

| Token      | Colour        | Means                                          |
| ---------- | ------------- | ---------------------------------------------- |
| `--red`    | Hot red       | Live progress tick, positions, alerts          |
| `--yellow` | Vivid yellow  | Player 2, tags and badges                      |
| `--violet` | Soft violet   | Player 1, face-down card, rule banners         |
| `--green`  | Pastel green  | Money (aliased as `--money`)                   |
| `--blue`   | Pastel blue   | Primary buttons and the play-online signpost   |
| `--orange` | Vivid orange  | Sports categories, the top-price stat          |

Three conventions worth keeping:

- **Primary buttons are blue, never red.** Red reads as stop or delete, which made
  the most important control on every screen the one players hesitated over. Red
  still carries the live progress tick, position tags and error banners — things
  that report rather than invite a tap. Don't put it back on a button.
- **`--blue` is for things you tap, and nothing else.** It briefly accented the
  sports categories and the top-price stat as well, which put pale blue on nearly
  every screen and cost the button the contrast that makes it read as the thing to
  press. `--orange` took those over. Blue still covers the play-online signpost,
  since that's a control too — it just isn't a `.btn`. Don't spend blue on
  decoration.

- **Green means money, and only money.** It's aliased to `--money` and used for
  the standing bid and the amount dial. Yellow used to do this job as well as
  being Player 2's identity, which made the bid screen ambiguous — the same
  colour meant both "Alex" and "dollars".
- **Categories carry their own accent**, set as a required `accent` field on each
  entry in `src/lib/data/index.ts` and grouped by theme (sports orange, childhood
  violet, screen and people red, food and drink green, abstract yellow). Tiles
  stay white with a coloured icon chip and flood with their own accent when
  selected. The field is required, so a new category can't ship colourless.

If you add an accent, add it to `:root` in `src/app.css` and run
`npm run test:a11y` — axe checks contrast at both component and page level and
will fail if the new colour can't carry black text.

One deviation: that spec asks for Space Grotesk, but loading a web font would be
a runtime network request, which this build rules out. Space Grotesk sits first
in the stack so it's used when installed locally, otherwise the heavy system
face carries it.

### Icons

Category tiles use Font Awesome Free glyphs, but **inlined as SVG paths** rather
than loaded as a webfont or from a CDN. `src/lib/icons.ts` is generated by
`node scripts/extract-icons.mjs`, which reads the real SVG source out of the
`@fortawesome/fontawesome-free` devDependency and writes out just the paths we
use — 8KB for fourteen icons, against roughly 1.4MB of font files plus a CSS
framework for the same result. Nothing from the package reaches the browser.

Same reasoning as the font decision: a CDN `<link>` would be a third-party
runtime request. Inlining also means the glyphs inherit `currentColor`, so they
sit on the accent chips as plain black ink like everything else in this style.

To add or change an icon, edit the `WANTED` list in the script, re-run it, and
point the category's `icon` field at the new name. `Icon.svelte` renders them
`aria-hidden` by default, since every current use sits beside a visible text
label and announcing "basketball" before "NBA Players" is just noise.

**Attribution** — Font Awesome Free icons are
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), © Fonticons, Inc.
Icon paths in `src/lib/icons.ts` are used under that licence; the Font Awesome
code is MIT.
