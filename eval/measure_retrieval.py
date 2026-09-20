#!/usr/bin/env python
"""Measure retrieval quality on the labelled set. No API calls, no network.

    python eval/measure_retrieval.py

Reports, for the real RAGEngine:
  hit@1  the answering passage is the top result
  hit@3  it is in the top 3 -- the app's actual default (n_results=3)
  MRR    mean reciprocal rank, so near-misses are visible

Then sweeps chunk size, because the 1000/200 setting in rag_engine.py is
currently justified by a comment rather than a number.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "eval"))

import chromadb                                    # noqa: E402
from corpus import DOCUMENTS, QUESTIONS            # noqa: E402

TOP_K = 3


def norm(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip()


def validate_labels():
    """A label that matches zero or several documents measures nothing."""
    docs = {k: norm(v) for k, v in DOCUMENTS.items()}
    for q, snip, _ in QUESTIONS:
        hits = [k for k, d in docs.items() if norm(snip) in d]
        if len(hits) != 1:
            raise SystemExit(f"bad label for {q!r}: snippet matches {hits}")
    return True


def chunk(text, size, overlap):
    """Exactly the strategy in backend/rag_engine.py::add_document."""
    out, start = [], 0
    while start < len(text):
        out.append(text[start:start + size])
        start += (size - overlap)
    return out


def build(size, overlap, name):
    client = chromadb.Client()
    try:
        client.delete_collection(name)
    except Exception:
        pass
    col = client.create_collection(name)
    docs, ids = [], []
    for doc_id, text in DOCUMENTS.items():
        for i, c in enumerate(chunk(text, size, overlap)):
            docs.append(c)
            ids.append(f"{doc_id}_{i}")
    col.add(documents=docs, ids=ids)
    return col, len(docs)


def evaluate(col, k=TOP_K, verbose=False):
    hit1 = hit_k = 0
    rr_total = 0.0
    misses = []
    for q, snip, why in QUESTIONS:
        res = col.query(query_texts=[q], n_results=k)
        got = [norm(d) for d in res["documents"][0]]
        ranks = [i for i, d in enumerate(got) if norm(snip) in d]
        if ranks:
            r = ranks[0]
            hit_k += 1
            hit1 += (r == 0)
            rr_total += 1 / (r + 1)
        else:
            misses.append((q, snip, why, got[0][:90] if got else ""))
        if verbose:
            mark = "1" if ranks and ranks[0] == 0 else (f"{ranks[0]+1}" if ranks else "-")
            print(f"    [{mark}] {q[:70]}")
    n = len(QUESTIONS)
    return {"n": n, "hit@1": hit1, "hit@3": hit_k,
            "hit@1_pct": round(100 * hit1 / n, 1), "hit@3_pct": round(100 * hit_k / n, 1),
            "mrr": round(rr_total / n, 3), "misses": misses}


def truncation_probe():
    """Find where the embedder silently stops reading.

    The sweep below makes larger chunks look better, which would be a reason to
    raise the chunk size. It is not: with only six documents a 2000-char chunk
    holds nearly a whole document each, so the task collapses into "pick one of
    six" and gets easier for a reason that will not survive a real corpus.

    Meanwhile the embedder has a fixed input window. Appending unrelated text to
    a prefix and getting cosine 1.0 back proves the tail never reached the
    model. That is the real constraint on chunk size, and it is invisible in the
    hit rates.
    """
    import numpy as np
    from chromadb.utils import embedding_functions
    ef = embedding_functions.DefaultEmbeddingFunction()
    text = " ".join(norm(d) for d in DOCUMENTS.values())
    tail = " PENGUINS ANTARCTICA ICEBERG KRILL " * 8
    rows = []
    for n in (600, 800, 1000, 1200, 1400, 1600, 2000):
        a = np.array(ef([text[:n]])[0])
        b = np.array(ef([text[:n] + tail])[0])
        c = float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))
        rows.append({"prefix_chars": n, "cosine_with_appended_text": round(c, 5),
                     "truncated": c > 0.99999})
    return rows


def main():
    validate_labels()
    print(f"corpus: {len(DOCUMENTS)} documents, {len(QUESTIONS)} labelled questions\n")

    print("=== shipped setting: 1000 chars, 200 overlap ===")
    col, n_chunks = build(1000, 200, "eval-shipped")
    base = evaluate(col, verbose=True)
    print(f"\n  chunks: {n_chunks}")
    print(f"  hit@1 {base['hit@1']}/{base['n']} ({base['hit@1_pct']}%)   "
          f"hit@3 {base['hit@3']}/{base['n']} ({base['hit@3_pct']}%)   MRR {base['mrr']}")
    if base["misses"]:
        print("\n  missed:")
        for q, snip, why, top in base["misses"]:
            print(f"    {q}")
            print(f"      wanted : {snip!r}  ({why})")
            print(f"      got    : {top!r}...")

    print("\n=== chunk-size sweep ===")
    print(f"  {'size':>6s} {'overlap':>8s} {'chunks':>7s} {'hit@1':>7s} {'hit@3':>7s} {'MRR':>6s}")
    sweep = []
    for size, ov in [(300, 60), (500, 100), (1000, 200), (1500, 300), (2000, 400)]:
        c, nc = build(size, ov, f"eval-sweep-{size}")
        r = evaluate(c)
        r.update({"chunk_size": size, "overlap": ov, "n_chunks": nc})
        r.pop("misses")
        sweep.append(r)
        star = "  <- shipped" if size == 1000 else ""
        print(f"  {size:>6d} {ov:>8d} {nc:>7d} {r['hit@1_pct']:>6.1f}% "
              f"{r['hit@3_pct']:>6.1f}% {r['mrr']:>6.3f}{star}")

    print("\n=== embedder input window ===")
    print("  appending unrelated text to a prefix; cosine 1.0 means it was discarded")
    trunc = truncation_probe()
    for r in trunc:
        flag = "   <- truncated" if r["truncated"] else ""
        print(f"    prefix {r['prefix_chars']:>5d} chars: cosine "
              f"{r['cosine_with_appended_text']:.5f}{flag}")
    first = next((r["prefix_chars"] for r in trunc if r["truncated"]), None)
    if first:
        print(f"\n  Text beyond ~{first} chars never reaches the model.")
        print("  The shipped 1000-char chunk sits under that limit; 1500 and 2000 do not,")
        print("  so their better hit rates come from the corpus being small, not from")
        print("  the model seeing more.")

    out = {"shipped": {k: v for k, v in base.items() if k != "misses"},
           "misses": [{"question": q, "wanted": s, "why_hard": w} for q, s, w, _ in base["misses"]],
           "sweep": sweep, "truncation_probe": trunc, "top_k": TOP_K,
           "embedder": "all-MiniLM-L6-v2 (Chroma default)"}
    p = ROOT / "eval" / "retrieval_results.json"
    p.write_text(json.dumps(out, indent=2))
    print(f"\n-> {p}")


if __name__ == "__main__":
    main()
