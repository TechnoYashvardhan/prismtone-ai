"""
PrismTone Tone Analyzer & Risk Detector
Calculates Flesch-Kincaid Reading Grade, Formality, Warmth, Directness,
and inspects text for dangerous communication risk flags.
"""
import re
from typing import List, Dict, Tuple
from app.schemas import ToneMetrics

# Risk phrase patterns
RISK_PATTERNS = {
    "Blame language": re.compile(
        r"\b(?:fault|blame|screwed up|messed up|your mistake|their fault|failed to|careless|incompetent|dropped the ball)\b",
        re.IGNORECASE
    ),
    "Absolute / legally hazardous promise": re.compile(
        r"\b(?:guarantee|guaranteed|always|100% certain|promise you|cannot fail|never fail|no risk|foolproof)\b",
        re.IGNORECASE
    ),
    "Ambiguous / vague deadline": re.compile(
        r"\b(?:asap|as soon as possible|soon|later|whenever|at some point|shortly|in a bit|anytime soon)\b",
        re.IGNORECASE
    ),
    "Passive-aggressive tone": re.compile(
        r"\b(?:per my last email|as stated previously|obviously|clearly you|needless to say|if you had read)\b",
        re.IGNORECASE
    )
}

def count_syllables_word(word: str) -> int:
    """Estimates syllable count of an English word."""
    word = word.lower().strip(".:;?!,'\"")
    if not word:
        return 1
    if len(word) <= 3:
        return 1
    # Count vowel groups
    count = len(re.findall(r'[aeiouy]+', word))
    # Adjust for silent 'e' at end
    if word.endswith('e') and not word.endswith('le') and count > 1:
        count -= 1
    return max(1, count)

def calculate_reading_grade(text: str) -> Tuple[float, str]:
    """
    Computes Flesch-Kincaid Grade Level:
    0.39 * (total words / total sentences) + 11.8 * (total syllables / total words) - 15.59
    """
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 0]
    num_sentences = max(1, len(sentences))

    words = re.findall(r'\b[a-zA-Z]+\b', text)
    num_words = max(1, len(words))

    total_syllables = sum(count_syllables_word(w) for w in words)

    asl = num_words / num_sentences  # Average Sentence Length
    asw = total_syllables / num_words  # Average Syllables per Word

    grade = 0.39 * asl + 11.8 * asw - 15.59
    grade = round(max(1.0, min(16.0, grade)), 1)

    if grade <= 5.0:
        label = "Grade 5 (Simple & Accessible)"
    elif grade <= 8.0:
        label = f"Grade {int(grade)} (Standard Public)"
    elif grade <= 12.0:
        label = f"Grade {int(grade)} (High School / Professional)"
    else:
        label = f"Grade {int(grade)}+ (Executive / Academic)"

    return grade, label

def detect_risk_flags(text: str) -> List[str]:
    """
    Scans text for compliance and reputational risk markers.
    """
    flags: List[str] = []
    for risk_name, pattern in RISK_PATTERNS.items():
        matches = pattern.findall(text)
        if matches:
            unique_matches = list(set([m.lower() for m in matches]))[:2]
            flags.append(f"{risk_name}: \"{', '.join(unique_matches)}\"")
    return flags

def estimate_tone_scores(text: str, persona_hint: str = "") -> Dict[str, float]:
    """
    Estimates Formality, Warmth, and Directness from 1.0 to 10.0 based on structural cues.
    """
    text_lower = text.lower()
    words = re.findall(r'\b\w+\b', text_lower)
    word_count = max(1, len(words))

    # Formality indicators
    contractions = len(re.findall(r"\b(can't|won't|it's|i'm|don't|let's|you're|we'll)\b", text_lower))
    slang = len(re.findall(r"\b(yo|fr|ngl|tbh|bet|fire|vibes|hyped|lowkey|highkey|fam|bruh|pls|thx)\b", text_lower))
    formal_words = len(re.findall(r"\b(sincerely|furthermore|regarding|pursuant|consequently|hereby|kindly|herewith|commence)\b", text_lower))

    base_formality = 5.0 + (formal_words * 1.5) - (contractions * 0.8) - (slang * 2.5)

    # Warmth indicators
    warm_words = len(re.findall(r"\b(appreciate|thanks|thank you|glad|great work|hope you|cheers|excited|warmly|kind|support|proud)\b", text_lower))
    emojis = len(re.findall(r'[\U00010000-\U0010ffff]', text))
    exclamations = text.count('!')
    base_warmth = 4.0 + (warm_words * 1.2) + (emojis * 1.0) + (min(exclamations, 3) * 0.5)

    # Directness indicators
    bullets = len(re.findall(r'(?:^|\n)\s*[-*•\d+.]\s+', text))
    action_verbs = len(re.findall(r"\b(action|deadline|by friday|fix|deliver|due|resolve|next steps|priority)\b", text_lower))
    word_brevity_bonus = 3.0 if word_count < 35 else (1.5 if word_count < 65 else 0.0)
    base_directness = 4.0 + (bullets * 1.2) + (action_verbs * 0.8) + word_brevity_bonus

    # Persona heuristic tuning
    if "executive" in persona_hint.lower():
        base_formality = max(base_formality, 7.8)
        base_directness = max(base_directness, 8.8)
        base_warmth = min(base_warmth, 4.5)
    elif "peer" in persona_hint.lower():
        base_warmth = max(base_warmth, 8.5)
        base_formality = max(base_formality, 5.0)
        base_directness = 6.5
    elif "legal" in persona_hint.lower():
        base_formality = max(base_formality, 9.2)
        base_directness = max(base_directness, 7.5)
        base_warmth = min(base_warmth, 2.5)
    elif "gen_z" in persona_hint.lower():
        base_formality = min(base_formality, 2.5)
        base_warmth = max(base_warmth, 7.5)
        base_directness = max(base_directness, 7.0)

    return {
        "formality": round(max(1.0, min(10.0, base_formality)), 1),
        "warmth": round(max(1.0, min(10.0, base_warmth)), 1),
        "directness": round(max(1.0, min(10.0, base_directness)), 1),
    }

def analyze_full_tone(original: str, rewrite: str, persona_hint: str = "") -> ToneMetrics:
    """
    Computes complete ToneMetrics package for a rewrite compared against original.
    """
    from app.services.diff_engine import calculate_change_score

    grade, grade_label = calculate_reading_grade(rewrite)
    scores = estimate_tone_scores(rewrite, persona_hint)

    orig_len = max(1, len(original.split()))
    rewr_len = len(rewrite.split())
    length_change_pct = round(((rewr_len - orig_len) / orig_len) * 100.0, 1)

    orig_scores = estimate_tone_scores(original)
    tone_delta = abs(scores["formality"] - orig_scores["formality"]) + abs(scores["warmth"] - orig_scores["warmth"])

    change_score = calculate_change_score(original, rewrite, tone_delta)

    return ToneMetrics(
        formality=scores["formality"],
        warmth=scores["warmth"],
        directness=scores["directness"],
        reading_grade=grade,
        reading_level_label=grade_label,
        length_change_pct=length_change_pct,
        change_score=change_score,
        word_count=rewr_len
    )
