# Development

How to run, test and deploy the $20 Draft Game. For what the game is, see the
[README](../README.md).

## Running it

```bash
npm install
```

```bash
npm run dev
```

Copy `.env.example` to `.env` to switch on online play (Supabase) and analytics
(PostHog). Without it, local and bot games still work and nothing is sent
anywhere.

`npm run check` is the single pre-push command: typecheck, lint, then every test.

## Scripts

| Script                   | What it does                                                |
| ------------------------ | ----------------------------------------------------------- |
| `npm run check`          | typecheck + lint + every test                               |
| `npm run typecheck`      | `tsc --noEmit` for modules, `svelte-check` for `.svelte`    |
| `npm run lint`           | Biome on `.ts`/`.js`/`.json`                                |
| `npm run format`         | Biome (everything) + Prettier (`.svelte` only), write mode  |
| `npm run format:check`   | Same pair, check-only                                       |
| `npm run test:unit`      | Vitest, the game engine in Node                             |
| `npm run test:component` | Vitest browser mode, components in real Chromium            |
| `npm run test:e2e`       | Playwright, full journeys against the built app             |
| `npm run test:a11y`      | axe at component and page level                             |
| `npm run test`           | unit → component → e2e                                      |
| `npm run coverage`       | Coverage report, scoped to the engine                       |
| `npm run test:load`      | k6 against the local Supabase stack                         |

### Load testing

```bash
brew install k6
npx supabase start && npx supabase functions serve --no-verify-jwt
SUPABASE_ANON_KEY=<printed anon key> npm run test:load
```

`PROFILE=stress` ramps to 100 concurrent games instead of 10. The script only
runs against localhost unless `ALLOW_REMOTE=1` is set.

## Code layout

```
src/lib/data/        content pools, one file per category
src/lib/game/        rules: a pure reducer (engine.ts), deck building, the store
src/lib/remote/      online rooms over Supabase
src/lib/components/  screens and UI pieces
src/routes/          home, online lobby and rooms, tutorial, FAQ, category guides
supabase/            migrations and Edge Functions
e2e/                 Playwright journeys
load/                k6 load test
```

Components never mutate state; they read `game.state` and call
`game.dispatch(action)`.

## Adding content

One file per category in `src/lib/data/`, each a plain array:

```ts
export const FOODS: ItemSeed[] = [
	{ name: 'Wood-fired pizza', tier: 'great' },
	{ name: 'Grilled cheese', tier: 'mid' }
];
```

`tier` is `bad | mid | good | great` and is never shown to players. NBA and NFL
items also carry a `position`. To add a category, create the data file and add
an entry to `CATEGORIES` in `src/lib/data/index.ts`. `npm test` fails if a pool
is too thin to fill both rosters.

## Deploying

### Vercel

Push to Vercel; `@sveltejs/adapter-auto` needs no config. A local build prints
"Could not detect a supported production environment", which is harmless.

Vercel Web Analytics must be enabled in the Vercel dashboard, or
`/_vercel/insights/script.js` 404s (it also 404s under `npm run preview`, which
is expected).

### PostHog

Set `PUBLIC_POSTHOG_KEY`. **Cookieless mode must also be enabled in the PostHog
project settings, or every event is dropped.**

### Supabase

The `deploy` job in `.github/workflows/ci.yml` runs on `main` when something
under `supabase/` changed: `supabase db push`, then `supabase functions deploy`.
Running CI by hand on `main` always deploys.

Repository secrets:

| Name                       | Used by                          |
| -------------------------- | -------------------------------- |
| `SUPABASE_ACCESS_TOKEN`    | deploy                           |
| `SUPABASE_PROJECT_REF`     | deploy                           |
| `SUPABASE_DB_PASSWORD`     | deploy                           |
| `PUBLIC_SUPABASE_URL`      | `supabase-keepalive.yml`         |
| `PUBLIC_SUPABASE_ANON_KEY` | `supabase-keepalive.yml`         |

Plus a repository **variable** `SUPABASE_TOKEN_EXPIRES` (`YYYY-MM-DD`).
`supabase-token.yml` fails from two weeks before that date. To rotate, make a
new token at <https://supabase.com/dashboard/account/tokens>, update the secret
and the date, and re-run the token check.

The keepalive workflow pings the free-tier project every third day so it
doesn't pause. It can't revive a paused project; that's a button in the
Supabase dashboard.

## Regenerating assets

```bash
node scripts/generate-og.mjs
```

Renders `static/og.png` (1200x630). Re-run after a palette change.

```bash
node scripts/extract-icons.mjs
```

Writes the inlined Font Awesome paths to `src/lib/icons.ts` from the `WANTED`
list in the script.

`SITE_URL` in `src/lib/site.ts` is the only place the domain is set.

## Attribution

Font Awesome Free icons are
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), © Fonticons, Inc.
Icon paths in `src/lib/icons.ts` are used under that licence; the Font Awesome
code is MIT.
