"""
PrismTone Fact Guard Engine
Extracts numbers, dates, names, amounts, and commitments from the raw draft
and verifies their survival or alteration in the rewritten persona text.
"""
import re
from typing import List, Tuple
from app.schemas import FactItem

# Regex patterns for deterministic, instant fact extraction
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
        r'\b(?:fix by|complete by|finish by|launch by|deliver by|deploy by|deadline is|due by|outage|server down|bug|issue|incident|action item|blocker)\b',
        re.IGNORECASE
    )
}

COMMON_WORDS = {
    "The", "A", "An", "This", "That", "It", "We", "I", "You", "They", "He", "She",
    "Please", "Thanks", "Regards", "Dear", "Hi", "Hello", "Hey", "Team", "All",
    "Friday", "Monday", "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday"
}

def extract_facts_from_text(text: str) -> List[FactItem]:
    """
    Extracts high-priority fact candidates from original text.
    """
    facts: List[FactItem] = []
    seen = set()

    # 1. Dates
    for match in PATTERNS["date"].finditer(text):
        val = match.group().strip()
        if val.lower() not in seen:
            seen.add(val.lower())
            facts.append(FactItem(text=val, category="date", status="preserved"))

    # 2. Amounts
    for match in PATTERNS["amount"].finditer(text):
        val = match.group().strip()
        if val.lower() not in seen:
            seen.add(val.lower())
            facts.append(FactItem(text=val, category="amount", status="preserved"))

    # 3. Numbers (skip if already captured in amounts or dates)
    for match in PATTERNS["number"].finditer(text):
        val = match.group().strip()
        if val.lower() not in seen and not any(val in f.text for f in facts):
            seen.add(val.lower())
            facts.append(FactItem(text=val, category="number", status="preserved"))

    # 4. Commitments & incidents
    for match in PATTERNS["commitment"].finditer(text):
        val = match.group().strip()
        if val.lower() not in seen:
            seen.add(val.lower())
            facts.append(FactItem(text=val, category="commitment", status="preserved"))

    # 5. Names (proper nouns)
    for match in PATTERNS["name"].finditer(text):
        val = match.group().strip()
        if val not in COMMON_WORDS and val.lower() not in seen and len(val) > 2:
            seen.add(val.lower())
            facts.append(FactItem(text=val, category="name", status="preserved"))

    return facts

def verify_facts(original_facts: List[FactItem], rewrite: str) -> Tuple[List[FactItem], str]:
    """
    Verifies which original facts survived in the rewrite.
    Returns the enriched fact checklist and an overall status ('green', 'amber', 'red').
    """
    rewrite_lower = rewrite.lower()
    verified: List[FactItem] = []
    missing_count = 0
    preserved_count = 0

    for fact in original_facts:
        f_lower = fact.text.lower()
        # Direct presence check
        if f_lower in rewrite_lower:
            verified.append(FactItem(
                text=fact.text,
                category=fact.category,
                status="preserved",
                explanation=f"Preserved accurately in rewrite"
            ))
            preserved_count += 1
        else:
            # Check for close paraphrases or number word representations
            number_synonyms = {
                "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
                "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
                "server down": "outage", "outage": "downtime", "incident": "issue"
            }
            syn = number_synonyms.get(f_lower)
            if syn and syn in rewrite_lower:
                verified.append(FactItem(
                    text=fact.text,
                    category=fact.category,
                    status="modified",
                    explanation=f"Paraphrased as '{syn}'"
                ))
                preserved_count += 1
            else:
                verified.append(FactItem(
                    text=fact.text,
                    category=fact.category,
                    status="missing",
                    explanation=f"Omitted or heavily altered from original"
                ))
                missing_count += 1

    total = len(original_facts)
    if total == 0:
        guard_status = "green"
    elif missing_count == 0:
        guard_status = "green"
    elif missing_count <= 1 and total >= 3:
        guard_status = "amber"
    elif missing_count / total > 0.4:
        guard_status = "red"
    else:
        guard_status = "amber"

    return verified, guard_status
