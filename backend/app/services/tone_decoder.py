"""
PrismTone Tone Decoder (Reverse Mode)
Powered by Google Gemini (models/gemini-3.6-flash) with instant heuristic failover.
Analyzes incoming messages to uncover hidden subtext, urgency, and 3 tactical reply angles.
"""
import re
from typing import List, Optional
from app.schemas import ToneDecodeResponse, SuggestedReplyAngle
from app.services.gemini_client import generate_gemini_json

VALID_URGENCY = {"Low", "Medium", "High", "Critical"}
VALID_SENTIMENT = {"Positive", "Neutral", "Guarded", "Passive-Aggressive", "Critical"}

PASSIVE_AGGRESSIVE_PATTERNS = [
    (r"\bper my last email\b", "Frustration: The sender feels you ignored earlier instructions."),
    (r"\bas stated previously\b", "Impatience: Highlighting that this is a repeated request."),
    (r"\bjust following up\b", "Moderate urgency: Seeking a commitment or unblocking status."),
    (r"\bkindly advise\b", "Formal push: A polite but firm demand for immediate resolution."),
    (r"\bany update on this\??\b", "High urgency: The sender is feeling stalled."),
    (r"\bwith all due respect\b", "Defensiveness or impending disagreement."),
    (r"\bas you know\b", "Asserting context that the sender expects you to remember."),
]


def _build_decode_prompt(text: str) -> str:
    return f"""You are PrismTone's Tone Decoder (Reverse Mode).
Analyze the incoming message below and reveal its real tone, hidden subtext, urgency, and 3 tactical reply drafts.

INCOMING MESSAGE:
\"\"\"{text}\"\"\"

Return ONLY valid JSON matching this exact structure:
{{
  "dominant_tone": "2-4 word crisp label (e.g. 'Polite but Escalating', 'Warm & Supportive')",
  "formality_score": 7.5,
  "urgency_level": "One of: Low | Medium | High | Critical",
  "sentiment": "One of: Positive | Neutral | Guarded | Passive-Aggressive | Critical",
  "hidden_subtext": "Clear, insightful 1-2 sentence explanation of what the sender REALLY means underneath the surface words.",
  "key_signals": [
    "Specific phrase or punctuation cue from the message and what it signals",
    "Second specific cue"
  ],
  "suggested_reply_strategies": [
    {{
      "title": "De-escalate & Align (Supportive)",
      "vibe": "Calm, collaborative, ownership-first",
      "recommended_snippet": "Ready-to-send natural reply tailored directly to the incoming message"
    }},
    {{
      "title": "Crisp & Outcome-First (Executive)",
      "vibe": "Concise, decisive, timeline-clear",
      "recommended_snippet": "Ready-to-send concise executive reply tailored to the message"
    }},
    {{
      "title": "Neutral & Documented (Compliance)",
      "vibe": "Factual, boundary-safe, professional",
      "recommended_snippet": "Ready-to-send neutral factual reply tailored to the message"
    }}
  ]
}}"""


def _heuristic_decode(text: str) -> ToneDecodeResponse:
    text_lower = text.lower()
    signals: List[str] = []
    subtext_notes: List[str] = []

    for pattern, note in PASSIVE_AGGRESSIVE_PATTERNS:
        if re.search(pattern, text_lower):
            subtext_notes.append(note)

    urgency = "Medium"
    if any(k in text_lower for k in ["urgent", "asap", "critical", "immediately", "escalat", "eod"]):
        urgency = "Critical"
        signals.append("High-priority deadline or escalation cue detected")
    elif any(k in text_lower for k in ["whenever", "no rush", "fyi"]):
        urgency = "Low"
        signals.append("Relaxed informational cadence detected")
    elif "?" in text:
        urgency = "High" if "!" in text else "Medium"

    if subtext_notes:
        sentiment = "Passive-Aggressive"
        dominant_tone = "Guarded / Mildly Frustrated"
    elif any(k in text_lower for k in ["thanks", "great job", "appreciate", "awesome"]):
        sentiment = "Positive"
        dominant_tone = "Warm & Collaborative"
    elif any(k in text_lower for k in ["unacceptable", "disappointed", "failed", "escalat"]):
        sentiment = "Critical"
        dominant_tone = "Escalated & Strict"
    else:
        sentiment = "Neutral"
        dominant_tone = "Objective / Business Neutral"

    hidden_subtext = (
        " ".join(subtext_notes)
        if subtext_notes
        else "The sender wants a clear, accountable status update with a concrete completion time."
        if urgency in ("High", "Critical")
        else "Direct professional message with no hidden hostility."
    )

    strategies = [
        SuggestedReplyAngle(
            title="De-escalate & Clarify (Supportive)",
            vibe="Calm, acknowledging, and solution-focused",
            recommended_snippet="Thanks for flagging this—completely aligned on priority. I'm actively resolving it now and will share the confirmed update by 4 PM today.",
        ),
        SuggestedReplyAngle(
            title="Firm & Factual (Executive)",
            vibe="Concise, outcome-oriented, zero fluff",
            recommended_snippet="Acknowledged. Root cause is isolated and final resolution is on track for EOD today.",
        ),
        SuggestedReplyAngle(
            title="Detailed & Documented (Compliance)",
            vibe="Thorough, neutral, and reference-backed",
            recommended_snippet="Confirming receipt. The item is currently in verification per agreed scope, with completion scheduled within today's operational window.",
        ),
    ]

    return ToneDecodeResponse(
        dominant_tone=dominant_tone,
        formality_score=7.2 if sentiment != "Positive" else 5.5,
        urgency_level=urgency,
        hidden_subtext=hidden_subtext,
        sentiment=sentiment,
        key_signals=signals or ["Direct phrasing and explicit expectation of follow-through"],
        suggested_reply_strategies=strategies,
        ai_engine="offline_fallback",
        model_used="heuristic-v1",
    )


async def decode_incoming_message(text: str, api_key: Optional[str] = None) -> ToneDecodeResponse:
    """Decodes an incoming message using Gemini 3.6 Flash with safe heuristic fallback."""
    parsed, model_used = await generate_gemini_json(_build_decode_prompt(text), api_key=api_key)
    if not parsed or not model_used:
        return _heuristic_decode(text)

    try:
        raw_urgency = str(parsed.get("urgency_level", "Medium")).strip().title()
        urgency = raw_urgency if raw_urgency in VALID_URGENCY else "Medium"

        raw_sent = str(parsed.get("sentiment", "Neutral")).strip()
        # Normalize Passive-Aggressive casing
        sentiment = next((s for s in VALID_SENTIMENT if s.lower() == raw_sent.lower()), "Neutral")

        try:
            formality = round(max(1.0, min(10.0, float(parsed.get("formality_score", 6.5)))), 1)
        except (TypeError, ValueError):
            formality = 6.5

        raw_strats = parsed.get("suggested_reply_strategies") or []
        strategies = [
            SuggestedReplyAngle(
                title=str(s.get("title", "Recommended Reply")),
                vibe=str(s.get("vibe", "Balanced & Clear")),
                recommended_snippet=str(s.get("recommended_snippet", "")),
            )
            for s in raw_strats
            if isinstance(s, dict) and s.get("recommended_snippet")
        ]
        if not strategies:
            return _heuristic_decode(text)

        signals = [str(sig) for sig in (parsed.get("key_signals") or []) if str(sig).strip()]

        return ToneDecodeResponse(
            dominant_tone=str(parsed.get("dominant_tone", "Professional")),
            formality_score=formality,
            urgency_level=urgency,
            hidden_subtext=str(parsed.get("hidden_subtext", "")),
            sentiment=sentiment,
            key_signals=signals[:4] or ["Contextual tone markers analyzed"],
            suggested_reply_strategies=strategies[:3],
            ai_engine="gemini",
            model_used=model_used,
        )
    except Exception:
        return _heuristic_decode(text)
