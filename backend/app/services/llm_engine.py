"""
PrismTone LLM Engine
Powered by Google Gemini (models/gemini-3.6-flash primary + models/gemini-3.5-flash-lite failover)
with Stage-Safe Offline Heuristic Intelligence if the network drops.
"""
import re
import asyncio
from typing import Any, Dict, List, Optional
from app.schemas import (
    CustomPersona, TransformRequest, TransformResponse, PersonaOutput, SliderSettings, ToneMetrics
)
from app.services.gemini_client import generate_gemini_json
from app.services.diff_engine import compute_word_diff, calculate_change_score
from app.services.fact_guard import extract_facts_from_text, verify_facts
from app.services.tone_analyzer import (
    brevity_score, calculate_reading_grade, detect_risk_flags, estimate_tone_scores, readability_score
)
from app.services.privacy_guard import mask_pii, unmask_pii

PERSONA_PROFILES: Dict[str, Dict[str, str]] = {
    "executive": {
        "name": "Executive C-Level",
        "tagline": "Outcome-first, 2-3 crisp lines, zero fluff, clear deadlines",
        "guide": (
            "Write 2 to 3 crisp, high-impact sentences. Lead immediately with status/outcome "
            "and the clear action/deadline. Eliminate personal blame and filler."
        ),
    },
    "peer": {
        "name": "Supportive Peer",
        "tagline": "Warm, constructive, collaborative, frames critique as mutual growth",
        "guide": (
            "Write warmly and constructively like a supportive teammate. Frame problems as "
            "shared team goals, remove harsh blame, and offer collaboration while keeping deadlines clear."
        ),
    },
    "legal": {
        "name": "Legal & Compliance",
        "tagline": "Neutral, legally sound, factual, zero emotive blame or over-promises",
        "guide": (
            "Write in neutral, objective, compliance-safe language. Strip all personal blame, "
            "emotive words, and absolute guarantees. State facts, dates, and obligations accurately."
        ),
    },
    "gen_z": {
        "name": "Gen-Z Hype",
        "tagline": "Energetic, punchy, modern office slang, high vibe yet work-ready",
        "guide": (
            "Write energetic, upbeat, concise modern workplace copy with tasteful Gen-Z expressions "
            "(e.g. 'locked in', 'no stress', 'we got this') while keeping every fact and deadline intact."
        ),
    },
}

CHANNEL_GUIDES = {
    "email": "Professional email body (include a clear, compelling subject line).",
    "slack": "Scannable Slack message (concise, natural workplace chat flow).",
    "whatsapp": "Crisp WhatsApp message (mobile-friendly, direct, light formatting).",
    "linkedin": "Polished LinkedIn message/post style (professional, engaging).",
    "sms": "Ultra-short SMS text (under 160 characters if possible, essential facts only).",
}

LENGTH_GUIDES = {
    "one_liner": "Strictly 1 single punchy sentence.",
    "short": "2 concise sentences maximum.",
    "standard": "2 to 4 well-structured sentences.",
}

LANGUAGE_GUIDES = {
    "en": "Write strictly in natural, fluent English.",
    "hinglish": "Write in natural Indian Hinglish (Roman script blending Hindi & English naturally as used in Indian tech teams).",
    "hi": "Write in clear, natural Hindi (Devanagari script), keeping technical terms understandable.",
}

OFFLINE_DEMO_PRESETS = {
    "executive": {
        "subject": "Status Update: Production Outage & Friday Recovery Milestone",
        "rewrite": "The production server experienced downtime. An emergency patch is currently being deployed to restore full redundancy, with final resolution targeted for Friday EOD.",
        "change_notes": [
            "Front-loaded outage impact and Friday recovery deadline for executive scanning",
            "Replaced personal blame with systemic remediation ownership",
        ],
        "risk_flags": ["Blame language eliminated"],
    },
    "peer": {
        "subject": "Quick sync on the server fix for Friday",
        "rewrite": "Hey team, appreciate everyone rallying around the server issue. Raj is leading the root-cause fix right now, and we're on track to wrap everything up together by Friday. Let me know how I can help!",
        "change_notes": [
            "Reframed individual blame into supportive ownership for Raj",
            "Added collaborative offer of help while keeping Friday clear",
        ],
        "risk_flags": [],
    },
    "legal": {
        "subject": "Notice of Service Interruption and Scheduled Rectification",
        "rewrite": "Please be advised that a server interruption occurred. Technical remediation is underway, with corrective deployment scheduled on or before Friday. No warranties beyond standard SLA are extended.",
        "change_notes": [
            "Removed personal culpability to prevent legal/HR liability",
            "Stated Friday remediation target neutrally without over-promising",
        ],
        "risk_flags": ["Personal blame and unverified liability removed"],
    },
    "gen_z": {
        "subject": "Server update — locking in the fix by Friday!",
        "rewrite": "Server took an unplanned nap, ngl! Zero stress though — Raj and the squad are already cooking on the patch and we'll be locked in by Friday. We got this!",
        "change_notes": [
            "Shifted tense blame into upbeat squad energy",
            "Preserved both Raj's involvement and the Friday deadline clearly",
        ],
        "risk_flags": [],
    },
}

OFFLINE_HINGLISH = {
    "executive": "Production server me downtime aaya tha. Emergency patch deploy ho raha hai, aur Friday EOD tak full resolution target hai.",
    "peer": "Hey team, server issue par sabka support great hai. Raj root-cause fix lead kar rahe hain aur hum Friday tak milkar wrap up kar lenge!",
    "legal": "Record ke liye bataya jata hai ki server disruption hua tha. Technical review chalu hai aur Friday ya usse pehle corrective patch schedule hai.",
    "gen_z": "Server ne chhota sa nap le liya tha ngl! No stress — Raj aur squad fix par locked in hain, Friday tak full sorted!",
}


def resolve_persona_profiles(
    persona_ids: List[str], custom_personas: List[CustomPersona]
) -> Dict[str, Dict[str, str]]:
    """Merges built-in persona profiles with user-defined custom personas."""
    custom_map = {cp.id: cp for cp in custom_personas}
    profiles: Dict[str, Dict[str, str]] = {}
    for pid in persona_ids:
        if pid in PERSONA_PROFILES:
            profiles[pid] = PERSONA_PROFILES[pid]
        elif pid in custom_map:
            cp = custom_map[pid]
            profiles[pid] = {
                "name": cp.name,
                "tagline": cp.description[:90],
                "guide": cp.description,
            }
        else:
            profiles[pid] = {
                "name": pid.replace("_", " ").title(),
                "tagline": "Custom audience persona",
                "guide": f"Adapt the message specifically for the audience '{pid.replace('_', ' ')}'.",
            }
    return profiles


def _build_batch_gemini_prompt(
    masked_draft: str,
    profiles: Dict[str, Dict[str, str]],
    channel: str,
    length: str,
    language: str,
    sliders: Optional[SliderSettings],
) -> str:
    persona_specs = [f'- "{pid}" ({p["name"]}): {p["guide"]}' for pid, p in profiles.items()]

    slider_note = ""
    if sliders:
        slider_note = (
            f"\n6. USER FINE-TUNING (1-10 scale): Formality={sliders.formality}, "
            f"Warmth={sliders.warmth}, Brevity={sliders.brevity}, "
            f"Directness={sliders.directness}, Humor={sliders.humor}. "
            f"Nudge every persona toward these preferences while keeping each persona clearly distinct."
        )

    return f"""You are PrismTone, an expert AI communication transformer.
Transform the user's raw draft into distinct, high-contrast rewrites for EVERY requested persona below.

CRITICAL RULES:
1. PRESERVE ALL FACTS: Keep every date, day, number, amount, metric, deadline, and core event intact.
2. PRESERVE PLACEHOLDERS EXACTLY: If the draft contains privacy tokens like [PERSON_1], [EMAIL_1], [PHONE_1], or [IP_1], keep those exact bracketed tokens when referring to them. Executive/Legal may omit a blamed individual; Peer/Gen-Z may mention them constructively.
3. CHANNEL FORMAT ({channel}): {CHANNEL_GUIDES.get(channel, CHANNEL_GUIDES["email"])}
4. LENGTH ({length}): {LENGTH_GUIDES.get(length, LENGTH_GUIDES["standard"])}
5. LANGUAGE ({language}): {LANGUAGE_GUIDES.get(language, LANGUAGE_GUIDES["en"])}{slider_note}

TARGET PERSONAS:
{chr(10).join(persona_specs)}

RAW DRAFT:
\"\"\"{masked_draft}\"\"\"

Return ONLY valid JSON with this exact top-level structure (one entry per persona id above):
{{
  "personas": {{
    "<persona_id>": {{
      "subject": "Concise email subject line (empty string if channel is not email)",
      "rewrite": "The polished rewritten message",
      "tone_scores": {{"formality": 8.5, "warmth": 4.0, "directness": 9.0}},
      "change_notes": ["Specific note on a key tone/structure edit", "Specific note on fact preservation or risk removal"],
      "risk_flags": ["Blame, vague deadline, or risky promise removed or still present (empty list if none)"]
    }}
  }}
}}"""


def generate_simulated_rewrite(
    draft: str,
    persona_id: str,
    persona_name: str,
    length: str = "standard",
    language: str = "en",
) -> Dict[str, Any]:
    """Fail-safe offline heuristic rewrite so live stage demos never stall."""
    lower_draft = draft.lower()
    is_demo_draft = (
        ("raj" in lower_draft or "[person_1]" in lower_draft)
        and "server" in lower_draft
        and "friday" in lower_draft
    )

    if is_demo_draft and persona_id in OFFLINE_DEMO_PRESETS:
        preset = OFFLINE_DEMO_PRESETS[persona_id]
        rewrite = OFFLINE_HINGLISH[persona_id] if language == "hinglish" else preset["rewrite"]
        if "[person_1]" in lower_draft:
            rewrite = rewrite.replace("Raj", "[PERSON_1]")
        return {
            "subject": preset["subject"],
            "rewrite": rewrite,
            "change_notes": list(preset["change_notes"]),
            "risk_flags": list(preset["risk_flags"]),
        }

    core_text = " ".join(s.strip() for s in re.split(r"[.!?\n]+", draft) if s.strip()) or draft
    templates = {
        "executive": (
            "Action Required: Key Status & Target Timeline",
            f"Key update: {core_text}. Execution is prioritized to hit the target milestone on schedule.",
            ["Front-loaded outcome and delivery priority for executive clarity", "Condensed informal phrasing into direct action"],
        ),
        "peer": (
            "Quick sync & team update",
            f"Hey team! Quick heads-up: {core_text}. Let's collaborate closely to get this across the finish line—happy to jump in and help!",
            ["Added warm, collaborative framing", "Kept core deliverables intact"],
        ),
        "legal": (
            "Formal Record of Status and Commitments",
            f"Please be advised of the following factual update: {core_text}. Actions are proceeding per standard protocol without extended warranties.",
            ["Neutralized subjective language for compliance safety", "Preserved stated dates and factual scope"],
        ),
        "gen_z": (
            "Quick vibe check & update!",
            f"Yo team! Quick update: {core_text}. We're locked in and getting this sorted fast—let's go!",
            ["Injected high-energy modern cadence", "Preserved original intent and timeline"],
        ),
    }
    subj, rewr, notes = templates.get(
        persona_id,
        (f"Update for {persona_name}", f"{core_text}.", [f"Offline mode: kept original wording for {persona_name}"]),
    )
    if length == "one_liner":
        rewr = rewr.split(". ")[0].rstrip(".") + "."
    return {"subject": subj, "rewrite": rewr, "change_notes": notes, "risk_flags": []}


def _clamp_score(val: Any, fallback: float) -> float:
    try:
        return round(max(1.0, min(10.0, float(val))), 1)
    except (TypeError, ValueError):
        return fallback


def _baseline_metrics(draft: str) -> Dict[str, float]:
    scores = estimate_tone_scores(draft)
    grade, _ = calculate_reading_grade(draft)
    word_count = len(draft.split())
    return {
        "formality": scores["formality"],
        "warmth": scores["warmth"],
        "directness": scores["directness"],
        "brevity": brevity_score(word_count),
        "readability": readability_score(grade),
        "reading_grade": grade,
        "word_count": float(word_count),
    }


def _build_persona_card(
    pid: str,
    profile: Dict[str, str],
    raw_card: Dict[str, Any],
    request: TransformRequest,
    pii_map: Dict[str, str],
    original_facts,
    baseline: Dict[str, float],
) -> PersonaOutput:
    unmasked_rewrite = unmask_pii(str(raw_card.get("rewrite", "")).strip(), pii_map)
    unmasked_subject = unmask_pii(str(raw_card.get("subject", "")).strip(), pii_map)

    verified_facts, guard_status = verify_facts(
        original_facts, unmasked_rewrite, original_draft=request.draft, persona_id=pid
    )
    diff_tokens = compute_word_diff(request.draft, unmasked_rewrite)

    heuristic = estimate_tone_scores(unmasked_rewrite, pid)
    llm_scores = raw_card.get("tone_scores") if isinstance(raw_card.get("tone_scores"), dict) else {}
    formality = _clamp_score(llm_scores.get("formality"), heuristic["formality"])
    warmth = _clamp_score(llm_scores.get("warmth"), heuristic["warmth"])
    directness = _clamp_score(llm_scores.get("directness"), heuristic["directness"])

    grade, grade_label = calculate_reading_grade(unmasked_rewrite)
    words = len(unmasked_rewrite.split())
    orig_words = max(1, int(baseline["word_count"]))
    tone_delta = abs(formality - baseline["formality"]) + abs(warmth - baseline["warmth"])

    metrics = ToneMetrics(
        formality=formality,
        warmth=warmth,
        directness=directness,
        brevity=brevity_score(words),
        readability=readability_score(grade),
        reading_grade=grade,
        reading_level_label=grade_label,
        length_change_pct=round(((words - orig_words) / orig_words) * 100.0, 1),
        change_score=calculate_change_score(request.draft, unmasked_rewrite, tone_delta),
        word_count=words,
    )

    llm_flags = [str(f) for f in (raw_card.get("risk_flags") or []) if str(f).strip()]
    combined_risks = list(dict.fromkeys(llm_flags + detect_risk_flags(unmasked_rewrite)))[:3]
    notes = [str(n) for n in (raw_card.get("change_notes") or []) if str(n).strip()]

    return PersonaOutput(
        persona_id=pid,
        persona_name=profile["name"],
        tagline=profile["tagline"],
        rewrite=unmasked_rewrite,
        subject_line=unmasked_subject if (request.channel == "email" and unmasked_subject) else None,
        metrics=metrics,
        facts_found=verified_facts,
        fact_guard_status=guard_status,
        risk_flags=combined_risks,
        change_notes=(notes or ["Adapted tone, structure, and vocabulary for target persona"])[:4],
        diff_tokens=diff_tokens,
    )


async def transform_draft(request: TransformRequest) -> TransformResponse:
    """
    Full PrismTone transformation pipeline:
    1. Privacy Guard PII masking
    2. Original fact & baseline tone extraction
    3. Single contrastive Gemini batch call (with model + offline failover)
    4. PII restoration, Fact Guard verification, Word Diff & Change Score calculation
    """
    loop = asyncio.get_running_loop()
    start_time = loop.time()

    masked_text, pii_map = (mask_pii(request.draft) if request.privacy_mode else (request.draft, {}))
    original_facts = extract_facts_from_text(request.draft)
    baseline = _baseline_metrics(request.draft)
    profiles = resolve_persona_profiles(request.personas, request.custom_personas)

    prompt = _build_batch_gemini_prompt(
        masked_text, profiles, request.channel, request.length, request.language, request.sliders
    )
    gemini_payload, model_used = await generate_gemini_json(
        prompt,
        api_key=request.api_key,
        temperature=0.85 if request.fresh else 0.4,
        use_cache=not request.fresh,
    )
    gemini_personas = gemini_payload.get("personas", {}) if isinstance(gemini_payload, dict) else {}
    if not isinstance(gemini_personas, dict):
        gemini_personas = {}

    ai_engine = "gemini" if (model_used and gemini_personas) else "offline_fallback"

    results: Dict[str, PersonaOutput] = {}
    for pid, profile in profiles.items():
        raw_card = gemini_personas.get(pid)
        if not isinstance(raw_card, dict) or not str(raw_card.get("rewrite", "")).strip():
            raw_card = generate_simulated_rewrite(
                masked_text, pid, profile["name"], request.length, request.language
            )
        results[pid] = _build_persona_card(
            pid, profile, raw_card, request, pii_map, original_facts, baseline
        )

    return TransformResponse(
        original_text=request.draft,
        original_metrics=baseline,
        results=results,
        processing_time_ms=round((loop.time() - start_time) * 1000.0, 1),
        privacy_masked=request.privacy_mode and bool(pii_map),
        masked_entities_count=len(pii_map),
        ai_engine=ai_engine,
        model_used=model_used if ai_engine == "gemini" else "heuristic-v1",
    )
