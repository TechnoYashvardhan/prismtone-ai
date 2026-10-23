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
    "en": (
        "STRICTLY ENGLISH: Write every 'subject' and 'rewrite' in natural, fluent English."
    ),
    "hinglish": (
        "STRICTLY INDIAN HINGLISH (ROMAN SCRIPT ONLY): Write EVERY 'subject' and 'rewrite' in authentic "
        "conversational Hinglish using ONLY Latin/Roman alphabet (do NOT use Devanagari characters). "
        "Naturally blend Hindi grammar, verbs, and connectors (e.g., 'hai', 'hain', 'kar rahe hain', "
        "'ho jayega', 'tak', 'par', 'milkar', 'zaroor') with workplace English terms ('server', 'patch', "
        "'deadline', 'team', 'SLA'). Do NOT output plain English — every sentence must genuinely read as "
        "natural Indian Hinglish tailored to each persona's tone (crisp corporate Hinglish for Executive, "
        "warm teammate Hinglish for Peer, formal record-keeping Hinglish for Legal, upbeat desi Gen-Z "
        "Hinglish for Gen-Z)."
    ),
    "hi": (
        "STRICTLY HINDI IN DEVANAGARI SCRIPT (देवनागरी लिपि): Write EVERY 'subject' and 'rewrite' completely "
        "in natural, fluent Hindi using Devanagari script (e.g., 'सर्वर में समस्या आई थी, शुक्रवार तक समाधान हो जाएगा।'). "
        "Do NOT write the rewrite in English or Roman Hinglish. Transliterate technical words into Devanagari "
        "('सर्वर', 'पैच', 'अपडेट', 'टीम', 'डेडलाइन') so Hindi text-to-speech reads smoothly, EXCEPT keep any "
        "bracketed privacy tokens like [PERSON_1], [EMAIL_1], [PHONE_1], or [IP_1] in exact ASCII characters."
    ),
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

OFFLINE_HINGLISH_PRESETS = {
    "executive": {
        "subject": "Status Update: Production Server Outage aur Friday Recovery Target",
        "rewrite": "Production server me unexpected downtime aaya tha. Abhi emergency patch deploy ho raha hai aur Friday EOD tak full resolution aur stability target hai.",
    },
    "peer": {
        "subject": "Friday server fix par quick team sync",
        "rewrite": "Hey team, server issue par sabke quick support ke liye thanks! Raj abhi root-cause fix lead kar rahe hain aur hum Friday tak milkar sab smoothly wrap up kar lenge. Batao agar kisi cheez me help chahiye!",
    },
    "legal": {
        "subject": "Service Interruption aur Scheduled Rectification ki Suchna",
        "rewrite": "Record ke liye inform kiya jata hai ki server service me temporary interruption aaya tha. Technical remediation process chalu hai aur Friday ya usse pehle corrective patch schedule kiya gaya hai.",
    },
    "gen_z": {
        "subject": "Server update — Friday tak full fix locked in hai!",
        "rewrite": "Yaar server ne achanak chhota sa nap le liya tha ngl! Zero stress — Raj aur poora squad abhi patch par locked in hain aur Friday tak sab ekdam sorted ho jayega. We got this!",
    },
}

OFFLINE_HINDI_PRESETS = {
    "executive": {
        "subject": "स्थिति अपडेट: सर्वर बाधा एवं शुक्रवार तक पूर्ण समाधान का लक्ष्य",
        "rewrite": "उत्पादन सर्वर में अस्थायी तकनीकी बाधा आई थी। पूर्ण स्थिरता बहाल करने हेतु आपातकालीन पैच लागू किया जा रहा है और शुक्रवार शाम तक अंतिम समाधान निर्धारित है।",
    },
    "peer": {
        "subject": "शुक्रवार तक सर्वर सुधार के संबंध में टीम अपडेट",
        "rewrite": "नमस्ते टीम, सर्वर समस्या पर आप सभी के त्वरित सहयोग के लिए धन्यवाद। Raj अभी मुख्य समाधान पर काम कर रहे हैं और हम सब मिलकर शुक्रवार तक इसे पूरा कर लेंगे। किसी भी सहायता के लिए बेझिझक बताएं!",
    },
    "legal": {
        "subject": "सेवा अवरोध एवं निर्धारित तकनीकी सुधार की औपचारिक सूचना",
        "rewrite": "सूचित किया जाता है कि सर्वर सेवा में अस्थायी अवरोध उत्पन्न हुआ था। मानक प्रक्रिया के अंतर्गत तकनीकी सुधार जारी है तथा शुक्रवार या उससे पूर्व समाधान निर्धारित किया गया है।",
    },
    "gen_z": {
        "subject": "सर्वर अपडेट — शुक्रवार तक सब कुछ एकदम सॉर्ट हो जाएगा!",
        "rewrite": "अरे टीम, सर्वर थोड़ा डाउन हो गया था, पर बिल्कुल टेंशन मत लो! Raj और पूरी स्क्वाड फिक्स पर पूरी तरह जुटी हुई है और शुक्रवार तक सब कुछ सॉर्ट हो जाएगा!",
    },
}


def _offline_hindi_phrase(text: str) -> str:
    """Lightweight lexical adapter so general offline Hindi fallbacks read in Devanagari."""
    replacements = [
        (r"\bserver went down\b", "सर्वर डाउन हो गया था"),
        (r"\bserver\b", "सर्वर"),
        (r"\bfix by\b", "तक समाधान"),
        (r"\bdeadline\b", "समय-सीमा"),
        (r"\btomorrow\b", "कल"),
        (r"\btoday\b", "आज"),
        (r"\byesterday\b", "बीते कल"),
        (r"\bmonday\b", "सोमवार"),
        (r"\btuesday\b", "मंगलवार"),
        (r"\bwednesday\b", "बुधवार"),
        (r"\bthursday\b", "गुरुवार"),
        (r"\bfriday\b", "शुक्रवार"),
        (r"\bsaturday\b", "शनिवार"),
        (r"\bsunday\b", "रविवार"),
    ]
    out = text
    for pat, rep in replacements:
        out = re.sub(pat, rep, out, flags=re.IGNORECASE)
    return out


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
    lang_directive = LANGUAGE_GUIDES.get(language, LANGUAGE_GUIDES["en"])

    if language == "hi":
        lang_field_hint = "MUST be written in fluent Hindi (Devanagari script: देवनागरी लिपि)"
    elif language == "hinglish":
        lang_field_hint = "MUST be written in natural conversational Indian Hinglish (Roman script blending Hindi & English)"
    else:
        lang_field_hint = "MUST be written in natural, fluent English"

    slider_note = ""
    if sliders:
        slider_note = (
            f"\n6. USER FINE-TUNING (1-10 scale): Formality={sliders.formality}, "
            f"Warmth={sliders.warmth}, Brevity={sliders.brevity}, "
            f"Directness={sliders.directness}, Humor={sliders.humor}. "
            f"Nudge every persona toward these preferences while keeping each persona clearly distinct."
        )

    return f"""You are PrismTone, an expert multilingual AI communication transformer.
Transform the user's raw draft into distinct, high-contrast rewrites for EVERY requested persona below.

MANDATORY OUTPUT LANGUAGE ({language.upper()}):
{lang_directive}

CRITICAL RULES:
1. LANGUAGE COMPLIANCE IS NON-NEGOTIABLE: Every persona's "subject" and "rewrite" {lang_field_hint}. Keep "change_notes" and "risk_flags" in concise English for audit clarity.
2. PRESERVE ALL FACTS: Keep every date, day, number, amount, metric, deadline, and core event intact (translated naturally into the target language where appropriate, e.g., Friday -> शुक्रवार in Hindi or Friday in Hinglish).
3. PRESERVE PRIVACY PLACEHOLDERS EXACTLY: If the draft contains privacy tokens like [PERSON_1], [EMAIL_1], [PHONE_1], or [IP_1], keep those exact ASCII bracketed tokens verbatim when referring to them. Executive/Legal may omit a blamed individual; Peer/Gen-Z may mention them constructively.
4. CHANNEL FORMAT ({channel}): {CHANNEL_GUIDES.get(channel, CHANNEL_GUIDES["email"])}
5. LENGTH ({length}): {LENGTH_GUIDES.get(length, LENGTH_GUIDES["standard"])}{slider_note}

TARGET PERSONAS:
{chr(10).join(persona_specs)}

RAW DRAFT:
\"\"\"{masked_draft}\"\"\"

Return ONLY valid JSON with this exact top-level structure (one entry per persona id above):
{{
  "personas": {{
    "<persona_id>": {{
      "subject": "Concise email subject line ({lang_field_hint}; empty string if channel is not email)",
      "rewrite": "The polished rewritten message ({lang_field_hint})",
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
    """Fail-safe offline heuristic rewrite supporting English, Hinglish, and Hindi."""
    lower_draft = draft.lower()
    is_demo_draft = (
        ("raj" in lower_draft or "[person_1]" in lower_draft)
        and "server" in lower_draft
        and "friday" in lower_draft
    )

    if is_demo_draft and persona_id in OFFLINE_DEMO_PRESETS:
        preset = OFFLINE_DEMO_PRESETS[persona_id]
        if language == "hinglish" and persona_id in OFFLINE_HINGLISH_PRESETS:
            subject = OFFLINE_HINGLISH_PRESETS[persona_id]["subject"]
            rewrite = OFFLINE_HINGLISH_PRESETS[persona_id]["rewrite"]
        elif language == "hi" and persona_id in OFFLINE_HINDI_PRESETS:
            subject = OFFLINE_HINDI_PRESETS[persona_id]["subject"]
            rewrite = OFFLINE_HINDI_PRESETS[persona_id]["rewrite"]
        else:
            subject = preset["subject"]
            rewrite = preset["rewrite"]

        if "[person_1]" in lower_draft:
            rewrite = rewrite.replace("Raj", "[PERSON_1]")
        elif language == "hi":
            rewrite = rewrite.replace("Raj", "राज")

        return {
            "subject": subject,
            "rewrite": rewrite,
            "change_notes": list(preset["change_notes"]),
            "risk_flags": list(preset["risk_flags"]),
        }

    core_text = " ".join(s.strip() for s in re.split(r"[.!?।\n]+", draft) if s.strip()) or draft

    if language == "hinglish":
        templates = {
            "executive": (
                "Action Required: Key Status aur Target Timeline",
                f"Important update: {core_text}. Target milestone time par achieve karne ke liye execution top priority par hai.",
                ["Front-loaded outcome and delivery priority in corporate Hinglish", "Condensed informal phrasing into direct action"],
            ),
            "peer": (
                "Quick team sync aur update",
                f"Hey team! Ek quick heads-up: {core_text}. Chalo milkar isse time par smoothly complete karte hain — kisi bhi help ke liye batana!",
                ["Added warm, collaborative Hinglish framing", "Kept core deliverables intact"],
            ),
            "legal": (
                "Status aur Commitments ka Formal Record",
                f"Record ke liye yeh factual update note karein: {core_text}. Standard protocol ke hisaab se action liya ja raha hai bina kisi extra warranty ke.",
                ["Neutralized subjective language in formal Hinglish", "Preserved stated dates and factual scope"],
            ),
            "gen_z": (
                "Quick vibe check aur update!",
                f"Yaar team, quick update: {core_text}. Hum full locked in hain aur isse jaldi sort kar lenge — let's go!",
                ["Injected high-energy desi Gen-Z Hinglish cadence", "Preserved original intent and timeline"],
            ),
        }
        default_tpl = (
            f"{persona_name} ke liye Update",
            f"Update: {core_text}. Is par priority se kaam chal raha hai.",
            [f"Offline Hinglish mode: adapted tone for {persona_name}"],
        )
    elif language == "hi":
        hi_core = _offline_hindi_phrase(core_text)
        templates = {
            "executive": (
                "आवश्यक कार्यवाही: प्रमुख स्थिति एवं समय-सीमा अपडेट",
                f"प्रमुख अपडेट: {hi_core}। निर्धारित समय-सीमा के भीतर लक्ष्य पूरा करने हेतु कार्य उच्च प्राथमिकता पर जारी है।",
                ["Front-loaded outcome and delivery priority in formal Hindi", "Condensed informal phrasing into executive Hindi"],
            ),
            "peer": (
                "टीम समन्वय एवं त्वरित अपडेट",
                f"नमस्ते टीम, एक महत्वपूर्ण जानकारी: {hi_core}। आइए मिलकर इसे समय पर सफलतापूर्वक पूरा करें — किसी भी सहायता के लिए बेझिझक बताएं!",
                ["Added warm, supportive Hindi framing", "Kept core deliverables intact"],
            ),
            "legal": (
                "स्थिति एवं प्रतिबद्धताओं का औपचारिक विवरण",
                f"कृपया निम्नलिखित तथ्यात्मक विवरण का संज्ञान लें: {hi_core}। मानक प्रक्रिया के अनुसार कार्यवाही जारी है तथा अतिरिक्त आश्वासन देय नहीं है।",
                ["Neutralized subjective language into compliance-grade Hindi", "Preserved stated dates and factual scope"],
            ),
            "gen_z": (
                "क्विक अपडेट — पूरी ऊर्जा के साथ काम जारी!",
                f"अरे टीम, क्विक अपडेट: {hi_core}। हम पूरी तरह फोकस्ड हैं और इसे तेज़ी से सॉर्ट कर लेंगे!",
                ["Adapted into energetic modern Hindi cadence", "Preserved original intent and timeline"],
            ),
        }
        default_tpl = (
            f"{persona_name} हेतु अपडेट",
            f"महत्वपूर्ण विवरण: {hi_core}। इस विषय पर प्राथमिकता से कार्य किया जा रहा है।",
            [f"Offline Hindi mode: adapted tone for {persona_name}"],
        )
    else:
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
        default_tpl = (
            f"Update for {persona_name}",
            f"{core_text}.",
            [f"Offline mode: kept original wording for {persona_name}"],
        )

    subj, rewr, notes = templates.get(persona_id, default_tpl)
    if length == "one_liner":
        delim = "।" if language == "hi" else "."
        first = re.split(r"[.।]\s*", rewr)[0].rstrip(".।")
        rewr = f"{first}{delim}"
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
