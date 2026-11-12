<div align="center">

<a href="https://www.20dollardraftgame.com/"><img src="docs/readme/banner.svg" alt="$20 Draft: two players, $20 each, bidding blind" width="100%"></a>

<br>

<a href="https://www.20dollardraftgame.com/"><img src="https://img.shields.io/badge/%E2%96%B6%20PLAY%20NOW-20dollardraftgame.com-6bcf7d?style=for-the-badge&labelColor=000000" alt="Play now at 20dollardraftgame.com"></a>

<img src="https://img.shields.io/badge/price-free-ffd93d?style=flat-square&labelColor=000000" alt="Free">
<img src="https://img.shields.io/badge/account-not%20needed-c4b5fd?style=flat-square&labelColor=000000" alt="No account needed">
<img src="https://img.shields.io/badge/categories-18-8ecae6?style=flat-square&labelColor=000000" alt="18 categories">
<img src="https://img.shields.io/badge/modes-local%20%C2%B7%20online%20%C2%B7%20bot-ff6b6b?style=flat-square&labelColor=000000" alt="Local, online and bot modes">
<a href="https://github.com/sevensrig/blind-draft/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/sevensrig/blind-draft/ci.yml?branch=main&style=flat-square&labelColor=000000&label=CI" alt="CI status"></a>

### The $20 draft from TikTok, as a real game.

Two players. $20 each. A deck nobody has seen.<br>
**Do you blow it all on the first card, or wait for something better?**

</div>

<br>

<table>
<tr>
<td width="33%" align="center"><img src="docs/readme/setup.png" alt="Setup screen: pick names, budget and category"></td>
<td width="33%" align="center"><img src="docs/readme/bid.png" alt="Bid screen: Shai Gilgeous-Alexander on the block, Alex leading at $4"></td>
<td width="33%" align="center"><img src="docs/readme/results.png" alt="Results: both rosters with prices paid and points"></td>
</tr>
<tr>
<td align="center"><b>1 · Pick a category</b><br><sub>NBA, movies, snacks, or your own list</sub></td>
<td align="center"><b>2 · Bid blind</b><br><sub>raise, hold, or go all in</sub></td>
<td align="center"><b>3 · Argue about it</b><br><sub>scored rosters, ready to share</sub></td>
</tr>
</table>

## 🃏 How it plays

> [!TIP]
> **The whole game in one line:** a card flips, you both bid, highest bid takes it, repeat until both rosters are full.

- 💸 **Bid blind.** Either player opens at $1. Raises go back and forth until someone stops.
- 🔥 **Go broke if you want.** Nothing stops you spending $19 on the first card you love. Once you're out, your opponent names their price on everything after.
- 🏆 **Build the better lineup.** Rosters are scored on real stats and expert opinion, with a bonus for steals. Then you screenshot it and argue.

## 🎮 Ways to play

<table>
<tr>
<td width="33%" valign="top">

### 📱 One phone
Pass it back and forth, or one person runs the game while two people shout bids across the room.

</td>
<td width="33%" valign="top">

### 🌐 Online
Two phones, two places. Share a room code or browse open rooms and jump in.

</td>
<td width="33%" valign="top">

### 🤖 Vs. the bot
Plays from what it can see: the card, both wallets, what's gone by. Never the deck.

</td>
</tr>
</table>

## 🗂️ Categories

| | |
| --- | --- |
| 🏀 **Sports** | NBA · NFL · MLB · NHL, current or all-time, plus soccer from Fox Sports' World Cup 2026 top 100. NBA and NFL draft a real starting lineup by position. |
| 📺 **Nostalgia** | Childhood cartoons · TV shows · childhood stuff · fictional duos |
| 🎬 **Screen & people** | Iconic movies · celebrities |
| 🍕 **Food** | Foods · drinks · desserts · pizza toppings · Trader Joe's |
| ☀️ **Just vibes** | Your perfect life · the perfect summer day |
| ✏️ **Make your own** | Type any list and draft it |

## ⚙️ Under the hood

<div align="center">

<img src="https://img.shields.io/badge/SvelteKit-000000?style=for-the-badge&logo=svelte&logoColor=ff3e00" alt="SvelteKit">
<img src="https://img.shields.io/badge/TypeScript-000000?style=for-the-badge&logo=typescript&logoColor=3178c6" alt="TypeScript">
<img src="https://img.shields.io/badge/Supabase-000000?style=for-the-badge&logo=supabase&logoColor=3ecf8e" alt="Supabase">
<img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=ffffff" alt="Vercel">
<img src="https://img.shields.io/badge/Playwright-000000?style=for-the-badge&logo=playwright&logoColor=2ead33" alt="Playwright">
<img src="https://img.shields.io/badge/Vitest-000000?style=for-the-badge&logo=vitest&logoColor=6e9f18" alt="Vitest">
<img src="https://img.shields.io/badge/PostHog-000000?style=for-the-badge&logo=posthog&logoColor=f9bd2b" alt="PostHog">

</div>

Built solo and shipped to real players.

- 🧠 **One pure rules engine.** The whole rulebook is a single reducer. The UI only dispatches actions, so the same engine runs local games, the bot, and online rooms.
- 🔒 **Online play that can't be peeked.** Supabase Edge Functions own the game state, Realtime keeps both phones in sync, and row-level security means neither player can see the deck.
- 🧪 **Tested like it matters.** 100% line coverage on the engine, a fuzz suite that plays hundreds of full games, component tests in real Chromium, Playwright runs against the production build, axe accessibility checks, and k6 load tests on the backend.
- 🕵️ **Privacy-first analytics.** PostHog in cookieless mode: no consent banner, and player names and room codes never leave the device.
- 🎨 **Neo-brutalist design.** Hard shadows, thick borders, and every colour checked for WCAG AA contrast.

> Want to run it locally or contribute? See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

## 💬 Feedback

Hated a card? Missing a category?
**[Send feedback](https://docs.google.com/forms/d/e/1FAIpQLScjDk1NuuvdJtVEwnNNnEWmG6MmhVPZ3vgq9xIG12fiyQrRoQ/viewform)** or **[open an issue](https://github.com/sevensrig/blind-draft/issues)**.

<div align="center">
<br>
<a href="https://www.20dollardraftgame.com/"><img src="https://img.shields.io/badge/%E2%96%B6%20START%20A%20DRAFT-6bcf7d?style=for-the-badge&labelColor=000000" alt="Start a draft"></a>
</div>
