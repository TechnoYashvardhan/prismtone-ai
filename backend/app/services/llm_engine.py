"""
PrismTone LLM Engine
Powered by Google Gemini (models/gemini-3.6-flash primary + models/gemini-3.5-flash-lite failover)
with Stage-Safe Offline Heuristic Intelligence if network drops.
"""
import re
import asyncio
from typing import Any, Dict, List, Optional, Tuple
from app.schemas import (
    TransformRequest, TransformResponse, PersonaOutput, SliderSettings, ToneMetrics
)
from app.services.gemini_client import generate_gemini_json
from app.services.diff_engine import compute_word_diff, calculate_change_score
from app.services.fact_guard import extract_facts_from_text, verify_facts
from app.services.tone_analyzer import (
    calculate_reading_grade, detect_risk_flags, estimate_tone_scores
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
    "server went down": {
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
            "rewrite": "Server took an unplanned nap, ngl! Zero stress though — Raj and the squad are already cooking on the patch and we'll be 100% locked in by Friday. We got this!",
            "change_notes": [
                "Shifted tense blame into upbeat squad energy",
                "Preserved both Raj's involvement and the Friday deadline clearly",
            ],
            "risk_flags": [],
        },
    }
}


def _build_batch_gemini_prompt(
    masked_draft: str,
    personas: List[str],
    channel: str,
    length: str,
    language: str,
    sliders: Optional[SliderSettings],
    custom_persona_prompt: Optional[str],
) -> str:
    persona_specs = []
    for pid in personas:
        if pid in PERSONA_PROFILES:
            p = PERSONA_PROFILES[pid]
            persona_specs.append(f'- "{pid}" ({p["name"]}): {p["guide"]}')
        else:
            custom_desc = custom_persona_prompt or f"Adapt specifically for audience '{pid}'."
            persona_specs.append(f'- "{pid}": {custom_desc}')

    slider_note = ""
    if sliders:
        slider_note = (
            f"\nUser Fine-Tuning Bias (1-10 scale): Formality={sliders.formality}, "
            f"Warmth={sliders.warmth}, Brevity={sliders.brevity}, "
            f"Directness={sliders.directness}, Humor={sliders.humor}. "
            f"Nudge each persona subtly toward these preferences while keeping each persona distinct."
        )

    return f"""You are PrismTone, an expert AI communication transformer.
Transform the user's raw draft into distinct, high-contrast rewrites for EVERY requested persona below.

CRITICAL RULES:
1. PRESERVE ALL FACTS: Keep every date, day, number, amount, metric, deadline, and core event intact.
2. PRESERVE PLACEHOLDERS EXACTLY: If the draft contains privacy tokens like [PERSON_1], [EMAIL_1], [PHONE_1], or [IP_1], keep those exact bracketed tokens in your rewrites when referring to them (note: Executive/Legal may omit blaming an individual if appropriate, while Peer/Gen-Z can mention them constructively).
3. CHANNEL FORMAT ({channel}): {CHANNEL_GUIDES.get(channel, CHANNEL_GUIDES["email"])}
4. LENGTH ({length}): {LENGTH_GUIDES.get(length, LENGTH_GUIDES["standard"])}
5. LANGUAGE ({language}): {LANGUAGE_GUIDES.get(language, LANGUAGE_GUIDES["en"])}{slider_note}

TARGET PERSONAS:
{chr(10).join(persona_specs)}

RAW DRAFT:
\"\"\"{masked_draft}\"\"\"

Return ONLY valid JSON with this exact top-level structure:
{{
  "personas": {{
    "<persona_id>": {{
      "subject": "Concise email subject line (empty string if channel is not email)",
      "rewrite": "The polished rewritten message",
      "tone_scores": {{
        "formality": 8.5,
        "warmth": 4.0,
        "directness": 9.0
      }},
      "change_notes": [
        "Short specific explanation of a key structural or tone edit (Why this changed)",
        "Second short specific note on fact preservation or risk removal"
      ],
      "risk_flags": [
        "Short note on any blame, vague deadline, or risky promise removed or still present (empty list if none)"
      ]
    }}
  }}
}}"""


def generate_simulated_rewrite(
    draft: str,
    persona_id: str,
    channel: str = "email",
    length: str = "standard",
    language: str = "en",
) -> Dict[str, Any]:
    """Fail-safe offline heuristic rewrite so live stage demos never stall."""
    lower_draft = draft.lower()

    if ("raj" in lower_draft or "[person" in lower_draft) and "server" in lower_draft and "friday" in lower_draft:
        preset_bundle = OFFLINE_DEMO_PRESETS["server went down"]
        if persona_id in preset_bundle:
            data = {
                "subject": preset_bundle[persona_id]["subject"],
                "rewrite": preset_bundle[persona_id]["rewrite"],
                "change_notes": list(preset_bundle[persona_id]["change_notes"]),
                "risk_flags": list(preset_bundle[persona_id]["risk_flags"]),
            }
            if "[person_1]" in lower_draft:
                data["rewrite"] = data["rewrite"].replace("Raj", "[PERSON_1]").replace("raj", "[PERSON_1]")
            if language == "hinglish":
                hinglish_map = {
                    "executive": "Production server me downtime aaya tha. Emergency patch deploy ho raha hai, aur Friday EOD tak full resolution target hai.",
                    "peer": "Hey team, server issue par sabka support great hai. [PERSON_1] root-cause fix lead kar rahe hain aur hum Friday tak milkar wrap up kar lenge!",
                    "legal": "Record ke liye सूचित kiya jata hai ki server disruption hua tha. Technical review chalu hai aur Friday ya usse pehle corrective patch schedule hai.",
                    "gen_z": "Server ne chhota sa nap le liya tha ngl! No stress — [PERSON_1] aur squad fix par locked in hain, Friday tak full sorted!",
                }
                if persona_id in hinglish_map:
                    txt = hinglish_map[persona_id]
                    if "[person_1]" not in lower_draft:
                        txt = txt.replace("[PERSON_1]", "Raj")
                    data["rewrite"] = txt
            return data

    core_text = " ".join(s.strip() for s in re.split(r"[.!?\n]+", draft) if s.strip()) or draft
    templates = {
        "executive": (
            "Action Required: Key Status & Target Timeline",
            f"Key update: {core_text}. Remediation and execution are prioritized to hit our target milestone on schedule.",
            ["Front-loaded outcome and delivery priority for executive clarity", "Condensed informal phrasing into direct action"],
        ),
        "peer": (
            "Quick sync & team update",
            f"Hey team! Quick heads-up: {core_text}. Let's collaborate closely to get this across the finish line smoothly—happy to jump in and help!",
            ["Added warm, collaborative framing to support psychological safety", "Kept core deliverables intact"],
        ),
        "legal": (
            "Formal Record of Status and Commitments",
            f"Please be advised of the following factual update: {core_text}. Actions are proceeding per standard operational protocol without extended warranties.",
            ["Neutralized subjective language to maintain compliance safety", "Preserved stated dates and factual scope"],
        ),
        "gen_z": (
            "Quick vibe check & update!",
            f"Yo team! Quick update: {core_text}. We're locked in and getting this sorted fast—let's go!",
            ["Injected high-energy modern cadence suitable for casual channels", "Preserved original intent and timeline"],
        ),
    }
    subj, rewr, notes = templates.get(
        persona_id,
        (f"Update ({persona_id.title()})", core_text, ["Adapted tone to custom persona"]),
    )
    if length == "one_liner":
        rewr = rewr.split(".")[0].strip() + "."
    return {"subject": subj, "rewrite": rewr, "change_notes": notes, "risk_flags": []}


def _clamp_score(val: Any, fallback: float) -> float:
    try:
        return round(max(1.0, min(10.0, float(val))), 1)
    except (TypeError, ValueError):
        return fallback


async def transform_draft(request: TransformRequest) -> TransformResponse:
    """
    Full PrismTone transformation pipeline:
    1. Privacy Guard PII masking
    2. Original fact & baseline tone extraction
    3. Contrastive Gemini 3.6 Flash batch generation (with automatic model + offline failover)
    4. PII restoration, Fact Guard verification, Word Diff & Change Score calculation
    """
    loop = asyncio.get_running_loop()
    start_time = loop.time()

    # 1. Privacy Guard Masking
    masked_text = request.draft
    pii_map: Dict[str, str] = {}
    if request.privacy_mode:
        masked_text, pii_map = mask_pii(request.draft)

    # 2. Baseline facts & metrics on raw original draft
    original_facts = extract_facts_from_text(request.draft)
    orig_scores = estimate_tone_scores(request.draft)
    orig_grade, _ = calculate_reading_grade(request.draft)
    original_metrics = {
        "formality": orig_scores["formality"],
        "warmth": orig_scores["warmth"],
        "directness": orig_scores["directness"],
        "reading_grade": orig_grade,
        "word_count": float(len(request.draft.split())),
    }

    # 3. Single-shot Contrastive Gemini Call (1 request for all personas = 4x higher RPM quota!)
    prompt = _build_batch_gemini_prompt(
        masked_draft=masked_text,
        personas=request.personas,
        channel=request.channel,
        length=request.length,
        language=request.language,
        sliders=request.sliders,
        custom_persona_prompt=request.custom_persona_prompt,
    )
    gemini_payload, model_used = await generate_gemini_json(prompt, api_key=request.api_key)
    gemini_personas = (gemini_payload or {}).get("personas", {}) if isinstance(gemini_payload, dict) else {}

    ai_engine = "gemini" if (model_used and gemini_personas) else "offline_fallback"
    active_model_label = model_used if (model_used and gemini_personas) else "heuristic-v1"

    # 4. Assemble verified PersonaOutput cards
    results_dict: Dict[str, PersonaOutput] = {}
    orig_word_count = max(1, len(request.draft.split()))

    for pid in request.personas:
        profile = PERSONA_PROFILES.get(
            pid,
            {"name": pid.replace("_", " ").title(), "tagline": "Custom audience persona"},
        )
        raw_card = gemini_personas.get(pid) if isinstance(gemini_personas, dict) else None
        if not isinstance(raw_card, dict) or not raw_card.get("rewrite"):
            raw_card = generate_simulated_rewrite(
                masked_text, pid, request.channel, request.length, request.language
            )

        unmasked_rewrite = unmask_pii(str(raw_card.get("rewrite", "")).strip(), pii_map)
        unmasked_subject = unmask_pii(str(raw_card.get("subject", "")).strip(), pii_map)

        # Fact Guard check
        verified_facts, guard_status = verify_facts(
            original_facts, unmasked_rewrite, original_draft=request.draft, persona_id=pid
        )

        # Word-level diff
        diff_tokens = compute_word_diff(request.draft, unmasked_rewrite)

        # Blend LLM tone scores (if provided) with deterministic readability & change score
        heuristic_scores = estimate_tone_scores(unmasked_rewrite, pid)
        llm_scores = raw_card.get("tone_scores") if isinstance(raw_card.get("tone_scores"), dict) else {}
        formality = _clamp_score(llm_scores.get("formality"), heuristic_scores["formality"])
        warmth = _clamp_score(llm_scores.get("warmth"), heuristic_scores["warmth"])
        directness = _clamp_score(llm_scores.get("directness"), heuristic_scores["directness"])

        grade, grade_label = calculate_reading_grade(unmasked_rewrite)
        rewr_words = len(unmasked_rewrite.split())
        length_change_pct = round(((rewr_words - orig_word_count) / orig_word_count) * 100.0, 1)
        tone_delta = abs(formality - orig_scores["formality"]) + abs(warmth - orig_scores["warmth"])
        change_score = calculate_change_score(request.draft, unmasked_rewrite, tone_delta)

        metrics = ToneMetrics(
            formality=formality,
            warmth=warmth,
            directness=directness,
            reading_grade=grade,
            reading_level_label=grade_label,
            length_change_pct=length_change_pct,
            change_score=change_score,
            word_count=rewr_words,
        )

        # Risk flags (combine LLM observations + regex risk scanner on rewrite)
        llm_flags = [str(f) for f in (raw_card.get("risk_flags") or []) if str(f).strip()]
        detected_risks = detect_risk_flags(unmasked_rewrite)
        combined_risks = list(dict.fromkeys(llm_flags + detected_risks))[:3]

        notes = [str(n) for n in (raw_card.get("change_notes") or []) if str(n).strip()]
        if not notes:
            notes = ["Adapted tone, structure, and vocabulary for target persona"]

        results_dict[pid] = PersonaOutput(
            persona_id=pid,
            persona_name=profile["name"],
            tagline=profile["tagline"],
            rewrite=unmasked_rewrite,
            subject_line=unmasked_subject if (request.channel == "email" and unmasked_subject) else None,
            metrics=metrics,
            facts_found=verified_facts,
            fact_guard_status=guard_status,
            risk_flags=combined_risks,
            change_notes=notes[:4],
            diff_tokens=diff_tokens,
        )

    elapsed_ms = round((loop.time() - start_time) * 1000.0, 1)

    return TransformResponse(
        original_text=request.draft,
        original_metrics=original_metrics,
        results=results_dict,
        processing_time_ms=elapsed_ms,
        privacy_masked=request.privacy_mode and len(pii_map) > 0,
        masked_entities_count=len(pii_map),
        ai_engine=ai_engine,
        model_used=active_model_label,
    )
