// Display metadata for the LLM fallback chain (Groq -> Gemini -> NVIDIA).

export const PROVIDER_META = {
    groq: { name: 'Groq', color: '#f55036', role: 'Primary' },
    gemini: { name: 'Gemini', color: '#4c8df6', role: 'Fallback' },
    nvidia: { name: 'NVIDIA', color: '#76b900', role: 'Last resort' },
};

// Shown until /providers responds
export const DEFAULT_CHAIN = [
    { provider: 'groq', name: 'Groq', model: 'openai/gpt-oss-120b', configured: true, cooldown_seconds: 0 },
    { provider: 'gemini', name: 'Gemini', model: 'gemini-3.5-flash-lite', configured: true, cooldown_seconds: 0 },
    { provider: 'nvidia', name: 'NVIDIA', model: 'openai/gpt-oss-20b', configured: true, cooldown_seconds: 0 },
];

export const STATUS_TEXT = {
    ok: 'answered',
    rate_limited: 'rate-limited',
    cooldown: 'cooling down',
    too_large: 'too large',
    auth_error: 'key rejected',
    error: 'failed',
    rejected: 'unusable output',
    unconfigured: 'no key',
    standby: 'not needed',
    ready: 'ready',
};

// Amber = "try again later", red = broken
export const WARN_STATUSES = new Set(['rate_limited', 'cooldown', 'too_large']);
export const FAIL_STATUSES = new Set(['auth_error', 'error', 'rejected']);

export const shortModel = (model = '') => model.replace(/^openai\//, '');

export const formatLatency = (ms) => (ms == null ? '' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

/** One-line summary of a request's route through the chain. */
export function describeRoute(engine) {
    if (!engine?.attempts) return '';
    const tried = engine.attempts.filter((a) => a.status !== 'unconfigured');
    const winner = tried.find((a) => a.status === 'ok');
    const skipped = tried.filter((a) => a.status !== 'ok');
    if (!winner) return 'Every provider failed';
    const head = skipped.map((a) => `${a.name} ${STATUS_TEXT[a.status] || a.status}`).join(' → ');
    const tail = `${winner.name} answered${winner.latency_ms != null ? ` in ${formatLatency(winner.latency_ms)}` : ''}`;
    return head ? `${head} → ${tail}` : tail;
}
