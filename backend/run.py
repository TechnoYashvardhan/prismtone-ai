"""
Simple entrypoint runner for PrismTone FastAPI backend.
Run with: python run.py
"""
import sys
import os

# Ensure backend root is on Python sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

if __name__ == "__main__":
    import uvicorn
    from app.config import settings

    print("=" * 60)
    print(f"  Starting {settings.PROJECT_NAME} Backend v{settings.VERSION}")
    print(f"  Swagger Docs: http://{settings.HOST}:{settings.PORT}/docs")
    print(f"  Health Check: http://{settings.HOST}:{settings.PORT}/health")
    print("=" * 60)
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
