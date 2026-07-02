# pepper

A Reddit bot for fast food and fast casual discussion — and the data foundation behind it.

This repo contains **`pepper archive`**, a reproducible pipeline that builds a complete local
archive of a single Reddit account (every post and comment obtainable) and produces an analytical
**persona dossier** from it. The dossier is intended to inform the pepper bot's voice and interests.

## Why more than the Reddit API

Reddit's API caps any user listing at **1,000 items**, so it can't return a full history on its own.
`pepper archive` merges four sources on the immutable Reddit fullname id (`t3_`/`t1_`):

| Source | Role |
|---|---|
| **GDPR/CCPA data export** | Authoritative complete list + original bodies (incl. deleted). Request at [reddit.com/settings/data-request](https://www.reddit.com/settings/data-request), drop the ZIP in `data/raw/gdpr/`. |
| **Reddit API (PRAW)** | Current scores/edits, newest activity, id hydration, comment-parent context. |
| **Arctic Shift** | Primary public archive — full history incl. deleted/removed original text, beyond the 1,000 cap. |
| **PullPush.io** | Secondary/fallback public archive. |

Merge is *pure*: each source sighting is stored append-only in `source_observations`, and the
canonical `items` row is recomputed from all of an item's observations. Re-runs are therefore
**idempotent** — safe to run any time to fetch only what's new and refresh scores.

## Quickstart

```bash
uv sync                       # install (add --extra dev for tests)
brew install ffmpeg           # for v.redd.it video+audio merging (optional)
cp .env.example .env          # then edit: username, Reddit OAuth, ANTHROPIC_API_KEY

uv run pepper archive init            # create data/ tree + database
# (optional) drop your GDPR export into data/raw/gdpr/
uv run pepper archive all --yes       # full pipeline end-to-end
```

Or run stages individually (each is re-runnable and idempotent):

```bash
uv run pepper archive import-gdpr     # ingest GDPR export if present (authoritative)
uv run pepper archive backfill        # full history from Arctic Shift (+ PullPush fallback)
uv run pepper archive fetch           # recent items + score refresh (needs Reddit API)
uv run pepper archive enrich          # hydrate current score/status for all items
uv run pepper archive context         # parent post + parent comment for each comment
uv run pepper archive media           # download images/galleries/videos locally
uv run pepper archive analyze         # activity/linguistic/topic/graph analysis
uv run pepper archive dossier         # LLM persona dossier (Anthropic Batch API; cost-gated)
uv run pepper archive report          # render dossier.md + dashboard.html
uv run pepper archive export --format parquet
uv run pepper archive status          # counts, watermarks, pipeline state
```

Outputs land in `data/dossier/` (`dossier.md`, `dashboard.html`) and `data/exports/`.

## Configuration

All config is environment-driven (see `.env.example`). Credentials are optional:

- **No Reddit API creds** → runs on public archives only (Arctic Shift + PullPush). History is still
  very complete; scores/status may lag and context can't be fetched.
- **No `ANTHROPIC_API_KEY`** → everything except the LLM dossier runs (stats/linguistics/topics/graph
  are fully local and free).

The dossier prints a cost estimate (Batch API, 50% discount) and waits for confirmation before
spending; pass `--yes` to skip the gate in automation.

## Reproducibility

- Pinned via `uv.lock` — `uv sync --frozen` reproduces the exact environment (`.python-version` = 3.14).
- Deterministic outputs: pure merge, exports sorted by `(type, created_utc, id)`, seeded topic
  clustering, dossier cached by corpus hash.
- All collected data, media, exports, dossier artifacts, and secrets are **gitignored**; only source
  code is committed.

## Data model

SQLite is the source of truth (`data/pepper.sqlite`):

- `items` — canonical corpus (submissions + comments), one row per fullname.
- `source_observations` — append-only per-source sightings (lossless; the merge basis).
- `context_items` / `context_links` — parents authored by others, kept separate from the subject's stats.
- `media_assets` / `item_media` — content-addressed media (sha256 dedup).
- `source_watermarks` — per-source incremental cursors.
- `llm_chunks` / `llm_dossier` — map/reduce cache + final dossier.

## Development

```bash
uv run pytest              # test suite
uv run ruff check src tests
just all                   # full pipeline via the task runner (see justfile)
```
