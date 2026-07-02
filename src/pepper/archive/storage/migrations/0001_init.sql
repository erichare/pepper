-- Canonical DDL for the pepper archive. Applied by storage.db.apply_migrations.
-- Design: source_observations is append-only + lossless; the items row is a
-- pure function of an item's observations (recomputed on every upsert).

PRAGMA foreign_keys = ON;

-- ── provenance: one row per fetch/ingest invocation ──────────────
CREATE TABLE IF NOT EXISTS fetch_runs (
    run_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at     TEXT NOT NULL,
    finished_at    TEXT,
    command        TEXT NOT NULL,
    source         TEXT,
    args_json      TEXT,
    items_seen     INTEGER NOT NULL DEFAULT 0,
    items_upserted INTEGER NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'running',
    error          TEXT
);

-- ── canonical corpus (the subject's own authored content) ────────
CREATE TABLE IF NOT EXISTS items (
    id               TEXT PRIMARY KEY,
    type             TEXT NOT NULL CHECK (type IN ('submission','comment')),
    base36           TEXT NOT NULL,
    author           TEXT,
    author_fullname  TEXT,
    subreddit        TEXT,
    subreddit_id     TEXT,
    created_utc      INTEGER NOT NULL,
    retrieved_utc    INTEGER,
    title            TEXT,
    body             TEXT,
    body_source      TEXT,
    url              TEXT,
    permalink        TEXT,
    is_self          INTEGER,
    over_18          INTEGER,
    spoiler          INTEGER,
    link_id          TEXT,
    parent_id        TEXT,
    score            INTEGER,
    score_source     TEXT,
    num_comments     INTEGER,
    upvote_ratio     REAL,
    total_awards     INTEGER,
    edited_utc       INTEGER,
    status           TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (status IN ('active','deleted_by_user','removed_by_mod','unknown')),
    raw_json         TEXT,
    first_seen_utc   INTEGER NOT NULL,
    last_updated_utc INTEGER NOT NULL,
    sources_bitmask  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_items_type         ON items(type);
CREATE INDEX IF NOT EXISTS ix_items_subreddit    ON items(subreddit);
CREATE INDEX IF NOT EXISTS ix_items_created      ON items(created_utc);
CREATE INDEX IF NOT EXISTS ix_items_link         ON items(link_id);
CREATE INDEX IF NOT EXISTS ix_items_parent       ON items(parent_id);
CREATE INDEX IF NOT EXISTS ix_items_status       ON items(status);
CREATE INDEX IF NOT EXISTS ix_items_type_created ON items(type, created_utc);

-- ── per-record, per-source observations (append-only, lossless) ──
-- norm_json = serialized NormalizedItem (what merge reads).
-- raw_json  = the source's original payload (lossless retention).
CREATE TABLE IF NOT EXISTS source_observations (
    obs_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id            TEXT NOT NULL,
    item_scope         TEXT NOT NULL DEFAULT 'item' CHECK (item_scope IN ('item','context')),
    source             TEXT NOT NULL CHECK (source IN ('gdpr','praw','arcticshift','pullpush')),
    run_id             INTEGER NOT NULL REFERENCES fetch_runs(run_id),
    observed_utc       INTEGER NOT NULL,
    source_created_utc INTEGER,
    score              INTEGER,
    body               TEXT,
    title              TEXT,
    author             TEXT,
    status_hint        TEXT,
    edited_utc         INTEGER,
    norm_json          TEXT NOT NULL,
    raw_json           TEXT NOT NULL,
    -- one row per (item, source): re-fetching replaces it (latest wins), so the
    -- observation set is bounded and re-runs recompute an identical canonical row.
    UNIQUE(item_id, item_scope, source)
);
CREATE INDEX IF NOT EXISTS ix_obs_item   ON source_observations(item_id, item_scope);
CREATE INDEX IF NOT EXISTS ix_obs_source ON source_observations(source, observed_utc);

-- ── conversational context (parents authored by other users) ─────
CREATE TABLE IF NOT EXISTS context_items (
    id               TEXT PRIMARY KEY,
    type             TEXT NOT NULL CHECK (type IN ('submission','comment')),
    author           TEXT,
    subreddit        TEXT,
    created_utc      INTEGER,
    title            TEXT,
    body             TEXT,
    permalink        TEXT,
    status           TEXT NOT NULL DEFAULT 'unknown',
    raw_json         TEXT,
    first_seen_utc   INTEGER NOT NULL,
    last_updated_utc INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ctx_type ON context_items(type);

CREATE TABLE IF NOT EXISTS context_links (
    comment_id TEXT NOT NULL,
    context_id TEXT NOT NULL,
    relation   TEXT NOT NULL CHECK (relation IN ('link','parent')),
    PRIMARY KEY (comment_id, context_id, relation)
);

-- ── media ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_assets (
    sha256         TEXT PRIMARY KEY,
    kind           TEXT NOT NULL CHECK (kind IN ('image','video','gallery_image','audio','other')),
    ext            TEXT,
    bytes          INTEGER,
    width          INTEGER,
    height         INTEGER,
    duration_s     REAL,
    local_path     TEXT NOT NULL,
    downloaded_utc INTEGER NOT NULL,
    downloader     TEXT,
    has_audio      INTEGER
);

CREATE TABLE IF NOT EXISTS item_media (
    item_id         TEXT NOT NULL,
    item_scope      TEXT NOT NULL DEFAULT 'item' CHECK (item_scope IN ('item','context')),
    sha256          TEXT REFERENCES media_assets(sha256),
    source_url      TEXT NOT NULL,
    gallery_index   INTEGER,
    kind            TEXT,
    download_status TEXT NOT NULL DEFAULT 'ok'
                    CHECK (download_status IN ('ok','failed','skipped','link_rot')),
    error           TEXT,
    PRIMARY KEY (item_id, item_scope, source_url)
);
CREATE INDEX IF NOT EXISTS ix_item_media_item ON item_media(item_id, item_scope);

-- ── watermarks for cheap incremental re-runs ─────────────────────
CREATE TABLE IF NOT EXISTS source_watermarks (
    source             TEXT NOT NULL,
    stream             TEXT NOT NULL,
    newest_created_utc INTEGER,
    oldest_created_utc INTEGER,
    last_run_id        INTEGER,
    last_run_utc       INTEGER,
    PRIMARY KEY (source, stream)
);

-- ── LLM dossier artifacts (map cache + final reduce) ─────────────
CREATE TABLE IF NOT EXISTS llm_chunks (
    chunk_id       TEXT PRIMARY KEY,
    item_ids_json  TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    batch_id       TEXT,
    custom_id      TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    input_tokens   INTEGER,
    output_tokens  INTEGER,
    result_json    TEXT,
    created_utc    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_dossier (
    dossier_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_version TEXT NOT NULL,
    created_utc    INTEGER NOT NULL,
    corpus_hash    TEXT NOT NULL,
    result_json    TEXT NOT NULL,
    cost_usd_est   REAL,
    input_tokens   INTEGER,
    output_tokens  INTEGER
);
