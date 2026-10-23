"""
PrismTone Tone Decoder (Reverse Mode)
Analyzes incoming messages to extract subtext, passive-aggression, hidden urgency,
and recommends tactical reply personas and draft snippets.
"""
import re
from typing import List
from app.schemas import ToneDecodeResponse, SuggestedReplyAngle

PASSIVE_AGGRESSIVE_PATTERNS = [
    (r"\bper my last email\b", "Frustration: The sender feels you ignored earlier instructions."),
    (r"\bas stated previously\b", "Impatience: Highlighting that this is a repeated request."),
    (r"\bjust following up\b", "Moderate urgency: Seeking a commitment or unblocking status."),
    (r"\bkindly advise\b", "Formal push: A polite but firm demand for immediate resolution."),
    (r"\bany update on this\??\b", "High urgency: The sender is feeling stalled."),
    (r"\bwith all due respect\b", "Defensiveness / impending disagreement."),
    (r"\bas you know\b", "Asserting dominance or reminding of obvious context.")
]

def decode_incoming_message(text: str) -> ToneDecodeResponse:
    """
    Decodes an incoming message's subtext, urgency, and recommended replies.
    """
    text_lower = text.lower()
    signals: List[str] = []
    subtext_notes: List[str] = []

    # Check known markers
    for pattern, note in PASSIVE_AGGRESSIVE_PATTERNS:
        if re.search(pattern, text_lower):
            subtext_notes.append(note)

    # Detect urgency
    urgency = "Medium"
    if any(k in text_lower for k in ["urgent", "asap", "critical", "immediately", "today cob", "eod today"]):
        urgency = "Critical"
        signals.append("High-priority time deadline detected")
    elif any(k in text_lower for k in ["whenever", "no rush", "sometime next week", "fyi only"]):
        urgency = "Low"
        signals.append("Relaxed or informational cadence detected")
    elif "?" in text:
        urgency = "High" if "!" in text else "Medium"

    # Detect sentiment
    if subtext_notes:
        sentiment = "Passive-Aggressive"
        dominant_tone = "Guarded / Mildly Frustrated"
    elif any(k in text_lower for k in ["thanks", "great job", "appreciate", "love this", "awesome"]):
        sentiment = "Positive"
        dominant_tone = "Warm & Collaborative"
    elif any(k in text_lower for k in ["unacceptable", "disappointed", "failed", "escalat"]):
        sentiment = "Critical"
        dominant_tone = "Escalated & Strict"
    else:
        sentiment = "Neutral"
        dominant_tone = "Objective / Business Neutral"

    # Subtext summary
    if subtext_notes:
        hidden_subtext = " ".join(subtext_notes)
    elif urgency == "Critical":
        hidden_subtext = "The sender needs an actionable resolution immediately to prevent project blockages."
    elif sentiment == "Positive":
        hidden_subtext = "The sender is aligned and receptive. Good opportunity to reinforce collaboration."
    else:
        hidden_subtext = "Direct informational exchange. No detected hidden hostility; standard business inquiry."

    # Generate 3 response strategies
    strategies = [
        SuggestedReplyAngle(
            title="De-escalate & Clarify (Supportive)",
            vibe="Calm, acknowledging, and solution-focused",
            recommended_snippet="Thanks for following up. You're completely right on this. I am on it and will send the update by today 4 PM."
        ),
        SuggestedReplyAngle(
            title="Firm & Factual (Executive)",
            vibe="Concise, outcome-oriented, zero fluff",
            recommended_snippet="Understood. The blocker is identified and resolution is scheduled for EOD. Next sync tomorrow 10 AM."
        ),
        SuggestedReplyAngle(
            title="Detailed & Documented (Compliance)",
            vibe="Thorough, neutral, and reference-backed",
            recommended_snippet="Acknowledging receipt. In accordance with the previous milestone, the deliverable is actively under review with completion expected per timeline."
        )
    ]

    return ToneDecodeResponse(
        dominant_tone=dominant_tone,
        formality_score=7.2 if sentiment != "Positive" else 5.5,
        urgency_level=urgency,
        hidden_subtext=hidden_subtext,
        sentiment=sentiment,
        key_signals=signals if signals else ["Standard professional punctuation", "Clear single subject request"],
        suggested_reply_strategies=strategies
    )
