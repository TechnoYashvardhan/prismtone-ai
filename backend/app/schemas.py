"""
PrismTone Data Contracts & Pydantic Schemas
Defines request and response structures for full type safety.
"""
from typing import List, Dict, Optional, Literal
from pydantic import BaseModel, Field

class SliderSettings(BaseModel):
    formality: int = Field(default=5, ge=1, le=10, description="1 (Ultra casual) to 10 (Strictly formal)")
    warmth: int = Field(default=5, ge=1, le=10, description="1 (Ice cold) to 10 (Empathetic / warm)")
    brevity: int = Field(default=5, ge=1, le=10, description="1 (Elaborate) to 10 (Ultra concise)")
    directness: int = Field(default=5, ge=1, le=10, description="1 (Diplomatic / gentle) to 10 (Direct to the point)")
    humor: int = Field(default=1, ge=1, le=10, description="1 (Deadpan serious) to 10 (Playful)")

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
    draft: str = Field(..., min_length=2, max_length=5000, description="Raw draft or bullet points")
    personas: List[str] = Field(
        default=["executive", "peer", "legal", "gen_z"],
        description="Target personas to generate"
    )
    channel: Literal["email", "slack", "whatsapp", "linkedin", "sms"] = "email"
    length: Literal["one_liner", "short", "standard"] = "standard"
    language: Literal["en", "hi", "hinglish"] = "en"
    privacy_mode: bool = Field(default=True, description="Mask PII before processing and unmask in output")
    sliders: Optional[SliderSettings] = None
    custom_persona_prompt: Optional[str] = None
    api_key: Optional[str] = None # Optional user-supplied API key

class TransformResponse(BaseModel):
    original_text: str
    original_metrics: Dict[str, float]
    results: Dict[str, PersonaOutput]
    processing_time_ms: float
    privacy_masked: bool = False
    masked_entities_count: int = 0

class ToneDecodeRequest(BaseModel):
    incoming_text: str = Field(..., min_length=2, max_length=5000)

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
