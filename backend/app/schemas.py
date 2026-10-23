"""
PrismTone Data Contracts & Pydantic Schemas
Defines request and response structures for full type safety.
"""
from typing import List, Dict, Optional, Literal
from pydantic import BaseModel, Field, field_validator

MAX_DRAFT_CHARS = 5000
MAX_PERSONAS = 6


class SliderSettings(BaseModel):
    formality: int = Field(default=5, ge=1, le=10, description="1 (Ultra casual) to 10 (Strictly formal)")
    warmth: int = Field(default=5, ge=1, le=10, description="1 (Ice cold) to 10 (Empathetic / warm)")
    brevity: int = Field(default=5, ge=1, le=10, description="1 (Elaborate) to 10 (Ultra concise)")
    directness: int = Field(default=5, ge=1, le=10, description="1 (Diplomatic / gentle) to 10 (Direct to the point)")
    humor: int = Field(default=1, ge=1, le=10, description="1 (Deadpan serious) to 10 (Playful)")


class CustomPersona(BaseModel):
    """User-defined audience persona created in the Persona Builder."""
    id: str = Field(..., pattern=r"^[a-z0-9_]{2,40}$")
    name: str = Field(..., min_length=1, max_length=40)
    description: str = Field(..., min_length=5, max_length=400)


class FactItem(BaseModel):
    text: str
    category: Literal["date", "number", "name", "amount", "commitment", "entity"]
    status: Literal["preserved", "modified", "missing", "new"]
    explanation: Optional[str] = None


class DiffChunk(BaseModel):
    type: Literal["unchanged", "added", "deleted"]
    text: str


class ToneMetrics(BaseModel):
    formality: float = Field(ge=1.0, le=10.0)
    warmth: float = Field(ge=1.0, le=10.0)
    directness: float = Field(ge=1.0, le=10.0)
    brevity: float = Field(default=5.0, ge=1.0, le=10.0)
    readability: float = Field(default=5.0, ge=1.0, le=10.0)
    reading_grade: float
    reading_level_label: str
    length_change_pct: float
    change_score: float = Field(ge=0.0, le=100.0, description="0 (identical) to 100 (complete overhaul)")
    word_count: int


class PersonaOutput(BaseModel):
    persona_id: str
    persona_name: str
    tagline: str
    rewrite: str
    subject_line: Optional[str] = None
    metrics: ToneMetrics
    facts_found: List[FactItem] = []
    fact_guard_status: Literal["green", "amber", "red"] = "green"
    risk_flags: List[str] = []
    change_notes: List[str] = []
    diff_tokens: List[DiffChunk] = []


class TransformRequest(BaseModel):
    draft: str = Field(..., min_length=2, max_length=MAX_DRAFT_CHARS, description="Raw draft or bullet points")
    personas: List[str] = Field(
        default=["executive", "peer", "legal", "gen_z"],
        min_length=1,
        max_length=MAX_PERSONAS,
        description="Target persona ids to generate (built-in or custom)",
    )
    custom_personas: List[CustomPersona] = Field(default_factory=list, max_length=MAX_PERSONAS)
    channel: Literal["email", "slack", "whatsapp", "linkedin", "sms"] = "email"
    length: Literal["one_liner", "short", "standard"] = "standard"
    language: Literal["en", "hi", "hinglish"] = "en"
    privacy_mode: bool = Field(default=True, description="Mask PII before processing and unmask in output")
    sliders: Optional[SliderSettings] = None
    fresh: bool = Field(default=False, description="Bypass the response cache and sample a new variation")
    api_key: Optional[str] = None

    @field_validator("draft")
    @classmethod
    def draft_not_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Draft must contain at least 2 non-space characters")
        return value

    @field_validator("personas")
    @classmethod
    def dedupe_personas(cls, value: List[str]) -> List[str]:
        cleaned = list(dict.fromkeys(p.strip() for p in value if p and p.strip()))
        if not cleaned:
            raise ValueError("Select at least one persona")
        return cleaned


class TransformResponse(BaseModel):
    original_text: str
    original_metrics: Dict[str, float]
    results: Dict[str, PersonaOutput]
    processing_time_ms: float
    privacy_masked: bool = False
    masked_entities_count: int = 0
    ai_engine: str = "offline_fallback"
    model_used: str = "heuristic-v1"


class DiffRequest(BaseModel):
    text1: str = Field(..., min_length=1, max_length=6000)
    text2: str = Field(..., min_length=1, max_length=6000)


class DiffResponse(BaseModel):
    diff_tokens: List[DiffChunk]
    change_score: float


class ToneDecodeRequest(BaseModel):
    incoming_text: str = Field(..., min_length=2, max_length=MAX_DRAFT_CHARS)
    api_key: Optional[str] = None

    @field_validator("incoming_text")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Message must contain at least 2 non-space characters")
        return value


class SuggestedReplyAngle(BaseModel):
    title: str
    vibe: str
    recommended_snippet: str


class ToneDecodeResponse(BaseModel):
    dominant_tone: str
    formality_score: float
    urgency_level: Literal["Low", "Medium", "High", "Critical"]
    hidden_subtext: str
    sentiment: Literal["Positive", "Neutral", "Guarded", "Passive-Aggressive", "Critical"]
    key_signals: List[str]
    suggested_reply_strategies: List[SuggestedReplyAngle]
    ai_engine: str = "offline_fallback"
    model_used: str = "heuristic-v1"
