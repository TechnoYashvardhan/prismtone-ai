"""
PrismTone Gemini AI Client
Clean, resilient async JSON client for Google Gemini with automatic model failover.
"""
import json
import re
from typing import Any, Dict, Optional, Tuple
import httpx
from app.config import settings

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# Shared async HTTP client for connection pooling (avoids repeated TLS handshakes)
_http_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(7.5, connect=3.5))
    return _http_client


def _build_generation_config(model_name: str, temperature: float = 0.4) -> Dict[str, Any]:
    cfg: Dict[str, Any] = {
        "responseMimeType": "application/json",
        "temperature": temperature,
        "maxOutputTokens": 1200,
    }
    if "3.6-flash" in model_name or "2.5-flash" in model_name:
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


async def generate_gemini_json(
    prompt: str,
    api_key: Optional[str] = None,
    temperature: float = 0.45,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Calls primary Gemini model (models/gemini-3.6-flash) and automatically fails over
    to secondary fast model (models/gemini-3.5-flash-lite) on transient errors or quota limits.
    Returns (parsed_json_dict, model_used) or (None, None) if unavailable.
    """
    key = (api_key or settings.GEMINI_API_KEY).strip()
    if not key:
        return None, None

    model_chain = [settings.GEMINI_MODEL]
    if settings.GEMINI_FALLBACK_MODEL and settings.GEMINI_FALLBACK_MODEL not in model_chain:
        model_chain.append(settings.GEMINI_FALLBACK_MODEL)

    client = _get_client()

    for model_name in model_chain:
        url = f"{GEMINI_BASE_URL}/{model_name}:generateContent?key={key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": _build_generation_config(model_name, temperature),
        }
        try:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                parsed = _extract_json_dict(resp.json())
                if parsed is not None:
                    return parsed, model_name
        except Exception:
            continue

    return None, None
