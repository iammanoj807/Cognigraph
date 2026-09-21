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

## 📊 Retrieval quality — measured

Search quality is measured, not assumed. `eval/` holds a fixed 6-document
corpus and 20 labelled questions, each tagged with the exact passage that
answers it. Runs offline in seconds — no API key, no network, no cost.

```bash
python eval/measure_retrieval.py
```

The six documents **overlap in vocabulary on purpose** — three on model
inference, three on vector search, each naming the others. A question about
ONNX cannot be answered by keyword-matching "ONNX", because two other documents
mention it. Without that overlap the test would measure nothing: any retriever
separates six unrelated documents.

### Results

Two question sets over the same passages. The first was written alongside the
corpus; the second asks the same things in a user's words, avoiding each
answer's distinctive vocabulary.

| Question style | chunk hit@1 | chunk hit@3 | doc hit@1 |
|---|---|---|---|
| Written alongside the corpus | 90.0% | 100% | 100% |
| **Paraphrased — user wording** | **55.0%** | **95.0%** | **70.0%** |

**Rewording the questions costs 35 points of chunk hit@1.** The first row
measures how the questions were written, not how well retrieval works. The
second is what a real user experiences.

`chunk hit@3 = 95%` is the number that describes the app, because `query()`
returns three passages and all three go to the model.

`doc hit@1 = 70%` against `chunk hit@1 = 55%` says much of the ranking failure
is the right document but the wrong chunk inside it — a milder failure than
retrieving something unrelated, and one that a smaller chunk size or a reranker
would address.

### Control: the same questions with no embeddings

| Ranker | original hit@1 | paraphrased hit@1 | paraphrased hit@3 |
|---|---|---|---|
| Random guess | 8.3% | 8.3% | — |
| Keyword (TF-IDF, no ML) | 80.0% | 50.0% | 80.0% |
| ChromaDB embeddings | 90.0% | 55.0% | 95.0% |

On user-worded questions the embedding model beats keyword matching by **1
question at hit@1 and 3 at hit@3**, out of 20. At this sample size the hit@1
difference is noise; only the hit@3 gap is worth anything.

That is a modest result, and it is the point of running the control: a bare
"95% hit@3" would have implied the embedding model was doing far more work
than it is. Any future retrieval change should be measured against this
baseline, not against a bare accuracy figure.

### Why the chunk size is 1000

| Chunk size | hit@1 | hit@3 | MRR |
|---|---|---|---|
| 300 | 45.0% | 85.0% | 0.625 |
| 500 | 75.0% | 100% | 0.850 |
| **1000** | **90.0%** | **100%** | **0.933** |
| 1500 | 90.0% | 100% | 0.950 |
| 2000 | 95.0% | 100% | 0.975 |

Read naively this says "use 2000". It does not, and the eval demonstrates why.

`all-MiniLM-L6-v2` has a fixed input window. Appending unrelated text to a
chunk and getting **cosine 1.000000** back proves the tail never reached the
model — and that happens from about **1400 characters** onward. At 1500 and
2000 the text is being silently discarded; no error is raised.

So why do they score better? Because this corpus is small. At 2000 chars there
are only 6 chunks for 6 documents, and the task collapses into "pick one of
six" — easier for a reason that would not survive a real corpus. **1000 is the
right setting: the largest that still fits inside the embedding window.**

### Honest limits

- **Quote the paraphrased row, not the original one.** 90% hit@1 measures the
  question wording. 55% chunk hit@1 / 95% chunk hit@3 is the honest figure.
- **One paraphrased question had to be rewritten after inspection.** "When the
  two are combined..." had no antecedent and was unanswerable standalone, so no
  retriever could have found it. Reading all 20 results individually is what
  caught it; the aggregate score did not.
- **The embedding model beats keyword matching by 1 question at hit@1.** It
  earns its place at hit@3, by 3 questions. That is a real result, not a
  strong one.
- **20 questions over 6 documents**, all written by the repo author. Every
  label is machine-checked to appear in exactly one document, but that catches
  ambiguity, not bias — the 35-point drop between the two question sets is what
  that bias looks like when measured.
- **The chunk sweep is corpus-size confounded**, as above. It shows where the
  setting breaks down, not an optimum to copy.
- **hit@3 is near its ceiling** at this corpus size: returning 3 of 12 chunks
  covers a quarter of the collection, so 95-100% is easier than it sounds.
  Expect it to fall on a larger collection.
- Measures retrieval only. Whether the LLM then uses the retrieved passage
  correctly is a separate question this does not test.

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a Pull Request.

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

Made with ❤️ by Manoj Kumar Thapa
