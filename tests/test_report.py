from __future__ import annotations

from pepper.archive.report import render_dashboard, render_markdown

_ANALYSIS = {
    "username": "newppinpoint",
    "stats": {
        "empty": False,
        "totals": {"items": 9207, "submissions": 207, "comments": 9000, "subreddits": 57,
                   "first_activity": "2020-06-17T00:46:26+00:00", "last_activity": "2026-07-01T18:46:12+00:00"},
        "subreddits": [{"subreddit": "Chipotle", "count": 3866, "avg_score": -2.35}],
        "timeline": [{"year_month": "2021-01", "count": 5, "submissions": 1, "comments": 4}],
        "heatmap": [{"weekday": 1, "hour": 12, "count": 3}],
        "karma": {"total_score": -2792, "avg_score": -0.3, "by_year": [{"year": 2021, "score": -10, "count": 5}]},
        "length": {"avg_words": 18.4},
        "top_posts": [], "top_comments": [], "status_breakdown": [], "activity_gaps": [],
    },
    "linguistic": {
        "empty": False,
        "vocabulary": {"total_words": 169682, "unique_words": 7418, "richness": 0.0437},
        "top_words": [{"word": "cheese", "count": 100}],
        "distinctive_bigrams": [{"phrase": "grilled cheese", "count": 50}],
        "distinctive_trigrams": [],
        "tone": {"question_ratio": 0.162, "exclamation_ratio": 0.059, "avg_words_per_item": 18.4},
        "readability": {"flesch_reading_ease": 71.9, "flesch_kincaid_grade": 7.6},
    },
    "topics": {"empty": False, "topics": [{"topic": 0, "size": 10, "terms": ["cheese", "order"]}], "over_time": []},
    "graph": {"empty": False, "metrics": {"distinct_interlocutors": 12}, "top_interlocutors": [{"author": "bob", "replies": 3, "subreddits": ["Chipotle"]}], "edges": []},
}

_DOSSIER = {
    "summary": "A fast-food superfan.",
    "interests": ["Chipotle", "Taco Bell"],
    "values": ["honesty", "value for money"],
    "opinions": ["grilled cheese burritos are elite"],
    "personality": ["opinionated"],
    "voice_guide": {"tone": "blunt", "quirks": ["lowercase"], "dos": ["be direct"], "donts": ["ramble"]},
    "biographical_facts": [
        {"category": "location", "value": "New Jersey", "confidence": "medium",
         "source_links": [{"id": "t1_abc", "permalink": "https://reddit.com/x"}]}
    ],
}


def test_markdown_renders_totals_and_values(tmp_path):
    out = render_markdown(_ANALYSIS, _DOSSIER, tmp_path / "dossier.md")
    text = out.read_text()
    assert "9207" in text  # totals['items'] resolved to the value, not a dict method
    assert "built-in method" not in text
    assert "honesty" in text  # dossier['values'] resolved
    assert "New Jersey" in text
    assert "https://reddit.com/x" in text  # cited permalink


def test_dashboard_renders_self_contained_html(tmp_path):
    out = render_dashboard(_ANALYSIS, _DOSSIER, tmp_path / "dashboard.html")
    html = out.read_text()
    assert "9207" in html
    assert "built-in method" not in html
    assert "plotly" in html.lower()  # inlined JS -> self-contained
    assert "Chipotle" in html


def test_report_handles_missing_dossier(tmp_path):
    out = render_markdown(_ANALYSIS, None, tmp_path / "d.md")
    text = out.read_text()
    assert "Not generated" in text
    assert "9207" in text
