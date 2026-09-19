---
title: CogniGraph
emoji: 🕸️
colorFrom: blue
colorTo: purple
sdk: gradio
sdk_version: "6.28.0"
python_version: "3.10"
app_file: app.py
pinned: false
short_description: Transform documents into interactive Knowledge Graphs.
---
<div align="center">
  <img src="frontend/public/graph-favicon.svg" alt="CogniGraph Logo" width="100" />
  <h1>CogniGraph</h1>
</div>


## ✨ Overview

**CogniGraph** is an AI-powered Knowledge Graph Explorer that transforms static documents into interactive, navigable visualizations. Upload any PDF or text file, and watch as it extracts key entities and relationships, allowing you to "see" the structure of your data and chat with it in real-time.

---

## 🚀 Features

- **📄 Universal Document Support**: Handles **PDFs** (native text), **Scanned PDFs** (via OCR/Tesseract), **TXT**, and **Markdown** files.
- **🕸️ Interactive 3D Knowledge Graph**: Fly through a glowing constellation of people, organizations, and concepts. Hubs are sized and colored by how connected they are.
- **💬 Context-Aware Chat**: Chat with your document using **RAG (Retrieval-Augmented Generation)**. The AI answers strictly from the document's content, and the concepts each answer uses **light up in green** on the graph.
- **🔎 Explore by Hand**: Search any concept (press `/`), click a node to see its relationships, or ask about it in one click.
- **🔁 Three-Provider AI Fallback**: Groq → Gemini → NVIDIA. If one provider is rate-limited or fails, the next one answers automatically, and the UI shows which provider handled each request.
- **🔍 Smart OCR Fallback**: Automatically detects scanned/image-based PDFs and applies OCR to extract text.
- **📱 Responsive Design**: Fully optimized for Desktop and Mobile usage.

---

## 🛠️ Tech Stack

### Frontend
- **React 19** (Vite)
- **Tailwind CSS** (Styling & Dark Mode)
- **React-Force-Graph 3D** + **Three.js** (3D Visualization)
- **Lucide React** (Icons)

### Backend
- **FastAPI** (Python)
- **NetworkX** (Graph Construction)
- **ChromaDB** (Vector Database for RAG)
- **Pytesseract** & **PDF2Image** (OCR Engine)
- **Groq**, **Google Gemini** and **NVIDIA** APIs (OpenAI-compatible, with automatic fallback)

---

## ⚙️ Prerequisites

Before running the project, ensure you have the following installed:

1.  **Node.js** & **npm** (for Frontend)
2.  **Python 3.10+** (for Backend)
3.  **System Tools** (Required for OCR):
    *   **macOS**: `brew install tesseract poppler`
    *   **Ubuntu**: `sudo apt-get install tesseract-ocr poppler-utils`
    *   **Windows**: Install [Tesseract](https://github.com/UB-Mannheim/tesseract/wiki) and [Poppler](https://github.com/oschwartz10612/poppler-windows).

---

## 🔧 Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/iammanoj807/cognigraph.git
    cd cognigraph
    ```

2.  **Setup Environment Variables**
    Create a `.env` file in the `backend/` directory:
    ```bash
    cd backend
    cp .env.example .env
    ```
    Open `.env` and add your API keys (any provider without a key is skipped):
    ```ini
    GROQ_API_KEY=your_groq_key
    GEMINI_API_KEY=your_gemini_key
    NVIDIA_API_KEY=your_nvidia_key
    ```
    > 🔑 *Free keys: [Groq Console](https://console.groq.com/keys) · [Google AI Studio](https://aistudio.google.com/app/apikey) · [NVIDIA Build](https://build.nvidia.com/).*

    > ☁️ *On Hugging Face Spaces, add the same three names under **Settings → Variables and secrets** as secrets. Never commit them.*

---

## ▶️ How to Run

We have included a convenient script to start both the Backend and Frontend simultaneously.

1.  **Make the script executable** (first time only):
    ```bash
    chmod +x run.sh
    ```

2.  **Start the App**:
    ```bash
    ./run.sh
    ```

This will automatically:
*   Create a Python virtual environment (`venv`).
*   Install Python requirements.
*   Start the **FastAPI Backend** on `http://localhost:8000`.
*   Start the **React Frontend** on `http://localhost:5173`.

---

## ☁️ Deploying to Hugging Face Spaces

The Space runs on the free **Gradio SDK** tier: `app.py` starts the same FastAPI backend and serves the prebuilt React UI from `backend/frontend_static/`. `packages.txt` installs Tesseract and Poppler for OCR.

After changing the frontend, rebuild the UI before pushing:
```bash
cd frontend
npm run build:space
```

---

## ⚠️ Troubleshooting

**1. "401 Unauthorized" Error**
*   One of your API keys is invalid or expired. The app falls back to the next provider automatically, and the chat shows "key rejected" next to the failing one.
*   Replace that key in `backend/.env` (or your Space secrets) and restart the backend.

**2. "Poppler/Tesseract not installed"**
*   The app cannot read scanned PDFs without these tools.
*   Run `brew install poppler tesseract` (Mac) to fix it.

**3. "Address already in use"**
*   Another program is using port 8000 or 5173.
*   Kill the process or restart your computer.

---

## ⚡ AI Engine

Every LLM request (graph extraction and chat) walks an ordered fallback chain:

| Order | Provider | Model | Used when |
|---|---|---|---|
| 1 | **Groq** | `openai/gpt-oss-120b` | Always tried first; answers most questions |
| 2 | **Google Gemini** | `gemini-3.5-flash-lite` | Only when Groq is rate-limited or errors |
| 3 | **NVIDIA** | `openai/gpt-oss-20b` | Only when both Groq and Gemini fail |

A provider that returns a rate limit (HTTP 429) is skipped until its `Retry-After` passes, so it doesn't slow down later requests. A response that comes back empty or can't be parsed into a graph also falls through to the next provider. The models can be overridden with `GROQ_MODEL`, `GEMINI_MODEL` and `NVIDIA_MODEL`.

> ℹ️ Groq's free tier caps prompts at ~8K tokens per minute, so documents longer than roughly 25K characters are usually graphed by Gemini, while chat stays on Groq.

The application uses **Retrieval-Augmented Generation (RAG)** to fetch only relevant document chunks to combine with graph relationships for grounded answers.

---

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a Pull Request.

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

Made with ❤️ by Manoj Kumar Thapa
