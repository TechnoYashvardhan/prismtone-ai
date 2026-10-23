"""
PrismTone Fact Guard Engine
Extracts numbers, dates, names, amounts, and commitments from the raw draft
and verifies their survival or intentional sanitization in the rewritten persona text.
"""
import re
from typing import List, Tuple
from app.schemas import FactItem

PATTERNS = {
    "date": re.compile(
        r'\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|'
        r'today|tomorrow|yesterday|eod|cob|asap|'
        r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}(?:st|nd|rd|th)?|'
        r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b',
        re.IGNORECASE
    ),
    "amount": re.compile(
        r'(?:\$|€|£|₹|rs\.?|inr|usd)\s*\d+(?:[.,]\d+)?(?:\s*(?:k|m|million|billion|crore|lakh))?\b|\b\d+\s*(?:dollars|rupees|euros)\b',
        re.IGNORECASE
    ),
    "number": re.compile(
        r'\b\d+(?:\.\d+)?%?|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\b',
        re.IGNORECASE
    ),
    "name": re.compile(
        r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b'
    ),
    "commitment": re.compile(
        r'\b(?:server went down|server down|outage|fix by|complete by|finish by|launch by|deliver by|deploy by|deadline|due by|incident|blocker)\b',
        re.IGNORECASE
    )
}

COMMON_WORDS = {
    "The", "A", "An", "This", "That", "It", "We", "I", "You", "They", "He", "She",
    "Please", "Thanks", "Regards", "Dear", "Hi", "Hello", "Hey", "Team", "All",
    "Server", "Missed", "Interview", "Can", "Are", "Per", "Need",
    "Friday", "Monday", "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday"
}

SEMANTIC_EQUIVALENTS = {
    "server went down": ["outage", "downtime", "disruption", "interruption", "hit", "nap", "issue", "down"],
    "server down": ["outage", "downtime", "disruption", "interruption", "issue"],
    "outage": ["downtime", "disruption", "interruption", "server"],
    "fix by": ["completion", "restoration", "remediation", "resolved", "sorted", "locked in", "scheduled", "fix", "patch", "wrap"],
    "complete by": ["completion", "target", "scheduled", "deliver", "finish"],
    "deadline": ["due", "extension", "submit", "schedule", "milestone", "by"],
    "1": ["one"], "2": ["two"], "3": ["three"], "4": ["four"], "5": ["five"],
}

BLAME_TRIGGER = re.compile(r"\b(?:fault|blame|mistake|messed up|screwed up)\b", re.IGNORECASE)


def extract_facts_from_text(text: str) -> List[FactItem]:
    """Extracts high-priority fact anchors from original text."""
    facts: List[FactItem] = []
    seen = set()

    for category in ("date", "amount", "number", "commitment"):
        for match in PATTERNS[category].finditer(text):
            val = match.group().strip()
            low = val.lower()
            if low not in seen and not (category == "number" and any(val in f.text for f in facts)):
                seen.add(low)
                facts.append(FactItem(text=val, category=category, status="preserved"))

    for match in PATTERNS["name"].finditer(text):
        val = match.group().strip()
        if val not in COMMON_WORDS and val.lower() not in seen and len(val) > 2:
            seen.add(val.lower())
            facts.append(FactItem(text=val, category="name", status="preserved"))

    return facts


def verify_facts(
    original_facts: List[FactItem],
    rewrite: str,
    original_draft: str = "",
    persona_id: str = "",
) -> Tuple[List[FactItem], str]:
    """
    Verifies which original facts survived in the rewrite.
    Recognizes semantic paraphrases and intentional blame-removal in Executive/Legal personas.
    """
    rewrite_lower = rewrite.lower()
    has_blame_context = bool(BLAME_TRIGGER.search(original_draft))
    verified: List[FactItem] = []
    missing_critical = 0
    modified_count = 0

    for fact in original_facts:
        f_lower = fact.text.lower()
        if f_lower in rewrite_lower:
            verified.append(FactItem(
                text=fact.text,
                category=fact.category,
                status="preserved",
                explanation="Preserved verbatim in rewrite"
            ))
            continue

        # Check semantic equivalents
        equivalents = SEMANTIC_EQUIVALENTS.get(f_lower, [])
        matched_syn = next((eq for eq in equivalents if eq in rewrite_lower), None)
        if matched_syn:
            verified.append(FactItem(
                text=fact.text,
                category=fact.category,
                status="preserved",
                explanation=f"Preserved semantically ('{matched_syn}')"
            ))
            continue

        # Intentional de-blaming of a named individual in Executive / Legal personas
        if fact.category == "name" and has_blame_context and persona_id in ("executive", "legal"):
            verified.append(FactItem(
                text=fact.text,
                category=fact.category,
                status="modified",
                explanation="Blame-linked name omitted for executive/legal neutrality"
            ))
            modified_count += 1
            continue

        verified.append(FactItem(
            text=fact.text,
            category=fact.category,
            status="missing",
            explanation="Omitted from rewrite"
        ))
        missing_critical += 1

    if missing_critical == 0:
        guard_status = "green"
    elif missing_critical == 1 and len(original_facts) >= 3:
        guard_status = "amber"
    else:
        guard_status = "red"

    return verified, guard_status
