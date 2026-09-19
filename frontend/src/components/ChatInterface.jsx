import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, X, RotateCcw, Sparkles, CornerDownRight, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { PROVIDER_META, STATUS_TEXT, WARN_STATUSES, FAIL_STATUSES, shortModel, formatLatency } from '../lib/providers';
import EngineChain from './EngineChain';
import Markdown from './Markdown';

const MAX_CHIPS = 8;

/** "Groq too large → Gemini 1.2s · flash-lite": where this answer actually came from. */
const RouteLine = ({ engine }) => {
    const attempts = (engine?.attempts || []).filter((a) => a.status !== 'unconfigured');
    if (!attempts.length) return null;
    const winner = attempts.find((a) => a.status === 'ok');

    return (
        <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[10.5px] text-slate-500">
            {attempts.map((a, i) => {
                const ok = a.status === 'ok';
                const color = ok
                    ? PROVIDER_META[a.provider]?.color
                    : WARN_STATUSES.has(a.status) ? '#fb923c' : FAIL_STATUSES.has(a.status) ? '#f87171' : '#64748b';
                return (
                    <React.Fragment key={a.provider}>
                        {i > 0 && <span className="text-slate-600">→</span>}
                        <span className="inline-flex items-center gap-1" title={a.detail}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: ok ? `0 0 8px ${color}` : 'none' }} />
                            <span className={ok ? 'text-slate-300' : ''}>{a.name}</span>
                            <span style={{ color: ok ? undefined : color }}>{ok ? formatLatency(a.latency_ms) : STATUS_TEXT[a.status] || a.status}</span>
                        </span>
                    </React.Fragment>
                );
            })}
            {winner && <span className="text-slate-600">· {shortModel(winner.model)}</span>}
        </div>
    );
};

const ChatInterface = ({ chain, lastEngine, documentName, suggestions = [], pendingQuestion, onEngine, onHighlightNodes, onFocusNode, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);
    const handledQuestionRef = useRef(null);

    // Auto-scroll to the latest message
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isLoading]);

    // Grow the textarea with its content
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        // scrollHeight is 0 while the panel is hidden (mobile sheet closed); keep the natural height then
        if (el.scrollHeight) el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [input]);

    const send = async (raw) => {
        const text = (raw ?? input).trim();
        if (!text || isLoading) return;

        setMessages((prev) => [...prev, { role: 'user', content: text }]);
        setInput('');
        setIsLoading(true);

        try {
            const { data } = await api.post('/chat', { message: text });
            const highlighted = data.highlighted_nodes || [];
            setMessages((prev) => [...prev, { role: 'ai', content: data.response, engine: data.engine, highlighted, error: data.error }]);
            onHighlightNodes?.(highlighted);
            if (data.engine) onEngine?.(data.engine);
        } catch (error) {
            console.error('Chat error:', error);
            const content = error.response?.data?.detail ||
                (error.message === 'Network Error' ? 'Network error. Please check your connection.' : "I'm having trouble processing that request. It might be too long or complex. Please try shortening it.");
            setMessages((prev) => [...prev, { role: 'ai', content: String(content), error: true }]);
        } finally {
            setIsLoading(false);
        }
    };

    // Questions sent from elsewhere (e.g. the node inspector's "Ask about this")
    useEffect(() => {
        if (!pendingQuestion || handledQuestionRef.current === pendingQuestion.nonce) return;
        handledQuestionRef.current = pendingQuestion.nonce;
        send(pendingQuestion.text);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingQuestion]);

    const clearChat = () => {
        setMessages([]);
        onHighlightNodes?.([]);
    };

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <header className="border-b border-white/[0.06] px-5 pb-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="eyebrow">Ask the graph</p>
                        <h2 className="mt-0.5 font-display text-lg font-semibold text-white">CogniChat</h2>
                    </div>
                    <div className="flex items-center gap-1">
                        {messages.length > 0 && (
                            <button onClick={clearChat} className="icon-btn" title="Clear conversation" aria-label="Clear conversation">
                                <RotateCcw size={16} />
                            </button>
                        )}
                        <button onClick={onClose} className="icon-btn" title="Close chat" aria-label="Close chat">
                            <X size={18} />
                        </button>
                    </div>
                </div>
                <EngineChain variant="compact" chain={chain} engine={lastEngine} className="mt-2" />
            </header>

            {/* Messages */}
            <div ref={scrollRef} className="thin-scroll flex-1 space-y-6 overflow-y-auto px-5 py-5">
                {messages.length === 0 && (
                    <div className="animate-fade-in">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-aurora-teal/20 to-aurora-violet/25 text-aurora-teal">
                            <Sparkles size={18} />
                        </div>
                        <h3 className="mt-4 font-display text-xl font-semibold leading-snug text-white">
                            Ask anything about {documentName ? <span className="aurora-text break-words">{documentName}</span> : 'your document'}
                        </h3>
                        <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
                            Answers come only from the document. The concepts each answer uses light up in <span className="text-signal">pink</span> on the graph.
                        </p>
                        {suggestions.length > 0 && (
                            <div className="mt-6 space-y-2">
                                <p className="eyebrow">Try asking</p>
                                {suggestions.map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => send(s)}
                                        className="group flex w-full items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-left text-[13px] text-slate-300 transition hover:border-aurora-teal/40 hover:bg-aurora-teal/[0.06] hover:text-white"
                                    >
                                        <CornerDownRight size={14} className="mt-0.5 shrink-0 text-slate-600 transition group-hover:text-aurora-teal" />
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {messages.map((msg, idx) =>
                    msg.role === 'user' ? (
                        <div key={idx} className="flex justify-end animate-fade-up">
                            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-white/10 bg-gradient-to-br from-aurora-teal/[0.16] to-aurora-violet/[0.16] px-4 py-2.5 text-[13.5px] leading-relaxed text-white">
                                {msg.content}
                            </div>
                        </div>
                    ) : (
                        <div key={idx} className="relative pl-4 animate-fade-up">
                            <span className={`absolute bottom-1 left-0 top-1 w-px ${msg.error ? 'bg-red-400/50' : 'bg-gradient-to-b from-aurora-teal/80 via-aurora-violet/40 to-transparent'}`} />
                            <div className={`break-words text-[13.5px] leading-relaxed ${msg.error ? 'text-red-200' : 'text-slate-300'}`}>
                                {msg.error && <AlertTriangle size={14} className="mb-1 text-red-300" />}
                                <Markdown text={msg.content} />
                            </div>

                            {msg.highlighted?.length > 0 && (
                                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                    <span className="mr-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">Lit up</span>
                                    {msg.highlighted.slice(0, MAX_CHIPS).map((id) => (
                                        <button
                                            key={id}
                                            onClick={() => onFocusNode?.(id)}
                                            className="max-w-[180px] truncate rounded-full border border-signal/25 bg-signal/[0.08] px-2.5 py-0.5 text-[11px] text-pink-200 transition hover:border-signal/60 hover:bg-signal/20"
                                            title={`Fly to "${id}"`}
                                        >
                                            {id}
                                        </button>
                                    ))}
                                    {msg.highlighted.length > MAX_CHIPS && (
                                        <span className="text-[11px] text-slate-500">+{msg.highlighted.length - MAX_CHIPS} more</span>
                                    )}
                                </div>
                            )}

                            <RouteLine engine={msg.engine} />
                        </div>
                    )
                )}

                {/* Typing Indicator */}
                {isLoading && (
                    <div className="relative pl-4 animate-fade-in">
                        <span className="absolute bottom-1 left-0 top-1 w-px bg-gradient-to-b from-aurora-teal/80 to-transparent" />
                        <div className="flex items-center gap-2 text-[13px] text-slate-400">
                            <span className="flex gap-1">
                                {[0, 150, 300].map((d) => (
                                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-aurora-teal" style={{ animationDelay: `${d}ms` }} />
                                ))}
                            </span>
                            Tracing the graph…
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <footer className="border-t border-white/[0.06] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-ink-950/60 p-1.5 pl-3.5 transition focus-within:border-aurora-teal/50 focus-within:shadow-[0_0_0_4px_rgba(94,234,212,0.08)]">
                    <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                send();
                            }
                        }}
                        placeholder="Ask about your document…"
                        aria-label="Ask about your document"
                        className="thin-scroll max-h-40 flex-1 resize-none bg-transparent py-2 text-[14px] text-white placeholder-slate-500 focus:outline-none"
                    />
                    <button
                        onClick={() => send()}
                        disabled={!input.trim() || isLoading}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-aurora-teal to-aurora-violet text-ink-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Send"
                    >
                        <ArrowUp size={18} strokeWidth={2.5} />
                    </button>
                </div>
                <p className="mt-2 text-center font-mono text-[10px] text-slate-600">Groq → Gemini → NVIDIA · automatic fallback</p>
            </footer>
        </div>
    );
};

export default ChatInterface;
