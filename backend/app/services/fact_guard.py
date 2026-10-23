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
    "server went down": [
        "outage", "downtime", "disruption", "interruption", "hit", "nap", "issue", "down",
        "server", "सर्वर", "डाउन", "बाधित", "खराबी", "बंद", "रुकावट", "band", "kharab",
    ],
    "server down": [
        "outage", "downtime", "disruption", "interruption", "issue",
        "सर्वर", "डाउन", "बाधित", "बंद", "रुकावट", "band",
    ],
    "outage": ["downtime", "disruption", "interruption", "server", "सर्वर", "बाधित", "डाउन", "रुकावट"],
    "incident": ["issue", "disruption", "event", "घटना", "समस्या", "बाधा"],
    "blocker": ["issue", "impediment", "bottleneck", "रुकावट", "बाधा", "अड़चन", "समस्या"],
    "fix by": [
        "completion", "restoration", "remediation", "resolved", "sorted", "locked in",
        "scheduled", "fix", "patch", "wrap", "theek", "solv",
        "ठीक", "समाधान", "सुधार", "पैच", "पूरा", "फिक्स", "सॉर्ट",
    ],
    "complete by": ["completion", "target", "scheduled", "deliver", "finish", "पूरा", "संपन्न", "लक्ष्य", "pura"],
    "finish by": ["completion", "target", "scheduled", "wrap", "finish", "पूरा", "संपन्न", "खत्म", "khatam", "pura"],
    "launch by": ["launch", "release", "deploy", "लॉन्च", "रिलीज़", "प्रारंभ"],
    "deliver by": ["delivery", "deliver", "target", "डिलीवर", "सुपुर्द", "पूरा"],
    "deploy by": ["deploy", "deployment", "patch", "डिप्लॉय", "लागू"],
    "deadline": [
        "due", "extension", "submit", "schedule", "milestone", "by",
        "समय-सीमा", "समय सीमा", "अंतिम तिथि", "डेडलाइन", "तारीख", "तक", "tak",
    ],
    "due by": ["due", "deadline", "by", "तक", "अंतिम तिथि"],
    # Days & relative dates (Hindi Devanagari + Roman Hinglish)
    "monday": ["सोमवार", "somwar", "somvaar"],
    "tuesday": ["मंगलवार", "mangalwar", "mangalvaar"],
    "wednesday": ["बुधवार", "budhwar", "budhvaar"],
    "thursday": ["गुरुवार", "बृहस्पतिवार", "guruwar", "guruvaar", "वीरवार"],
    "friday": ["शुक्रवार", "shukrawar", "shukravaar", "shukarwar"],
    "saturday": ["शनिवार", "shaniwar", "shanivaar"],
    "sunday": ["रविवार", "इतवार", "raviwar", "ravivaar", "itwaar"],
    "today": ["आज", "aaj"],
    "tomorrow": ["कल", "kal", "अगले दिन"],
    "yesterday": ["कल", "बीते कल", "kal"],
    "eod": ["दिन के अंत", "शाम तक", "shaam tak", "end of day"],
    "asap": ["जल्द से जल्द", "तुरंत", "शीघ्र", "jald", "turant", "immediately"],
    # Numbers (words + Devanagari digits/words)
    "0": ["zero", "शून्य", "०"],
    "1": ["one", "एक", "१", "ek"],
    "2": ["two", "दो", "२", "do"],
    "3": ["three", "तीन", "३", "teen"],
    "4": ["four", "चार", "४", "chaar", "char"],
    "5": ["five", "पांच", "पाँच", "५", "paanch", "panch"],
    "6": ["six", "छह", "६", "chhah", "cheh"],
    "7": ["seven", "सात", "७", "saat"],
    "8": ["eight", "आठ", "८", "aath"],
    "9": ["nine", "नौ", "९", "nau"],
    "10": ["ten", "दस", "१०", "das"],
    "one": ["1", "एक", "१", "ek"],
    "two": ["2", "दो", "२", "do"],
    "three": ["3", "तीन", "३", "teen"],
    "four": ["4", "चार", "४", "chaar"],
    "five": ["5", "पांच", "पाँच", "५", "paanch"],
    # Common names transliterated into Devanagari when Privacy Guard is off
    "raj": ["राज"],
    "rahul": ["राहुल"],
    "priya": ["प्रिया"],
    "amit": ["अमित"],
    "anjali": ["अंजलि", "अंजली"],
    "sanjay": ["संजय"],
    "neha": ["नेहा"],
    "vikram": ["विक्रम"],
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
