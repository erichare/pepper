from __future__ import annotations

import json

from pepper.archive.models import ItemType
from pepper.archive.storage import export_all

from .conftest import make_norm


def test_export_json_roundtrips_counts(repo, conn, settings):
    run = repo.start_run("backfill", source="arcticshift")
    repo.upsert_items(
        [
            make_norm(fullname="t3_a", item_type=ItemType.SUBMISSION, source="arcticshift", observed_utc=1, title="t", body="b"),
            make_norm(fullname="t1_b", item_type=ItemType.COMMENT, source="arcticshift", observed_utc=1, body="c"),
        ],
        run,
    )
    files = export_all(settings.db_path, settings.exports_dir, fmt="json")
    names = {f.name for f in files}
    assert "items.json" in names

    items = json.loads((settings.exports_dir / "items.json").read_text())
    assert len(items) == 2
    # deterministic ordering: submissions/comments sorted by (type, created_utc, id)
    assert [i["id"] for i in items] == ["t1_b", "t3_a"]


def test_export_parquet_writes_files(repo, conn, settings):
    run = repo.start_run("backfill", source="arcticshift")
    repo.upsert_items(
        [make_norm(fullname="t3_a", item_type=ItemType.SUBMISSION, source="arcticshift", observed_utc=1, title="t", body="b")],
        run,
    )
    files = export_all(settings.db_path, settings.exports_dir, fmt="parquet")
    assert any(f.name == "items.parquet" and f.exists() for f in files)
