import React from 'react';
import { PROVIDER_META, STATUS_TEXT, WARN_STATUSES, FAIL_STATUSES, shortModel, formatLatency, describeRoute } from '../lib/providers';

const WARN_COLOR = '#fb923c'; // orange: rate-limited / try again later
const RED = '#f87171';

/**
 * Merges the static chain (/providers) with the route a request actually took,
 * so every station knows whether it answered, failed, or wasn't needed.
 */
function stationStates(chain, engine) {
    const byId = Object.fromEntries((engine?.attempts || []).map((a) => [a.provider, a]));
    const winnerIndex = chain.findIndex((p) => byId[p.provider]?.status === 'ok');

    return chain.map((p, i) => {
        const attempt = byId[p.provider];
        if (attempt) return { ...p, status: attempt.status, detail: attempt.detail, latency: attempt.latency_ms };
        if (!p.configured) return { ...p, status: 'unconfigured', detail: 'no API key set' };
        if (engine && winnerIndex !== -1 && i > winnerIndex) return { ...p, status: 'standby', detail: 'not needed for this request' };
        if (p.cooldown_seconds > 0) return { ...p, status: 'cooldown', detail: `rate-limited, retry in ${p.cooldown_seconds}s` };
        return { ...p, status: 'ready', detail: 'ready' };
    });
}

function statusColor(station) {
    if (WARN_STATUSES.has(station.status)) return WARN_COLOR;
    if (FAIL_STATUSES.has(station.status)) return RED;
    return PROVIDER_META[station.provider]?.color || '#94a3b8';
}

function Dot({ station, size = 14 }) {
    const color = PROVIDER_META[station.provider]?.color || '#94a3b8';
    const { status } = station;
    const base = { width: size, height: size };

    if (status === 'ok') {
        return (
            <span className="relative inline-flex shrink-0" style={base}>
                <span className="absolute inset-0 rounded-full animate-pulse-ring" style={{ background: color }} />
                <span className="relative rounded-full" style={{ ...base, background: color, boxShadow: `0 0 14px ${color}` }} />
            </span>
        );
    }
    if (status === 'ready') {
        return <span className="inline-flex shrink-0 rounded-full" style={{ ...base, background: color, opacity: 0.55 }} />;
    }
    if (status === 'standby') {
        return <span className="inline-flex shrink-0 rounded-full border" style={{ ...base, borderColor: `${color}66` }} />;
    }
    if (status === 'unconfigured') {
        return <span className="inline-flex shrink-0 rounded-full border border-dashed border-slate-600" style={base} />;
    }
    const ring = WARN_STATUSES.has(status) ? WARN_COLOR : RED;
    return (
        <span className="inline-flex shrink-0 items-center justify-center rounded-full border-2" style={{ ...base, borderColor: ring }}>
            <span className="rounded-full" style={{ width: size / 3, height: size / 3, background: ring }} />
        </span>
    );
}

/**
 * The Groq -> Gemini -> NVIDIA fallback chain drawn as a tiny graph.
 *  - variant "full": stations with model names and a route caption
 *  - variant "compact": a one-line pill for headers
 */
const EngineChain = ({ chain, engine, busy = false, variant = 'full', className = '' }) => {
    const stations = stationStates(chain, engine);

    if (variant === 'compact') {
        return (
            <div className={`inline-flex items-center gap-1.5 ${className}`} title={engine ? describeRoute(engine) : 'Groq → Gemini → NVIDIA fallback chain'}>
                {stations.map((s, i) => (
                    <React.Fragment key={s.provider}>
                        {i > 0 && <span className="text-[10px] text-slate-600">›</span>}
                        <span className="inline-flex items-center gap-1">
                            <Dot station={s} size={7} />
                            <span className={`text-[11px] ${s.status === 'ok' ? 'text-slate-200' : 'text-slate-500'}`}>{s.name}</span>
                        </span>
                    </React.Fragment>
                ))}
            </div>
        );
    }

    const tried = new Set((engine?.attempts || []).map((a) => a.provider));

    return (
        <div className={className}>
            <div className="relative flex items-start">
                {/* Travelling light while a request is in flight */}
                {busy && (
                    <div className="pointer-events-none absolute left-[42px] right-[42px] top-[6px] h-[2px]">
                        <span className="absolute -top-[3px] h-2 w-8 -translate-x-1/2 rounded-full bg-gradient-to-r from-transparent via-aurora-teal to-transparent animate-travel" />
                    </div>
                )}
                {stations.map((s, i) => {
                    // A lit connector means the request was handed off along it
                    const handedOff = i > 0 && tried.has(s.provider) && stations[i - 1].status !== 'ok';
                    return (
                        <React.Fragment key={s.provider}>
                            {i > 0 && (
                                <div
                                    className="mt-[6px] h-[2px] flex-1 rounded-full"
                                    style={{
                                        background: handedOff
                                            ? `repeating-linear-gradient(90deg, ${WARN_COLOR} 0 6px, transparent 6px 10px)`
                                            : 'rgba(148,163,184,0.16)',
                                    }}
                                />
                            )}
                            <div className="flex w-[84px] shrink-0 flex-col items-center text-center" title={`${s.name}: ${s.detail}`}>
                                <Dot station={s} />
                                <span className={`mt-2 text-xs font-semibold ${s.status === 'ok' ? 'text-white' : 'text-slate-300'}`}>{s.name}</span>
                                <span className="mt-0.5 max-w-full truncate font-mono text-[10px] text-slate-500">{shortModel(s.model)}</span>
                                <span className="mt-1 font-mono text-[10px]" style={{ color: s.status === 'ok' || s.status === 'ready' ? '#94a3b8' : statusColor(s) }}>
                                    {s.status === 'ok' && s.latency != null ? formatLatency(s.latency) : STATUS_TEXT[s.status] || s.status}
                                </span>
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default EngineChain;
