# pepper archive task runner — thin wrappers over the CLI.
# Install `just` (https://github.com/casey/just) or run the `uv run` commands directly.

set dotenv-load := true

default:
    @just --list

# install dependencies (add dev tools)
setup:
    uv sync --extra dev

# create data tree + database
init:
    uv run pepper archive init

# ingest a GDPR export dropped into data/raw/gdpr/
import-gdpr:
    uv run pepper archive import-gdpr

# full history from public archives
backfill source="auto":
    uv run pepper archive backfill --source {{source}}

# recent items + score refresh (needs Reddit API creds)
fetch:
    uv run pepper archive fetch

# hydrate current score/status for all items
enrich:
    uv run pepper archive enrich

# parent post + parent comment for each comment
context:
    uv run pepper archive context

# download media locally
media scope="own":
    uv run pepper archive media --scope {{scope}}

# compute analysis
analyze:
    uv run pepper archive analyze

# LLM persona dossier (cost-gated; pass yes=--yes to skip the gate)
dossier yes="":
    uv run pepper archive dossier {{yes}}

# render dossier.md + dashboard.html
report:
    uv run pepper archive report

# export tables
export fmt="parquet":
    uv run pepper archive export --format {{fmt}}

# emit JSON + media for the Next.js app in web/
webexport:
    uv run pepper archive webexport

# pipeline status
status:
    uv run pepper archive status

# full pipeline end-to-end (pass yes=--yes to run the dossier too)
all yes="":
    uv run pepper archive all {{yes}}

# tests + lint
test:
    uv run pytest

lint:
    uv run ruff check src tests

check: lint test
