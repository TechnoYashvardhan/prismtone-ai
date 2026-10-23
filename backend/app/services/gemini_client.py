"""
PrismTone Gemini AI Client
Clean, resilient async JSON client for Google Gemini with:
- automatic model failover (primary -> lite)
- per-model timeouts
- a small in-memory LRU cache (instant repeat demos, saves free-tier quota)
"""
import copy
import hashlib
import json
import logging
import re
from collections import OrderedDict
from typing import Any, Dict, Optional, Tuple

import httpx
from app.config import settings

logger = logging.getLogger("prismtone.gemini")

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
PRIMARY_TIMEOUT_S = 14.0
FALLBACK_TIMEOUT_S = 9.0
CACHE_MAX_ENTRIES = 64

_http_client: Optional[httpx.AsyncClient] = None
_cache: "OrderedDict[str, Tuple[Dict[str, Any], str]]" = OrderedDict()


def _get_client() -> httpx.AsyncClient:
    """Shared async client so TLS connections are reused between requests."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(PRIMARY_TIMEOUT_S, connect=4.0))
    return _http_client


def _build_generation_config(model_name: str, temperature: float) -> Dict[str, Any]:
    """
    Tailors generationConfig per model family (verified empirically):
    - gemini-3.6-flash accepts thinkingBudget=0, which makes structured JSON ~2.4x faster.
    - gemini-3.5-flash-lite rejects thinkingBudget, and is fast without it.
    """
    cfg: Dict[str, Any] = {
        "responseMimeType": "application/json",
        "temperature": temperature,
        "maxOutputTokens": 2400,
    }
    if "3.6-flash" in model_name:
        cfg["thinkingConfig"] = {"thinkingBudget": 0}
    return cfg


def _extract_json_dict(raw_response: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    candidates = raw_response.get("candidates") or []
    if not candidates:
        return None
    parts = candidates[0].get("content", {}).get("parts") or []
    text_part = next(
        (p.get("text", "") for p in parts if "text" in p and not p.get("thought")),
        parts[-1].get("text", "") if parts else "",
    )
    if not text_part:
        return None
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text_part.strip())
    parsed = json.loads(cleaned)
    return parsed if isinstance(parsed, dict) else None


def _cache_get(key: str) -> Optional[Tuple[Dict[str, Any], str]]:
    if key not in _cache:
        return None
    _cache.move_to_end(key)
    data, model = _cache[key]
    return copy.deepcopy(data), model


def _cache_put(key: str, data: Dict[str, Any], model: str) -> None:
    _cache[key] = (copy.deepcopy(data), model)
    _cache.move_to_end(key)
    while len(_cache) > CACHE_MAX_ENTRIES:
        _cache.popitem(last=False)


async def generate_gemini_json(
    prompt: str,
    api_key: Optional[str] = None,
    temperature: float = 0.4,
    use_cache: bool = True,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Calls the primary Gemini model and fails over to the lite model on errors,
    timeouts, quota limits, or malformed JSON.
    Returns (parsed_json_dict, model_used) or (None, None) if AI is unavailable.
    """
    key = (api_key or settings.GEMINI_API_KEY).strip()
    if not key:
        return None, None

    cache_key = hashlib.sha256(f"{temperature}|{prompt}".encode("utf-8")).hexdigest()
    if use_cache:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    model_chain = [(settings.GEMINI_MODEL, PRIMARY_TIMEOUT_S)]
    if settings.GEMINI_FALLBACK_MODEL and settings.GEMINI_FALLBACK_MODEL != settings.GEMINI_MODEL:
        model_chain.append((settings.GEMINI_FALLBACK_MODEL, FALLBACK_TIMEOUT_S))

    client = _get_client()
    # Key goes in a header (not the URL) so it never leaks into logs or tracebacks.
    headers = {"x-goog-api-key": key, "Content-Type": "application/json"}

    for model_name, timeout_s in model_chain:
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": _build_generation_config(model_name, temperature),
        }
        try:
            resp = await client.post(
                f"{GEMINI_BASE_URL}/{model_name}:generateContent",
                json=payload,
                headers=headers,
                timeout=timeout_s,
            )
            if resp.status_code != 200:
                logger.warning("Gemini %s returned HTTP %s: %s", model_name, resp.status_code, resp.text[:200])
                continue
            parsed = _extract_json_dict(resp.json())
            if parsed is not None:
                _cache_put(cache_key, parsed, model_name)
                return parsed, model_name
            logger.warning("Gemini %s returned an empty or non-object payload", model_name)
        except (httpx.HTTPError, json.JSONDecodeError, KeyError, IndexError, ValueError) as exc:
            logger.warning("Gemini %s failed: %s", model_name, type(exc).__name__)
            continue

    return None, None
