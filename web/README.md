# The Pepper Dossier — web app

An interactive profile of reddit user **/u/newppinpoint** built on the pepper
archive: a scroll-driven dossier, a live /r/Chipotle feed where each post gets
an AI-generated reply in his voice, and a browsable archive of all 20,514 items.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · framer-motion ·
custom SVG + d3 charts · AI SDK v5 (Anthropic).

## Routes

| Route | Name | What it is |
|-------|------|-----------|
| `/` | The Dossier | 11-section scroll story — karma odometer, thermal-receipt linguistics, salsa timeline, karma waterfall, burrito-bowl topics, hours heatmap, downvote hall of fame, case-file facts, interlocutor constellation, voice guide |
| `/feed` | The Line | Live /r/Chipotle posts with a "What would newppinpoint say?" streamed reply per post |
| `/browse` | The Archive | Filterable/searchable explorer over all 20,514 items (defaults to Most Downvoted) |

## Data

All static data under `src/data/` and `public/data|media/` is generated from the
SQLite archive by a deterministic pipeline stage in the pepper package — never
edit it by hand:

```bash
# from the repo root
uv run pepper archive webexport      # or: just webexport
```

Re-running on an unchanged database is byte-identical (safe to commit).

## Local development

```bash
cp web/.env.example web/.env.local   # add ANTHROPIC_API_KEY at minimum
npm --prefix web install
npm --prefix web run dev
```

- **Reply generation** needs `ANTHROPIC_API_KEY`.
- **The live feed** hits Reddit. From a residential IP the public path usually
  works; from datacenter IPs (and often locally) Reddit 403s the public `.json`
  endpoints — set `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` (a "script" app at
  <https://old.reddit.com/prefs/apps>) to use app-only OAuth instead. Without
  Reddit access the feed degrades gracefully to an in-voice error state.

## Deploy (Vercel)

1. Import the repo; set **Root Directory = `web`**.
2. Set environment variables (see `.env.example`):
   - `ANTHROPIC_API_KEY` — required (replies).
   - `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` — strongly recommended (the
     live feed will not reach Reddit from Vercel's IPs without them).
   - `PERSONA_MODEL`, `DAILY_GENERATION_CAP` — optional cost controls.
   - `UPSTASH_REDIS_REST_URL` / `_TOKEN` — optional; enables a persistent reply
     cache + cross-instance rate limiting (add the Upstash integration).
3. Deploy. The dossier and archive are fully static; `/api/feed` and
   `/api/reply` are server functions.

Everything is display-only — the app never writes to Reddit, and generated
replies are clearly labeled AI parody.
