from __future__ import annotations

from pepper.archive.llm.batch import _normalize_dossier, _normalize_map_findings, digest_findings


def test_digest_findings_dedupes_ranks_and_unions_fact_sources():
    findings = [
        {"interests": ["Chipotle", "Pokemon Go"], "opinions": [], "values": ["value for money"],
         "voice_traits": ["blunt"],
         "claimed_facts": [{"category": "job", "value": "Chipotle employee", "confidence": "high", "source_id": "t1_a"}]},
        {"interests": ["chipotle", "Taco Bell"], "opinions": [], "values": [],
         "voice_traits": ["blunt", "sarcastic"],
         "claimed_facts": [{"category": "job", "value": "chipotle employee", "confidence": "high", "source_id": "t1_b"}]},
    ]
    d = digest_findings(findings)
    # 'Chipotle' mentioned in both chunks (case-insensitive) -> ranked first
    assert d["interests"][0].lower() == "chipotle"
    assert "blunt" in [v.lower() for v in d["voice_traits"]]
    # identical job fact consolidated to one, unioning both source ids
    jobs = [f for f in d["claimed_facts"] if f["category"] == "job"]
    assert len(jobs) == 1
    assert set(jobs[0]["sources"]) == {"t1_a", "t1_b"}


def test_digest_findings_is_bounded():
    findings = [{"interests": [f"i{i}" for i in range(100)], "opinions": [], "values": [],
                 "voice_traits": [], "claimed_facts": []}]
    d = digest_findings(findings)
    assert len(d["interests"]) <= 30


def test_normalize_dossier_defaults_missing_fields():
    # model returned only 3 of 7 fields (the empty-dossier bug shape)
    partial = {"interests": ["a"], "opinions": ["b"], "biographical_facts": [{"value": "x"}]}
    d = _normalize_dossier(partial)
    assert d["summary"] == ""
    assert d["values"] == []
    assert d["personality"] == []
    assert isinstance(d["voice_guide"], dict)
    assert d["voice_guide"]["tone"] == ""
    for k in ("quirks", "vocabulary", "dos", "donts", "example_openers"):
        assert d["voice_guide"][k] == []
    # existing content preserved; facts gain a sources list
    assert d["interests"] == ["a"]
    assert d["biographical_facts"] == [{"value": "x", "sources": []}]


def test_normalize_dossier_drops_non_dict_facts():
    d = _normalize_dossier({"biographical_facts": ["a bare string", {"value": "y"}]})
    assert d["biographical_facts"] == [{"value": "y", "sources": []}]


def test_normalize_dossier_repairs_wrong_types():
    d = _normalize_dossier({"summary": "hi", "interests": None, "voice_guide": "not a dict"})
    assert d["interests"] == []
    assert isinstance(d["voice_guide"], dict)
    assert d["summary"] == "hi"


def test_normalize_map_findings_defaults_missing_voice_traits():
    # map truncation dropped voice_traits/values (the real cache bug)
    f = _normalize_map_findings({"interests": ["a"], "opinions": ["b"], "claimed_facts": []})
    assert f["voice_traits"] == []
    assert f["values"] == []
    assert f["interests"] == ["a"]
