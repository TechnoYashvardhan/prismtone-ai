"""
PrismTone Main FastAPI Application
Clean, modular, and high-performance API server.
"""
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.schemas import (
    DiffRequest, DiffResponse,
    TransformRequest, TransformResponse,
    ToneDecodeRequest, ToneDecodeResponse,
)
from app.services.diff_engine import calculate_change_score, compute_word_diff
from app.services.llm_engine import transform_draft, PERSONA_PROFILES
from app.services.tone_decoder import decode_incoming_message

logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("prismtone.api")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="PrismTone: Instant Persona and Communication Transformer API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_PRESETS = [
    {
        "id": "vibeathon_official",
        "title": "⚡ Vibeathon Official Demo",
        "category": "Engineering",
        "draft": "Server went down, it's Raj's fault, fix by Friday.",
    },
    {
        "id": "student_professor",
        "title": "🎓 Professor Extension Request",
        "category": "Academic",
        "draft": "Missed the deadline for the AI lab because my laptop died. Can I submit tomorrow?",
    },
    {
        "id": "placement_hr",
        "title": "💼 Placement Drive Follow-Up",
        "category": "Career",
        "draft": "Interview was last week, nobody emailed me yet. Are you offering me the job or not?",
    },
    {
        "id": "club_announcement",
        "title": "📣 College Club Announcement",
        "category": "Campus",
        "draft": "Coding club meetup on Saturday 4pm in Lab 3. Bring laptops. Pizza for first 30 people.",
    },
    {
        "id": "manager_critique",
        "title": "👔 Manager Feedback",
        "category": "Management",
        "draft": "The deck was bad and messy, you clearly didn't practice, redo the numbers before tomorrow.",
    },
]


@app.get("/")
def root():
    """Root landing endpoint for cloud deployment verification."""
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "docs_url": "/docs",
        "health_url": "/health",
        "model": settings.GEMINI_MODEL,
    }


@app.get("/health")
def health_check():
    """Health and AI model status endpoint."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "ai_ready": bool(settings.GEMINI_API_KEY),
        "primary_model": settings.GEMINI_MODEL,
        "fallback_model": settings.GEMINI_FALLBACK_MODEL,
        "supported_personas": list(PERSONA_PROFILES.keys()),
    }


@app.get(f"{settings.API_PREFIX}/presets")
def get_demo_presets():
    """Curated demo drafts for 1-click testing during presentations."""
    return DEMO_PRESETS


@app.get(f"{settings.API_PREFIX}/personas")
def get_personas():
    """All built-in persona templates with metadata."""
    return {pid: {"name": p["name"], "tagline": p["tagline"]} for pid, p in PERSONA_PROFILES.items()}


@app.post(f"{settings.API_PREFIX}/transform", response_model=TransformResponse)
async def api_transform_draft(request: TransformRequest):
    """Multi-persona rewrite with word diff, Fact Guard, risk flags, and tone metrics."""
    try:
        return await transform_draft(request)
    except Exception:
        logger.exception("Transform failed")
        raise HTTPException(status_code=500, detail="Transformation failed. Please retry.")


@app.post(f"{settings.API_PREFIX}/diff", response_model=DiffResponse)
def api_diff(request: DiffRequest):
    """Word-level diff between any two texts (used by Compare Mode)."""
    return DiffResponse(
        diff_tokens=compute_word_diff(request.text1, request.text2),
        change_score=calculate_change_score(request.text1, request.text2),
    )


@app.post(f"{settings.API_PREFIX}/decode", response_model=ToneDecodeResponse)
async def api_decode_tone(request: ToneDecodeRequest):
    """Tone Decoder (Reverse Mode): subtext, urgency, and 3 tactical reply angles."""
    try:
        return await decode_incoming_message(request.incoming_text, api_key=request.api_key)
    except Exception:
        logger.exception("Decode failed")
        raise HTTPException(status_code=500, detail="Tone decoding failed. Please retry.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
