"""
PrismTone backend tests (offline, no API quota used).
Run from the backend folder:  python -m unittest discover -s tests -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.services.diff_engine import calculate_change_score, compute_word_diff  # noqa: E402
from app.services.fact_guard import extract_facts_from_text, verify_facts  # noqa: E402
from app.services.privacy_guard import mask_pii, unmask_pii  # noqa: E402
from app.services.tone_analyzer import brevity_score, readability_score  # noqa: E402

DEMO_DRAFT = "Server went down, it's Raj's fault, fix by Friday."


class OfflineTestCase(unittest.TestCase):
    """Forces the stage-safe offline engine so tests are deterministic."""

    def setUp(self):
        self._saved_key = settings.GEMINI_API_KEY
        settings.GEMINI_API_KEY = ""
        self.client = TestClient(app)

    def tearDown(self):
        settings.GEMINI_API_KEY = self._saved_key


class TestServices(unittest.TestCase):
    def test_diff_is_lossless(self):
        tokens = compute_word_diff("fix by Friday", "deploy the fix by Friday EOD")
        rebuilt = "".join(t.text for t in tokens if t.type != "deleted")
        self.assertEqual(rebuilt, "deploy the fix by Friday EOD")

    def test_change_score_bounds(self):
        self.assertEqual(calculate_change_score("same text", "same text"), 0.0)
        self.assertGreater(calculate_change_score("a b c", "x y z"), 50.0)

    def test_privacy_roundtrip(self):
        masked, mapping = mask_pii("Ping Raj at raj@corp.com")
        self.assertNotIn("raj@corp.com", masked)
        self.assertNotIn("Raj", masked)
        self.assertEqual(unmask_pii(masked, mapping), "Ping Raj at raj@corp.com")

    def test_fact_guard_detects_missing_date(self):
        facts = extract_facts_from_text(DEMO_DRAFT)
        _, status = verify_facts(facts, "Server issue being handled.", DEMO_DRAFT, "peer")
        self.assertIn(status, ("amber", "red"))

    def test_fact_guard_allows_executive_deblame(self):
        facts = extract_facts_from_text(DEMO_DRAFT)
        verified, status = verify_facts(
            facts, "The server outage fix is scheduled for completion by Friday.", DEMO_DRAFT, "executive"
        )
        self.assertEqual(status, "green")
        self.assertTrue(any(f.text == "Raj" and f.status == "modified" for f in verified))

    def test_score_helpers_clamped(self):
        self.assertEqual(brevity_score(5), 10.0)
        self.assertEqual(brevity_score(500), 1.0)
        self.assertTrue(1.0 <= readability_score(30) <= 10.0)


class TestApi(OfflineTestCase):
    def test_health(self):
        body = self.client.get("/health").json()
        self.assertEqual(body["status"], "healthy")

    def test_transform_offline_all_personas(self):
        resp = self.client.post("/api/v1/transform", json={"draft": DEMO_DRAFT})
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["ai_engine"], "offline_fallback")
        self.assertEqual(set(body["results"]), {"executive", "peer", "legal", "gen_z"})
        peer = body["results"]["peer"]
        self.assertIn("Raj", peer["rewrite"])  # PII restored after masking
        for key in ("brevity", "readability", "formality", "warmth", "directness"):
            self.assertTrue(1.0 <= peer["metrics"][key] <= 10.0)

    def test_transform_custom_persona(self):
        resp = self.client.post("/api/v1/transform", json={
            "draft": "Launch slips to March 3 because QA found 2 blockers.",
            "personas": ["investor"],
            "custom_personas": [{"id": "investor", "name": "Investor Update", "description": "Calm, metric-driven note for investors"}],
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["results"]["investor"]["persona_name"], "Investor Update")

    def test_transform_rejects_blank_draft(self):
        resp = self.client.post("/api/v1/transform", json={"draft": "     "})
        self.assertEqual(resp.status_code, 422)

    def test_transform_rejects_oversized_draft(self):
        resp = self.client.post("/api/v1/transform", json={"draft": "a" * 5001})
        self.assertEqual(resp.status_code, 422)

    def test_diff_endpoint(self):
        resp = self.client.post("/api/v1/diff", json={"text1": "hello world", "text2": "hello there"})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["diff_tokens"])

    def test_decode_offline(self):
        resp = self.client.post("/api/v1/decode", json={"incoming_text": "Per my last email, fix this ASAP."})
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["sentiment"], "Passive-Aggressive")
        self.assertEqual(len(body["suggested_reply_strategies"]), 3)


if __name__ == "__main__":
    unittest.main()
