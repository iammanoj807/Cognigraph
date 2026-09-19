import os
import time
import shutil
import pypdf
import uvicorn
import pytesseract
from pdf2image import convert_from_bytes
from pdf2image.exceptions import PDFInfoNotInstalledError
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
from dotenv import load_dotenv

from graph_agent import GraphAgent, ROOT_NODE
from rag_engine import RAGEngine
from llm_client import query_llm, provider_status, LLMChainError

import io
import pypdf

load_dotenv()

# Setup FastAPI App
app = FastAPI(title="CogniGraph API", description="Backend for AI Knowledge Graph Explorer")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# Static File Serving (for Hugging Face / Production)
# ---------------------------------------------------------
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Check if the build directory exists (it will in Docker)
frontend_dist = "frontend_static"
if os.path.exists(frontend_dist):
    # Mount assets (JS/CSS)
    app.mount("/assets", StaticFiles(directory=f"{frontend_dist}/assets"), name="assets")
    
    # Catch-all route to serve index.html for client-side routing
    # Must be defined AFTER specific API routes, but before generic ones?
    # Actually, we can define it at the end to catch non-API routes.


# Session Management
class SessionData:
    def __init__(self):
        self.graph_agent = GraphAgent()
        self.rag_engine = RAGEngine()
        self.latest_uploaded_text = ""

sessions: Dict[str, SessionData] = {}

async def get_current_session(x_session_id: str = Header(...)):
    if x_session_id not in sessions:
        print(f"Creating new session for ID: {x_session_id}")
        sessions[x_session_id] = SessionData()
    return sessions[x_session_id]


class ChatRequest(BaseModel):
    message: str

class GraphResponse(BaseModel):
    nodes: List[dict]
    links: List[dict]

@app.get("/health")
def health_check():
    return {"status": "online", "message": "CogniGraph Backend is running"}

@app.get("/providers")
def get_providers():
    """
    The LLM fallback chain in order (Groq -> Gemini -> NVIDIA), with each
    provider's model, whether its key is set, and any active rate-limit cooldown.
    """
    return {"chain": provider_status()}

@app.get("/")
def read_root():
    # Explicitly serve the frontend index.html at root
    if os.path.exists("frontend_static/index.html"):
        return FileResponse("frontend_static/index.html")
    return {"status": "online", "message": "Backend running. Frontend not built."}

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    session: SessionData = Depends(get_current_session)
):
    """
    Ingest a document (PDF/Text), extract entities, and build graph.
    """
    # session.latest_uploaded_text replace global logic

    content = await file.read()
    filename = file.filename.lower()
    
    text = ""
    if filename.endswith(".pdf"):
        try:
            pdf_file = io.BytesIO(content)
            reader = pypdf.PdfReader(pdf_file)
            text = ""
            for page in reader.pages:
                try:
                    # Try layout mode for better table extraction
                    page_text = page.extract_text(extraction_mode="layout")
                except:
                    # Fallback to default
                    page_text = page.extract_text()
                text += page_text + "\n"
        except Exception as e:
            # Only raise if it's a fundamental file reading error
            print(f"Standard PDF extraction error: {e}")
            # Continue to check for empty text (which triggers OCR)

        # Check for Scanned PDF (Image-based) OR empty text
        if len(text.strip()) < 20: 
            print("PDF appears to be scanned. Attempting OCR...")
            try:
                # Convert PDF to list of images
                images = convert_from_bytes(content)
                
                ocr_text = ""
                for i, image in enumerate(images):
                    print(f"Performing OCR on page {i+1}...")
                    ocr_text += pytesseract.image_to_string(image) + "\n"
                
                text = ocr_text
                
                if not text.strip():
                     raise HTTPException(status_code=400, detail="OCR failed to extract text. The image might be too blurry.")

            except PDFInfoNotInstalledError:
                raise HTTPException(
                    status_code=500, 
                    detail="Server Error: 'poppler' is not installed. Please run: `brew install poppler`"
                )
            except pytesseract.TesseractNotFoundError:
                raise HTTPException(
                    status_code=500, 
                    detail="Server Error: 'tesseract' is not installed. Please run: `brew install tesseract`"
                )
            except Exception as e:
                print(f"OCR Error: {e}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"OCR processing failed: {str(e)}. Please ensure tesseract and poppler are installed."
                )

    else:
        # Assume text/markdown
        text = content.decode("utf-8", errors="ignore")
    
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract any valid text from the file.")

    # Store for regeneration
    session.latest_uploaded_text = text
    
    # Save to disk for persistence (namespaced by session to avoid collision)
    # Note: Disabled simple file write to avoid disk cluttering in multi-user env, 
    # or could use f"last_uploaded_doc_{id(session)}.txt"
    
    start_time = time.time()

    # 1. Clear old RAG data and add new document
    print("DEBUG: Resetting RAG Engine (clearing old data)...")
    session.rag_engine.reset()
    print("DEBUG: Starting RAG Indexing...")
    session.rag_engine.add_document(text, file.filename)
    rag_time = time.time()
    print(f"DEBUG: RAG Indexing took {rag_time - start_time:.2f}s")
    
    # 2. Extract Graph
    print("DEBUG: Starting Graph Extraction...")
    try:
        _, engine = session.graph_agent.extract_graph_from_text(text)
        print(f"DEBUG: Graph extracted by {engine['name']} ({engine['model']})")
    except LLMChainError as e:
        print(f"Error extracting graph: {e}")
        raise HTTPException(status_code=429 if e.rate_limited else 502, detail=str(e))
    except Exception as e:
        print(f"Error extracting graph: {e}")
        raise HTTPException(status_code=500, detail=f"Graph extraction failed: {e}")
    
    graph_time = time.time()
    print(f"DEBUG: Graph Extraction took {graph_time - rag_time:.2f}s")
    print(f"DEBUG: Total processing time: {graph_time - start_time:.2f}s")
    
    # Return actual graph data so frontend can render immediately,
    # plus which provider in the fallback chain built it.
    graph_data = session.graph_agent.get_graph_data()
    return {
        **graph_data,
        "engine": engine,
        "document": {"name": file.filename, "characters": len(text)},
    }



@app.post("/reset", response_model=GraphResponse)
def reset_session(session: SessionData = Depends(get_current_session)):
    """
    Reset the session: clear uploaded text, and return mock data.
    """
    session.latest_uploaded_text = ""
    
    # Reset persistence if any mechanism was used
            
    mock_triples = session.graph_agent.reset_graph()
    return session.graph_agent.get_graph_data()

@app.get("/graph", response_model=GraphResponse)
def get_graph(session: SessionData = Depends(get_current_session)):
    """
    Return the current knowledge graph structure (Nodes & Links).
    """
    return session.graph_agent.get_graph_data()

@app.post("/chat")
async def chat(request: ChatRequest, session: SessionData = Depends(get_current_session)):
    """
    Chat with the RAG engine.
    """
    # 1. Retrieve context from Vector DB
    context_docs = session.rag_engine.query(request.message)
    
    # NEW: Get Graph Context
    graph_context = session.graph_agent.get_triples_as_text()
    
    context_str = f"{graph_context}\n\nDocument Excerpts:\n" + "\n".join(context_docs)
    
    # 2. Generate response using LLM
    response_text = ""
    highlighted_nodes = []
    
    # Use generic messages format
    messages = [
        {"role": "system", "content": "You are a helpful assistant for a Knowledge Graph application. Use BOTH the 'Graph Relationships' and 'Document Excerpts' to answer. If the answer is NOT in the provided context, simply say 'This information is not available in the uploaded document.' Keep answers concise: short paragraphs or bullet lists, and avoid tables."},
        {
            "role": "user", 
            "content": f"Context:\n{context_str}\n\nUser Question: {request.message}\n\nAnswer ONLY using the information above. If the answer is not found, say so clearly."
        }
    ]

    engine = None
    failed = False
    try:
        response_text, engine = query_llm(
            messages=messages,
            temperature=0.1,
            max_tokens=1500,
            timeout=60,
        )

    except LLMChainError as e:
        print(f"Error generating chat response: {e}")
        failed = True
        engine = {"provider": None, "name": None, "model": None, "attempts": e.attempts}
        if e.rate_limited:
            response_text = f"Every AI provider is rate-limited right now. Please wait {e.retry_after}s and try again."
        elif any(a["status"] == "too_large" for a in e.attempts):
            response_text = "The question or context is too long. Please try shortening your query."
        else:
            response_text = "I encountered a technical issue while processing your request. Please try again."
    except Exception as e:
        print(f"Error generating chat response: {e}")
        failed = True
        response_text = "I encountered a technical issue while processing your request. Please try again."

    # Identify highlighted nodes
    if session.graph_agent.graph and not failed:
        # The synthetic root would match nearly every answer ("the document says...").
        all_nodes = [n for n in session.graph_agent.graph.nodes() if n != ROOT_NODE]
        
        def normalize_text(text):
            text = text.lower().replace("**", "").replace("*", "")
            return "".join(c for c in text if c.isalnum() or c.isspace())

        normalized_response = normalize_text(response_text)
        
        for node_id in all_nodes:
            # Simple, robust matching
            clean_node = node_id.lower().strip()
            clean_response = response_text.lower()
            
            # 1. Exact substring match (if node > 3 chars)
            if len(clean_node) > 3 and clean_node in clean_response:
                highlighted_nodes.append(node_id)
                continue
                
            # 2. Token overlap (fuzzy)
            node_tokens = set(normalize_text(node_id).split())
            if not node_tokens:
                continue
                
            # Check if *all* tokens of the node are present (e.g. "Space X" in "Space X is...")
            # Or if it's a single word node, check if it's in response
            match_count = 0
            for token in node_tokens:
                if len(token) > 2 and token in normalized_response:
                    match_count += 1
            
            # If significant overlap (e.g. > 50% of node words found)
            if len(node_tokens) > 0 and (match_count / len(node_tokens)) >= 0.5:
                highlighted_nodes.append(node_id)
    
    return {
        "response": response_text,
        "sources": context_docs,
        "highlighted_nodes": highlighted_nodes,
        "engine": engine,
        "error": failed,
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

# SPA Fallback (Must be at the bottom)
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # Try to serve a specific static file if it exists in the build folder
    # This comes AFTER specific API routes and /assets mount, so it catches root files like /manoj.png
    file_path = f"frontend_static/{full_path}"
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)

    # Otherwise, fallback to index.html for React Router (SPA)
    if os.path.exists("frontend_static/index.html"):
        return FileResponse("frontend_static/index.html")
    
    # If running locally without build, just return 404 or message
    return {"message": "Backend running. Frontend not built (use npm run dev for local development)."}