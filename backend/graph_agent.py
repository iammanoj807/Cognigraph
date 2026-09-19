import networkx as nx
import json
import re
from llm_client import query_llm

ROOT_NODE = "Document"

# Cap on relationships sent as chat context, keeping prompts inside Groq's free-tier token budget.
MAX_CONTEXT_EDGES = 120


def parse_triples(raw_content):
    """
    Recovers triples from model output, even when the JSON is malformed.
    Returns a list of {"source", "target", "relation"} dicts (possibly empty).
    """
    # Clean up markdown code blocks if present
    cleaned_content = raw_content.replace('```json', '').replace('```', '').strip()

    def valid(items):
        return [t for t in items if isinstance(t, dict) and t.get('source') and t.get('target')]

    # Tier 1: Direct JSON parse
    try:
        data = json.loads(cleaned_content)
        if isinstance(data, dict):
            triples = valid(data.get("triples", []))
            if triples:
                return triples
    except Exception as e:
        print(f"Tier 1 JSON parse failed: {e}")

    # Tier 2: Syntax repair (fix missing commas between objects, trailing commas, unclosed brackets)
    try:
        repaired = re.sub(r'\}\s*\{', '},\n{', cleaned_content)
        repaired = re.sub(r',\s*([\]\}])', r'\1', repaired)
        if '[' in repaired and ']' not in repaired:
            last_brace = repaired.rfind('}')
            if last_brace != -1:
                repaired = repaired[:last_brace+1] + '\n]}'
        elif '{' in repaired and '}' not in repaired:
            repaired = repaired + '\n}'

        data = json.loads(repaired)
        if isinstance(data, dict):
            triples = valid(data.get("triples", []))
            if triples:
                print(f"Tier 2 JSON repair succeeded: recovered {len(triples)} triples.")
                return triples
    except Exception as e:
        print(f"Tier 2 JSON repair failed: {e}")

    # Tier 3: Resilient regex extraction (extracts individual triples even if outer JSON is broken)
    print("Tier 3: Attempting resilient regex extraction...")
    triples = []
    for block in re.finditer(r'\{([^{}]+)\}', cleaned_content, re.DOTALL):
        block_text = block.group(1)
        src_m = re.search(r'\"source\"\s*:\s*\"(.*?)\"(?:\s*,|\s*\}|\s*$)', block_text, re.DOTALL)
        tgt_m = re.search(r'\"target\"\s*:\s*\"(.*?)\"(?:\s*,|\s*\}|\s*$)', block_text, re.DOTALL)
        rel_m = re.search(r'\"relation\"\s*:\s*\"(.*?)\"(?:\s*,|\s*\}|\s*$)', block_text, re.DOTALL)
        if src_m and tgt_m and rel_m:
            src = src_m.group(1).strip()
            tgt = tgt_m.group(1).strip()
            rel = rel_m.group(1).strip()
            if src and tgt:
                triples.append({'source': src, 'target': tgt, 'relation': rel})

    if triples:
        print(f"Tier 3 regex extraction succeeded: recovered {len(triples)} triples.")
    else:
        print("WARNING: Extracted triples list is empty.")
    return triples


class GraphAgent:
    def __init__(self):
        self.graph = nx.DiGraph()
    
    def extract_graph_from_text(self, text: str):
        """
        Extract entities/relations using the configured LLM and build the graph.
        Returns: Tuple(triples, engine) where engine names the provider that answered.
        """
        self.graph.clear()
        
        input_text = text[:60000]
        print(f"Extracting graph from {len(input_text)} chars...")
        
        # Dynamic Limit Logic
        # Base 20 relationships (for small files), plus 1 for every 500 characters
        # Cap at 80 to prevent graph explosions
        char_count = len(input_text)
        dynamic_limit = 20 + (char_count // 500)
        dynamic_limit = min(dynamic_limit, 80) # Increased cap for larger context
        
        prompt_text = f"""
        Extract a COMPREHENSIVE knowledge graph from the text below.
        Return a JSON object with a list of triples.
        
        CRITICAL INSTRUCTION: Analyze the document content to Determine its Domain (e.g., Legal, Scientific, Narrative, Technical, etc.).
        
        Dynamically create a hierarchical structure that best fits the content.
        Do NOT force a specific schema. Instead, invent categories that make sense for this specific text.
        
        General Logic for ANY Document (Chain of Thought):
        1. **SCAN**: identifying all Key Entities first (People, Organizations, Dates, Locations, Events, Concepts).
        2. **CATEGORIZE**: Group these entities into logical high-level themes (e.g., "Experience", "Methodology", "Findings").
        3. **LINK**: Create hierarchical connections from Document -> Category -> Entity -> Details.
        
        CRITICAL: ensuring "Who", "What", "When", and "Where" are covered.
        
        Example (Abstract):
        - "Document" -> "Category A (e.g. Findings)" -> "Item 1"
        - "Item 1" -> "Detail X" -> "Value"
        - "Document" -> "Category B (e.g. Methodology)" -> "Process Z"
        
        Format: {{ "triples": [ {{"source": "Parent Node", "target": "Child Node", "relation": "relationship"}} ] }}
        Target: Extract at least {dynamic_limit} relationships. If the content is sparse and you cannot reach this target, extract as many meaningful relationships as possible without hallucinating.

        CRITICAL JSON RULES:
        - Return ONLY a valid JSON object starting with {{ and ending with }}.
        - Escape any internal double quotes within values using backslash (\").
        - Separate every object in the "triples" array with a comma.
        - Do not include trailing commas or comments.
        
        Text:
        {input_text} 
        """

        messages = [
            {"role": "system", "content": "You are a JSON-speaking API. Output strictly valid JSON."},
            {"role": "user", "content": prompt_text}
        ]

        # Parsed during validation so a provider whose output has no usable
        # triples counts as a failure and the chain moves on to the next one.
        parsed = {}

        def has_triples(content):
            parsed["triples"] = parse_triples(content)
            return bool(parsed["triples"])

        try:
            raw_content, engine = query_llm(
                messages=messages,
                json_mode=True,
                max_tokens=6000,
                timeout=120,
                validate=has_triples,
            )
            triples = parsed["triples"]

            # Build graph
            temp_graph = nx.Graph()
            root_node = ROOT_NODE
            temp_graph.add_node(root_node, group=0)

            for item in triples:
                src = str(item['source']).strip()
                tgt = str(item['target']).strip()
                rel = str(item.get('relation') or 'related to').strip()
                if not src or not tgt or src == tgt:
                    continue
                for node in (src, tgt):
                    if node != root_node:
                        temp_graph.add_node(node, group=1)
                temp_graph.add_edge(src, tgt, label=rel)
                if src != root_node:
                    temp_graph.add_edge(root_node, src, label="contains")
            
            self.graph = temp_graph
            return triples, engine
            
        except Exception as e:
            print(f"Error calling LLM: {e}")
            raise 

    def reset_graph(self):
        self.graph.clear()
        return []

    def get_graph_data(self):
        nodes = [{"id": n, "group": self.graph.nodes[n].get("group", 1)} for n in self.graph.nodes()]
        links = [{"source": u, "target": v, "label": d.get("label", "")} for u, v, d in self.graph.edges(data=True)]
        return {"nodes": nodes, "links": links}

    def get_triples_as_text(self):
        """
        Returns a string representation of the graph for LLM context.
        """
        if self.graph.number_of_edges() == 0:
            return ""
            
        lines = []
        for u, v, data in self.graph.edges(data=True):
            label = data.get("label", "related to")
            # The synthetic root "contains" edges carry no information from the document.
            if ROOT_NODE in (u, v) and label == "contains":
                continue
            lines.append(f"- {u} [{label}] {v}")
            if len(lines) >= MAX_CONTEXT_EDGES:
                break

        return "Extracted Knowledge Graph Relationships:\n" + "\n".join(lines) + "\n"