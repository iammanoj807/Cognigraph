"""
Centralized LLM Client with an ordered provider fallback chain.

  1. Groq   (openai/gpt-oss-120b)   - always tried first
  2. Gemini (gemini-3.5-flash-lite) - only when Groq is rate-limited or errors
  3. NVIDIA (openai/gpt-oss-20b)    - only when both Groq and Gemini fail

All three expose an OpenAI-compatible chat completions endpoint, so a single
request shape covers them. Every call reports which provider answered and why
earlier providers were skipped, so the UI can show where each answer came from.
"""
import os
import re
import time
import requests
from dotenv import load_dotenv

load_dotenv()

PROVIDERS = [
    {
        "id": "groq",
        "name": "Groq",
        "endpoint": "https://api.groq.com/openai/v1/chat/completions",
        "key_envs": ["GROQ_API_KEY"],
        "model_env": "GROQ_MODEL",
        "default_model": "openai/gpt-oss-120b",
    },
    {
        "id": "gemini",
        "name": "Gemini",
        "endpoint": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        "key_envs": ["GEMINI_API_KEY", "MODEL_API_KEY"],
        "model_env": "GEMINI_MODEL",
        "default_model": "gemini-3.5-flash-lite",
    },
    {
        "id": "nvidia",
        "name": "NVIDIA",
        "endpoint": "https://integrate.api.nvidia.com/v1/chat/completions",
        "key_envs": ["NVIDIA_API_KEY"],
        "model_env": "NVIDIA_MODEL",
        "default_model": "openai/gpt-oss-20b",
    },
]

# A provider that answers 429 is skipped until its Retry-After passes, so a
# rate-limited Groq doesn't add a wasted round trip to every request.
_cooldown_until = {}

# Latest x-ratelimit-* headers per provider (only Groq sends them today).
_rate_limits = {}

DEFAULT_COOLDOWN_SECONDS = 30
MAX_COOLDOWN_SECONDS = 24 * 3600


class LLMChainError(Exception):
    """Raised when every provider in the chain failed or was skipped."""

    def __init__(self, attempts):
        self.attempts = attempts
        tried = [a for a in attempts if a["status"] != "unconfigured"]
        waits = [a["retry_after"] for a in tried if a.get("retry_after")]

        self.rate_limited = bool(waits)
        self.retry_after = int(min(waits)) if waits else None

        if not tried:
            message = "No AI provider is configured. Set GROQ_API_KEY, GEMINI_API_KEY or NVIDIA_API_KEY."
        elif self.rate_limited:
            message = (
                f"API Rate Limit Hit on every provider. Please wait {format_duration(self.retry_after)} "
                f"(wait {self.retry_after}s) before trying again."
            )
        else:
            message = "All AI providers failed. " + "; ".join(f"{a['name']}: {a['detail']}" for a in tried)
        super().__init__(message)


def format_duration(seconds):
    try:
        s = int(float(seconds))
    except (TypeError, ValueError):
        return f"{seconds}s"
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m {s % 60}s"
    return f"{s // 3600}h {(s % 3600) // 60}m"


def _api_key(provider):
    for env in provider["key_envs"]:
        # Hosting dashboards (e.g. HF Spaces secrets) sometimes keep stray quotes or whitespace.
        value = (os.getenv(env) or "").strip().strip('"').strip("'").strip()
        if value:
            return value
    return None


def _model(provider):
    return (os.getenv(provider["model_env"]) or "").strip() or provider["default_model"]


def _supports_reasoning_effort(model):
    return "gpt-oss" in model or model.startswith("gemini")


def _cooldown_remaining(provider_id):
    return max(0, int(_cooldown_until.get(provider_id, 0) - time.time()))


def _retry_after_seconds(response):
    header = response.headers.get("retry-after")
    if header:
        try:
            return min(MAX_COOLDOWN_SECONDS, max(1, int(float(header))))
        except ValueError:
            pass
    # Gemini puts the delay in the body instead, e.g. "retryDelay": "32s"
    match = re.search(r'retry(?:Delay|\s+in)["\s:]*"?(\d+(?:\.\d+)?)s', response.text or "", re.IGNORECASE)
    if match:
        return min(MAX_COOLDOWN_SECONDS, max(1, int(float(match.group(1)))))
    return DEFAULT_COOLDOWN_SECONDS


def _parse_rate_limit_headers(headers):
    fields = {
        "limit_requests": "x-ratelimit-limit-requests",
        "remaining_requests": "x-ratelimit-remaining-requests",
        "reset_requests": "x-ratelimit-reset-requests",
        "limit_tokens": "x-ratelimit-limit-tokens",
        "remaining_tokens": "x-ratelimit-remaining-tokens",
        "reset_tokens": "x-ratelimit-reset-tokens",
    }
    return {name: headers[h].strip() for name, h in fields.items() if headers.get(h)}


def _describe_http_failure(response):
    """Maps a non-200 response to (status, short user-facing detail, retry_after)."""
    code = response.status_code
    if code == 429:
        wait = _retry_after_seconds(response)
        return "rate_limited", f"rate-limited, retry in {format_duration(wait)}", wait
    if code == 413:
        return "too_large", "request exceeds this tier's token limit", None
    # Gemini reports a bad key as 400 rather than 401
    if code in (401, 403) or (code == 400 and "api key" in (response.text or "").lower()):
        return "auth_error", "API key was rejected", None
    if code >= 500:
        return "error", f"server error (HTTP {code})", None
    return "error", f"request failed (HTTP {code})", None


def provider_status():
    """Current view of the chain for the UI: order, models, keys present, cooldowns."""
    return [
        {
            "provider": p["id"],
            "name": p["name"],
            "model": _model(p),
            "configured": _api_key(p) is not None,
            "cooldown_seconds": _cooldown_remaining(p["id"]),
        }
        for p in PROVIDERS
    ]


def query_llm(messages, max_tokens=1500, temperature=0.1, json_mode=False, timeout=90, validate=None):
    """
    Sends the request down the provider chain until one returns a usable answer.

    `validate(content) -> bool` lets callers reject a 200 response whose content
    is unusable (e.g. no parseable graph), which also falls through to the next provider.

    Returns: (content_string, engine_dict) describing which provider answered.
    Raises: LLMChainError when every provider failed or was skipped.
    """
    attempts = []

    for provider in PROVIDERS:
        model = _model(provider)
        attempt = {"provider": provider["id"], "name": provider["name"], "model": model}

        key = _api_key(provider)
        if not key:
            attempts.append({**attempt, "status": "unconfigured", "detail": "no API key set"})
            continue

        wait = _cooldown_remaining(provider["id"])
        if wait > 0:
            attempts.append({
                **attempt,
                "status": "cooldown",
                "detail": f"rate-limited, retry in {format_duration(wait)}",
                "retry_after": wait,
            })
            continue

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        if _supports_reasoning_effort(model):
            payload["reasoning_effort"] = "low"

        started = time.time()
        try:
            response = requests.post(
                provider["endpoint"],
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
                json=payload,
                timeout=timeout,
            )
        except requests.exceptions.Timeout:
            print(f"[LLM] {provider['name']} timed out after {timeout}s, falling back.")
            attempts.append({**attempt, "status": "error", "detail": f"timed out after {timeout}s"})
            continue
        except requests.exceptions.RequestException as e:
            print(f"[LLM] {provider['name']} connection failed: {e}, falling back.")
            attempts.append({**attempt, "status": "error", "detail": "connection failed"})
            continue

        latency_ms = int((time.time() - started) * 1000)
        limits = _parse_rate_limit_headers(response.headers)
        if limits:
            _rate_limits[provider["id"]] = limits

        if response.status_code != 200:
            status, detail, retry_after = _describe_http_failure(response)
            if status == "rate_limited":
                _cooldown_until[provider["id"]] = time.time() + retry_after
            print(f"[LLM] {provider['name']} HTTP {response.status_code}: {response.text[:300]}")
            failed = {**attempt, "status": status, "detail": detail, "latency_ms": latency_ms}
            if retry_after:
                failed["retry_after"] = retry_after
            attempts.append(failed)
            continue

        try:
            content = (response.json()["choices"][0]["message"].get("content") or "").strip()
        except (ValueError, KeyError, IndexError, TypeError):
            content = ""

        # gpt-oss models can spend the whole budget on hidden reasoning and return no content.
        if not content:
            print(f"[LLM] {provider['name']} returned empty content, falling back.")
            attempts.append({**attempt, "status": "error", "detail": "returned an empty answer", "latency_ms": latency_ms})
            continue

        if validate is not None:
            try:
                usable = validate(content)
            except Exception as e:
                print(f"[LLM] Validator raised for {provider['name']}: {e}")
                usable = False
            if not usable:
                print(f"[LLM] {provider['name']} response failed validation, falling back.")
                attempts.append({**attempt, "status": "rejected", "detail": "response was not usable", "latency_ms": latency_ms})
                continue

        attempts.append({**attempt, "status": "ok", "detail": "answered", "latency_ms": latency_ms})
        print(f"[LLM] Answered by {provider['name']} ({model}) in {latency_ms}ms.")
        return content, {
            "provider": provider["id"],
            "name": provider["name"],
            "model": model,
            "latency_ms": latency_ms,
            "attempts": attempts,
            "rate_limits": _rate_limits.get(provider["id"], {}),
        }

    raise LLMChainError(attempts)
