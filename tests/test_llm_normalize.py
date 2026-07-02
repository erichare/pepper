from __future__ import annotations

from pepper.archive.llm.batch import _normalize_dossier, _normalize_map_findings


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
    # existing content preserved
    assert d["interests"] == ["a"]
    assert d["biographical_facts"] == [{"value": "x"}]


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
