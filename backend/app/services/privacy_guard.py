"""
PrismTone Privacy Guard
Masks personally identifiable information (PII) before sending to AI,
and faithfully restores them after rewriting.
"""
import re
from typing import Tuple, Dict

EMAIL_REGEX = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
PHONE_REGEX = re.compile(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b')
IP_REGEX = re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b')

# Common first names to safeguard if mentioned
COMMON_NAMES = [
    "Raj", "Rahul", "Priya", "Amit", "Anjali", "Sanjay", "Neha", "Vikram",
    "John", "Sarah", "Alex", "David", "Emily", "Michael", "Jessica", "James"
]

def mask_pii(text: str) -> Tuple[str, Dict[str, str]]:
    """
    Replaces sensitive personal tokens with privacy placeholders.
    Returns (masked_text, restoration_map).
    """
    mapping: Dict[str, str] = {}
    counter = {"EMAIL": 1, "PHONE": 1, "IP": 1, "PERSON": 1}

    def replace_email(m):
        placeholder = f"[EMAIL_{counter['EMAIL']}]"
        mapping[placeholder] = m.group(0)
        counter["EMAIL"] += 1
        return placeholder

    def replace_phone(m):
        placeholder = f"[PHONE_{counter['PHONE']}]"
        mapping[placeholder] = m.group(0)
        counter["PHONE"] += 1
        return placeholder

    def replace_ip(m):
        placeholder = f"[IP_{counter['IP']}]"
        mapping[placeholder] = m.group(0)
        counter["IP"] += 1
        return placeholder

    masked = EMAIL_REGEX.sub(replace_email, text)
    masked = PHONE_REGEX.sub(replace_phone, masked)
    masked = IP_REGEX.sub(replace_ip, masked)

    # Names check
    for name in COMMON_NAMES:
        pattern = re.compile(rf"\b{name}\b", re.IGNORECASE)
        if pattern.search(masked):
            placeholder = f"[PERSON_{counter['PERSON']}]"
            # Get actual casing from text
            match = pattern.search(masked)
            mapping[placeholder] = match.group(0)
            masked = pattern.sub(placeholder, masked)
            counter["PERSON"] += 1

    return masked, mapping

def unmask_pii(text: str, mapping: Dict[str, str]) -> str:
    """
    Restores original sensitive values from placeholders (case-insensitive).
    """
    result = text
    for placeholder, original in mapping.items():
        result = re.sub(re.escape(placeholder), lambda _: original, result, flags=re.IGNORECASE)
        bare = placeholder.strip("[]")
        result = re.sub(rf"\b{re.escape(bare)}\b", lambda _: original, result, flags=re.IGNORECASE)
    return result
