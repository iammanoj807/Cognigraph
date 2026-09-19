import React from 'react';
import { X, ArrowRight, ArrowLeft, MessageSquareText } from 'lucide-react';
import { ROOT_ID, TIER_COLORS, TIER_LABELS, SIGNAL_COLOR } from '../lib/graph';

const MAX_RELATIONS = 40;

/** Floating card describing the selected node and its relationships. */
const NodeInspector = ({ nodeId, analysis, isLit, onSelect, onAsk, onClose }) => {
    if (!nodeId || !analysis.tier.has(nodeId)) return null;

    const tier = analysis.tier.get(nodeId);
    const relations = (analysis.neighbors.get(nodeId) || []).filter((r) => r.id !== ROOT_ID || r.label !== 'contains');
    const degree = analysis.degree.get(nodeId) || 0;

    return (
        <div className="glass flex max-h-[45dvh] w-full flex-col overflow-hidden rounded-2xl animate-fade-up md:max-h-[min(460px,calc(100dvh-180px))] md:w-[340px] md:animate-slide-in-right">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] p-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: isLit ? SIGNAL_COLOR : TIER_COLORS[tier], boxShadow: `0 0 10px ${isLit ? SIGNAL_COLOR : TIER_COLORS[tier]}` }} />
                        <span className="eyebrow">{isLit ? 'In the last answer' : TIER_LABELS[tier]}</span>
                    </div>
                    <h3 className="mt-1.5 break-words font-display text-lg font-semibold leading-snug text-white">{nodeId}</h3>
                    {tier !== 'root' && (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                            {degree} connection{degree === 1 ? '' : 's'}
                        </p>
                    )}
                </div>
                <button onClick={onClose} className="icon-btn -mr-1 -mt-1 shrink-0" aria-label="Close inspector">
                    <X size={16} />
                </button>
            </div>

            {tier !== 'root' && (
                <div className="thin-scroll flex-1 overflow-y-auto px-2 py-2">
                    {relations.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">No relationships found.</p>}
                    {relations.slice(0, MAX_RELATIONS).map((r, i) => (
                        <button
                            key={`${r.id}-${i}`}
                            onClick={() => onSelect(r.id)}
                            className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]"
                        >
                            <span className="mt-0.5 text-slate-600 group-hover:text-aurora-teal">
                                {r.direction === 'out' ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
                            </span>
                            <span className="min-w-0">
                                <span className="block font-mono text-[10.5px] text-slate-500">{r.label || 'related to'}</span>
                                <span className="block break-words text-[13px] text-slate-200 group-hover:text-white">{r.id}</span>
                            </span>
                        </button>
                    ))}
                    {relations.length > MAX_RELATIONS && (
                        <p className="px-2 py-2 text-[11px] text-slate-500">+{relations.length - MAX_RELATIONS} more</p>
                    )}
                </div>
            )}

            <div className="border-t border-white/[0.06] p-3">
                <button
                    onClick={() => onAsk(tier === 'root' ? 'Give me a short summary of this document.' : `What does the document say about "${nodeId}"?`)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2 text-[13px] font-medium text-white transition hover:bg-aurora-teal/15 hover:text-aurora-teal"
                >
                    <MessageSquareText size={15} />
                    {tier === 'root' ? 'Summarize the document' : 'Ask about this'}
                </button>
            </div>
        </div>
    );
};

export default NodeInspector;
