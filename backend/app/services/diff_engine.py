"""
PrismTone Diff Engine
High-precision word-level diff computation and change scoring using Python standard library difflib.
"""
import re
import difflib
from typing import List, Tuple
from app.schemas import DiffChunk

def tokenize_with_whitespace(text: str) -> List[str]:
    """
    Tokenizes text into words, punctuation, and whitespace chunks so reconstructing
    the text is lossless.
    """
    return re.findall(r'\S+|\s+', text)

def compute_word_diff(original: str, rewrite: str) -> List[DiffChunk]:
    """
    Generates word-level diff chunks (unchanged, added, deleted).
    """
    orig_tokens = tokenize_with_whitespace(original.strip())
    rewr_tokens = tokenize_with_whitespace(rewrite.strip())

    matcher = difflib.SequenceMatcher(None, orig_tokens, rewr_tokens)
    diff_chunks: List[DiffChunk] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            chunk_text = "".join(orig_tokens[i1:i2])
            if chunk_text:
                diff_chunks.append(DiffChunk(type="unchanged", text=chunk_text))
        elif tag == 'delete':
            chunk_text = "".join(orig_tokens[i1:i2])
            if chunk_text:
                diff_chunks.append(DiffChunk(type="deleted", text=chunk_text))
        elif tag == 'insert':
            chunk_text = "".join(rewr_tokens[j1:j2])
            if chunk_text:
                diff_chunks.append(DiffChunk(type="added", text=chunk_text))
        elif tag == 'replace':
            del_text = "".join(orig_tokens[i1:i2])
            add_text = "".join(rewr_tokens[j1:j2])
            if del_text:
                diff_chunks.append(DiffChunk(type="deleted", text=del_text))
            if add_text:
                diff_chunks.append(DiffChunk(type="added", text=add_text))

    return diff_chunks

WORD_TOKEN_RE = re.compile(r"[A-Za-z0-9]+|[\u0900-\u097F]+")

def calculate_change_score(original: str, rewrite: str, tone_shift: float = 0.0) -> float:
    """
    Computes a 0 to 100 'How much did it change?' score.
    Combines word-level edit ratio (SequenceMatcher similarity inverse) and tone delta.
    Supports both Latin (English/Hinglish) and Devanagari (Hindi) scripts cleanly.
    """
    orig_words = WORD_TOKEN_RE.findall(original.lower())
    rewr_words = WORD_TOKEN_RE.findall(rewrite.lower())

    if not orig_words and not rewr_words:
        return 0.0
    if not orig_words or not rewr_words:
        return 100.0

    # Sequence similarity from 0.0 (completely distinct) to 1.0 (identical)
    matcher = difflib.SequenceMatcher(None, orig_words, rewr_words)
    similarity = matcher.ratio()

    # Base edit change is (1 - similarity) * 100
    edit_change = (1.0 - similarity) * 100.0

    # Blend with tone shift (tone_shift is typically 0 to 10 scale, so * 3)
    blended = (edit_change * 0.75) + (min(tone_shift * 3.5, 30.0) * 0.25)
    
    # Clamp to [0, 100] with 1 decimal precision
    return round(max(0.0, min(100.0, blended)), 1)
