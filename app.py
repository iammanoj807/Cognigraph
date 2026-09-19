"""
Hugging Face Spaces entry point.

The Space uses the Gradio SDK (the free tier) but serves the same FastAPI backend
and built React UI as the Docker setup: the Space runs `python app.py`, which
starts the app on port 7860.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

import uvicorn
from main import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "7860")))
