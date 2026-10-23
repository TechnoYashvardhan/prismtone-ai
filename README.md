# PrismTone — Instant Persona & Communication Transformer

> **Write once. Sound right to everyone.**
> *One rough draft, many voices, and mathematical proof of exactly what changed.*

Built for **Vibeathon 2026 (Problem 1: Artificial Intelligence)** — Graphic Era Hill University, Bhimtal Campus.

---

## ✨ Key Highlights

- **4 Parallel Personas**: Instantly refracts a messy draft into **Executive C-Level**, **Supportive Peer**, **Legal & Compliance**, and **Gen-Z Hype** simultaneously.
- **Interactive Word-Level Diff**: Toggle between Clean Polished View and Word-Level Diff (inline additions, deletions, and unchanged words).
- **Fact Guard Shield**: Automatically extracts dates, numbers, amounts, names, and commitments from the draft and verifies survival across every persona.
- **Tone Metrics & Change Score**: Computes Flesch-Kincaid Reading Grade, Formality, Warmth, Directness, and a normalized `0–100` Change Score.
- **Privacy Guard**: Masks sensitive PII (names, emails, phones, IPs) before AI processing and restores them cleanly in the final output.
- **Tone Decoder (Reverse Mode)**: Paste incoming emails/messages to uncover hidden subtext, urgency, passive-aggression, and 3 tactical reply angles.
- **Multi-Channel & Multi-Language**: Supports Email (with Subject lines), Slack, WhatsApp, LinkedIn, SMS across **English**, **Hinglish**, and **Hindi**.
- **Stage-Safe Failover**: Seamless Google Gemini AI engine paired with an instant offline heuristic fallback so live demos never stall.

---

## 🏗️ Tech Stack

- **Backend**: Python 3.12, FastAPI, Pydantic v2, Uvicorn, HTTPX, Google Gemini REST API
- **Frontend**: React 18, Vite 5, Lucide Icons, Glassmorphic CSS System

---

## 🚀 Quick Start

### 1. Backend
```bash
cd backend
cp .env.example .env   # Add GEMINI_API_KEY and GEMINI_MODEL
pip install -r requirements.txt
python run.py
```
- API Server: `http://127.0.0.1:8000`
- Interactive Swagger Docs: `http://127.0.0.1:8000/docs`

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
- Web App: `http://localhost:5173`
