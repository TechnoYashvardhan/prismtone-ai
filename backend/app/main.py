"""
PrismTone Main FastAPI Application
Clean, modular, and high-performance API server.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.schemas import (
    TransformRequest, TransformResponse,
    ToneDecodeRequest, ToneDecodeResponse
)
from app.services.llm_engine import transform_draft, PERSONA_PROFILES
from app.services.tone_decoder import decode_incoming_message

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="PrismTone: Instant Persona and Communication Transformer API"
)

# CORS Middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    """Health and status endpoint."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "ai_ready": bool(settings.GEMINI_API_KEY or settings.OPENAI_API_KEY),
        "supported_personas": list(PERSONA_PROFILES.keys())
    }

@app.get(f"{settings.API_PREFIX}/presets")
def get_demo_presets():
    """Returns curated demo drafts for quick 1-click testing during presentations."""
    return [
        {
            "id": "vibeathon_official",
            "title": "Production Server Outage (Official Vibeathon Demo)",
            "category": "Engineering / Operations",
            "draft": "Server went down, it's Raj's fault, fix by Friday."
        },
        {
            "id": "student_professor",
            "title": "Late Assignment Submission (Student Preset)",
            "category": "Academic",
            "draft": "Missed the deadline for the AI lab because my laptop died. Can I submit tomorrow?"
        },
        {
            "id": "internship_hr",
            "title": "Interview Follow-Up (Early Career)",
            "category": "Career / Placement",
            "draft": "Interview was last week, nobody emailed me yet. Are you offering me the job or not?"
        },
        {
            "id": "manager_critique",
            "title": "Constructive Project Feedback (Manager)",
            "category": "Management",
            "draft": "The deck was bad and messy, you clearly didn't practice, redo the numbers before tomorrow."
        }
    ]

@app.get(f"{settings.API_PREFIX}/personas")
def get_personas():
    """Returns all available persona templates with metadata."""
    return PERSONA_PROFILES

@app.post(f"{settings.API_PREFIX}/transform", response_model=TransformResponse)
async def api_transform_draft(request: TransformRequest):
    """
    Transforms a rough draft into multi-persona communication cards
    with word diff, Fact Guard checklist, risk analysis, and change scoring.
    """
    try:
        response = await transform_draft(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post(f"{settings.API_PREFIX}/decode", response_model=ToneDecodeResponse)
async def api_decode_tone(request: ToneDecodeRequest):
    """
    Tone Decoder (Reverse Mode): Analyzes incoming message tone, hidden urgency,
    subtext translation, and offers 3 strategic reply angles.
    """
    try:
        return decode_incoming_message(request.incoming_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
