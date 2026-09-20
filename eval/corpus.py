"""Fixed corpus and labelled questions for measuring retrieval.

Committed to the repo so anyone can re-run and get the same numbers -- no
network, no external dataset, no API key.

The six documents deliberately OVERLAP in vocabulary. Three cover model
inference (ONNX Runtime, TensorRT, quantisation) and three cover vector search
(ChromaDB, FAISS, embedding models), and each names the others. A question
about ONNX cannot be answered by keyword-matching "ONNX", because TensorRT and
quantisation documents mention it too. Without that overlap the test would
measure nothing: any retriever separates six unrelated documents.

Ground truth is a distinctive SNIPPET rather than a document id, so the labels
survive a change of chunk size -- which the chunk sweep depends on. Snippets are
matched after collapsing whitespace, because the corpus is wrapped for reading
and a snippet can otherwise straddle a newline.

Every snippet is verified before scoring to appear in exactly one document. A
snippet present in two would make a retrieval "correct" for the wrong passage,
which is the same defect as a benchmark answer that can be reached by echoing
the question.
"""

DOCUMENTS = {
"onnx_runtime": """
ONNX Runtime is a cross-platform inference engine maintained by Microsoft. It
executes models stored in the Open Neural Network Exchange format, which acts
as a common interchange representation between training frameworks such as
PyTorch and TensorFlow and the runtimes that serve them.

The runtime applies graph-level optimisations before execution. Constant
folding evaluates subgraphs whose inputs are all fixed at build time, node
fusion merges patterns such as convolution followed by batch normalisation into
a single kernel, and redundant transpose elimination removes layout changes
that cancel each other out. On a typical vision model these graph passes alone
recover between fifteen and thirty percent of latency before any numeric
precision change is considered.

Execution providers let one graph target different hardware. The CPU provider
is always available; CUDA, TensorRT, DirectML, CoreML and OpenVINO providers
are selected at session creation and fall back to CPU for any operator they do
not implement. This fallback is silent, so a model that appears to be running
on the GPU may in practice be splitting work across devices, and profiling is
the only reliable way to confirm which provider served each node.

ONNX Runtime Web brings the same engine to the browser through WebAssembly and
WebGPU backends, which allows a model to run entirely on a user's device with
no server round trip and no data leaving the machine.
""",

"tensorrt": """
TensorRT is NVIDIA's inference compiler and runtime for its own GPUs. Unlike a
general interchange runtime it compiles a model into a hardware-specific engine
file, tuned for one GPU architecture, one precision mode and one range of input
shapes. An engine built for an A100 will not load on a consumer RTX card, which
makes engine files a build artefact rather than something to distribute.

The compiler performs layer and tensor fusion, selects the fastest kernel for
each layer by timing candidates on the actual device, and can reduce precision
to FP16 or INT8. Kernel auto-tuning is what separates it from graph-only
optimisers: rather than applying fixed rewrite rules, it benchmarks several
implementations of each layer and keeps the winner, which is why the build step
can take many minutes for a large network.

TensorRT is available as an execution provider inside ONNX Runtime, so a model
exported to ONNX can be served through TensorRT without leaving the ONNX
tooling. In that configuration ONNX Runtime partitions the graph, sends the
subgraphs TensorRT supports to the compiled engine, and runs the remainder on
CUDA or CPU.
""",

"quantisation": """
Quantisation reduces the numeric precision of a model's weights and sometimes
its activations, most often from 32-bit floating point to 8-bit integers. The
appeal is size and bandwidth: an INT8 model is roughly a quarter the size of
its FP32 original, and memory bandwidth is the binding constraint on most
inference hardware.

Post-training dynamic quantisation stores weights as integers and computes
activation scales on the fly at run time. It needs no calibration data and is
the cheapest option to apply, which is why it is usually tried first. Static
quantisation instead fixes activation scales in advance using a small
calibration set of representative inputs, giving faster inference than dynamic
quantisation at the cost of needing that data. Quantisation-aware training
simulates the rounding error during fine-tuning and recovers the most accuracy,
but requires a full training run.

The damage quantisation does is task-dependent, and this is the trap. A model
that loses two percent on a broad public benchmark can lose ten percent on one
narrow domain, because the quantisation error happens to fall on exactly the
distinctions that domain relies on. Measuring on your own task data after
quantising is not optional.

Not every operator survives quantisation cleanly. Quantising a convolution
emits a ConvInteger node, which several runtimes have no kernel for, so the
model exports successfully and then fails when the session runs.
""",

"chromadb": """
ChromaDB is an embedded vector database aimed at application developers rather
than infrastructure teams. It runs in the same process as the application by
default, storing vectors either in memory or in a local directory, which
removes the operational cost of a separate service during development.

A collection groups documents, their embeddings, their metadata and their
identifiers. When documents are added without precomputed vectors, Chroma
embeds them using its default model, all-MiniLM-L6-v2, a 384-dimensional
sentence transformer chosen for speed rather than peak retrieval quality. Any
other embedding function can be supplied instead at collection creation.

Queries return the nearest neighbours by cosine distance and accept metadata
filters that narrow the search before vectors are compared. Because Chroma
holds documents alongside vectors, a query returns the original text directly
and no second lookup against a separate store is needed, which is the main
practical difference from a pure index library.

The in-process design has a clear ceiling. Chroma is well suited to collections
in the tens or hundreds of thousands of documents; beyond that a dedicated
server-based vector store becomes the better fit.
""",

"faiss": """
FAISS, from Meta, is a library for similarity search over dense vectors. It is
an index rather than a database: it stores vectors and returns identifiers, and
keeping the original documents and any metadata is left entirely to the caller.

Its value is the breadth of index structures. A flat index compares a query
against every stored vector and is exact but linear in collection size. IVF
partitions vectors into clusters and searches only the nearest few, trading a
small amount of recall for a large speed gain. HNSW builds a navigable
small-world graph and typically gives the best latency-recall balance at
moderate scale. Product quantisation compresses vectors into compact codes so
that collections far larger than available memory can be searched, at some cost
to precision.

Because FAISS returns only identifiers, applications pair it with a separate
document store. That separation is the main difference from an embedded vector
database such as Chroma, which keeps documents and vectors together and
therefore needs no second lookup.
""",

"embedding_models": """
An embedding model maps text to a fixed-length vector so that semantically
similar passages land close together. Retrieval quality depends far more on
this choice than on the index structure underneath it: a better embedding model
with a flat index will usually beat a weak model with a finely tuned HNSW
graph.

Dimensionality is the first trade-off. all-MiniLM-L6-v2 produces 384
dimensions and is fast enough to embed thousands of passages per second on a
CPU, which is why Chroma ships it as the default. Larger models produce 768 or
1024 dimensions, retrieve better on nuanced queries, and cost proportionally
more in both compute and storage.

The second trade-off is the input window. Most sentence transformers truncate
at 256 or 512 tokens, silently discarding anything beyond that. A chunking
strategy that produces passages longer than the window therefore loses text
without any error being raised, which makes chunk size and model window a
single joint decision rather than two independent ones.

Symmetric and asymmetric retrieval differ. Models trained for symmetric search
expect query and document to look alike, as when matching one sentence to
another. Asymmetric models expect a short query against a long passage, which
is the usual retrieval-augmented generation case, and using a symmetric model
there measurably costs recall.
""",
}

# (question, answer snippet that MUST appear in a correct chunk, why it is hard)
QUESTIONS = [
 ("Which optimisation does ONNX Runtime apply to remove layout changes that cancel out?",
  "redundant transpose elimination", "three docs discuss graph optimisation"),
 ("What happens when an execution provider does not implement an operator?",
  "fallback is silent", "'execution provider' appears in the TensorRT doc too"),
 ("How does ONNX Runtime run a model inside a browser?",
  "WebAssembly and WebGPU", "only one doc covers browser execution"),
 ("Why can a TensorRT engine file not be shared between different GPUs?",
  "built for an A100 will not load", "engine/compile language overlaps with ONNX"),
 ("What technique does TensorRT use that a graph-only optimiser does not?",
  "Kernel auto-tuning", "both inference docs list optimisations"),
 ("How does TensorRT fit together with ONNX Runtime?",
  "partitions the graph", "the ONNX doc also names TensorRT"),
 ("Which quantisation method needs no calibration data?",
  "needs no calibration data", "three quantisation methods described together"),
 ("Which quantisation method recovers the most accuracy?",
  "simulates the rounding error", "must distinguish three similar methods"),
 ("How much smaller is an INT8 model than FP32?",
  "quarter the size", "size claims appear in several docs"),
 ("Why can benchmark accuracy loss understate quantisation damage?",
  "lose ten percent on one narrow domain", "requires the reasoning, not a keyword"),
 ("Which node type fails at run time after quantising a convolution?",
  "ConvInteger", "a single distinctive term"),
 ("What is ChromaDB's default embedding model?",
  "embeds them using its default model", "the model name alone appears in two docs"),
 ("Why does a Chroma query need no second lookup?",
  "holds documents alongside vectors", "FAISS doc discusses the same contrast"),
 ("At what scale should you move off ChromaDB?",
  "tens or hundreds of thousands", "scale language appears in the FAISS doc"),
 ("Which FAISS index is exact but scales linearly?",
  "flat index compares a query against every", "four index types described together"),
 ("Which FAISS index gives the best latency-recall balance at moderate scale?",
  "HNSW builds a navigable", "must distinguish four index types"),
 ("How can FAISS search collections larger than memory?",
  "Product quantisation compresses", "'quantisation' is a whole other document"),
 ("What matters more for retrieval quality, the embedding model or the index?",
  "depends far more on this choice", "spans the embedding and FAISS docs"),
 ("What happens if a chunk is longer than the embedding model's input window?",
  "silently discarding anything beyond", "chunking is discussed in several docs"),
 ("Why does using a symmetric model for RAG cost recall?",
  "expect a short query against a long passage", "subtle distinction in one doc"),
]
