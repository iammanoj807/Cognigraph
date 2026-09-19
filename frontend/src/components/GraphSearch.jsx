import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { ROOT_ID, TIER_COLORS } from '../lib/graph';

const MAX_RESULTS = 8;

/** Find a concept and fly to it. Press "/" anywhere to focus. */
const GraphSearch = ({ nodes, analysis, onSelect, className = '' }) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const inputRef = useRef(null);

    useEffect(() => {
        const onKey = (e) => {
            const tag = document.activeElement?.tagName;
            if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return nodes
            .filter((n) => n.id !== ROOT_ID && String(n.id).toLowerCase().includes(q))
            .map((n) => ({ id: n.id, starts: String(n.id).toLowerCase().startsWith(q), degree: analysis.degree.get(n.id) || 0 }))
            .sort((a, b) => Number(b.starts) - Number(a.starts) || b.degree - a.degree)
            .slice(0, MAX_RESULTS);
    }, [query, nodes, analysis]);

    const choose = (id) => {
        onSelect(id);
        setQuery('');
        setOpen(false);
        inputRef.current?.blur();
    };

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && results[active]) {
            choose(results[active].id);
        } else if (e.key === 'Escape') {
            setQuery('');
            inputRef.current?.blur();
        }
    };

    return (
        <div className={`relative ${className}`}>
            <div className="glass flex h-11 items-center gap-2.5 rounded-2xl px-3.5 transition focus-within:border-aurora-teal/40">
                <Search size={15} className="shrink-0 text-slate-500" />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setActive(0);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 120)}
                    onKeyDown={onKeyDown}
                    placeholder="Find a concept…"
                    aria-label="Find a concept in the graph"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder-slate-500 focus:outline-none"
                />
                <kbd className="hidden rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 md:inline">/</kbd>
            </div>

            {open && query.trim() && (
                <div className="glass absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-2xl p-1 animate-fade-in">
                    {results.length === 0 ? (
                        <p className="px-3 py-2.5 text-[12px] text-slate-500">No concept matches “{query.trim()}”</p>
                    ) : (
                        results.map((r, i) => (
                            <button
                                key={r.id}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => choose(r.id)}
                                onMouseEnter={() => setActive(i)}
                                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] ${i === active ? 'bg-white/[0.07] text-white' : 'text-slate-300'}`}
                            >
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TIER_COLORS[analysis.tier.get(r.id)] }} />
                                <span className="min-w-0 flex-1 truncate">{r.id}</span>
                                <span className="font-mono text-[10px] text-slate-500">{r.degree}</span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default GraphSearch;
