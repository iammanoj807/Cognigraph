import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, FilePlus2, MessagesSquare } from 'lucide-react';
import GraphView from './components/GraphView';
import ChatInterface from './components/ChatInterface';
import WelcomeScreen from './components/WelcomeScreen';
import NodeInspector from './components/NodeInspector';
import GraphSearch from './components/GraphSearch';
import { api } from './lib/api';
import { analyzeGraph } from './lib/graph';
import { DEFAULT_CHAIN, PROVIDER_META, describeRoute, formatLatency } from './lib/providers';

const MOBILE_QUERY = '(max-width: 767px)';
const EMPTY_GRAPH = { nodes: [], links: [] };

const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
    useEffect(() => {
        const mq = window.matchMedia(MOBILE_QUERY);
        const onChange = () => setIsMobile(mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return isMobile;
};

function App() {
    const isMobile = useIsMobile();
    const [graphData, setGraphData] = useState(EMPTY_GRAPH);
    const [documentInfo, setDocumentInfo] = useState(null);
    const [chain, setChain] = useState(DEFAULT_CHAIN);
    const [graphEngine, setGraphEngine] = useState(null); // which provider built the graph
    const [lastEngine, setLastEngine] = useState(null); // which provider answered last
    const [highlightedNodes, setHighlightedNodes] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [chatOpen, setChatOpen] = useState(() => !window.matchMedia(MOBILE_QUERY).matches);
    const [pendingQuestion, setPendingQuestion] = useState(null);
    const [autoTriggerUpload, setAutoTriggerUpload] = useState(false);
    const [documentKey, setDocumentKey] = useState(0);

    const refreshProviders = useCallback(() => {
        api.get('/providers')
            .then((res) => res.data?.chain && setChain(res.data.chain))
            .catch((err) => console.error('Failed to load providers', err));
    }, []);

    useEffect(() => {
        // Initial load - Reset session to ensure fresh start
        api.post('/reset').catch((err) => console.error('Failed to reset session', err));
        refreshProviders();
    }, [refreshProviders]);

    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && setSelectedId(null);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const analysis = useMemo(() => analyzeGraph(graphData), [graphData]);
    const hasGraph = graphData.nodes.length > 0;

    const suggestions = useMemo(() => {
        const [a, b, c] = analysis.hubs;
        const list = ['Give me a short summary of this document.'];
        if (a) list.push(`What does the document say about ${a}?`);
        if (a && b) list.push(`How are ${a} and ${b} connected?`);
        if (c) list.push(`What are the key facts about ${c}?`);
        return list;
    }, [analysis]);

    const handleUploadSuccess = ({ nodes, links, engine, document }) => {
        setGraphData({ nodes, links });
        setDocumentInfo(document || null);
        setGraphEngine(engine || null);
        setLastEngine(engine || null);
        setHighlightedNodes([]);
        setSelectedId(null);
        setAutoTriggerUpload(false);
        setPendingQuestion(null);
        setDocumentKey((k) => k + 1);
    };

    // Resets the current session to allow a new file upload
    const handleNewDocument = () => {
        setGraphData(EMPTY_GRAPH);
        setHighlightedNodes([]);
        setSelectedId(null);
        setAutoTriggerUpload(true); // Auto-open file dialog on next render
        refreshProviders();
    };

    const askAbout = (text) => {
        setPendingQuestion({ text, nonce: Date.now() });
        setChatOpen(true);
    };

    const focusNode = (id) => {
        setSelectedId(id);
        if (isMobile) setChatOpen(false);
    };

    if (!hasGraph) {
        return (
            <div className="h-[100dvh] w-full bg-ink-950 text-white">
                <WelcomeScreen
                    onUploadSuccess={handleUploadSuccess}
                    onUploadError={refreshProviders}
                    autoTrigger={autoTriggerUpload}
                    chain={chain}
                />
            </div>
        );
    }

    const builder = graphEngine && PROVIDER_META[graphEngine.provider];

    return (
        <div className="flex h-[100dvh] w-full overflow-hidden bg-ink-950 text-white">
            {/* Graph stage */}
            <div className="relative min-w-0 flex-1">
                <GraphView
                    data={graphData}
                    analysis={analysis}
                    documentName={documentInfo?.name}
                    highlightedNodes={highlightedNodes}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                />

                {/* Top bar */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 md:flex-row md:items-start md:gap-3 md:p-4">
                    <div className="pointer-events-auto flex min-w-0 items-center gap-2 md:gap-3">
                        <div className="glass flex h-11 shrink-0 items-center gap-2 rounded-2xl px-3">
                            <img src="/graph-favicon.svg" alt="" className="h-5 w-5" />
                            <span className="hidden font-display text-[15px] font-semibold tracking-tight lg:inline">CogniGraph</span>
                        </div>

                        <div className="glass flex h-11 min-w-0 items-center gap-2.5 rounded-2xl px-3.5" title={graphEngine ? `Graph built via: ${describeRoute(graphEngine)}` : undefined}>
                            <FileText size={15} className="shrink-0 text-aurora-teal" />
                            <span className="min-w-0 max-w-[140px] truncate text-[13px] font-medium text-white sm:max-w-[220px]">{documentInfo?.name || 'Document'}</span>
                            <span className="hidden shrink-0 font-mono text-[11px] text-slate-500 sm:inline">
                                {analysis.nodeCount} concepts · {analysis.linkCount} links
                            </span>
                            {builder && (
                                <span className="hidden shrink-0 items-center gap-1.5 border-l border-white/10 pl-2.5 font-mono text-[11px] text-slate-500 xl:inline-flex">
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: builder.color, boxShadow: `0 0 8px ${builder.color}` }} />
                                    built by {builder.name} {formatLatency(graphEngine.latency_ms)}
                                </span>
                            )}
                        </div>

                        <button onClick={handleNewDocument} className="glass flex h-11 shrink-0 items-center gap-2 rounded-2xl px-3 text-[13px] text-slate-300 transition hover:text-white md:ml-0" title="Upload a new document">
                            <FilePlus2 size={16} />
                            <span className="hidden sm:inline">New</span>
                        </button>
                    </div>

                    <div className="pointer-events-auto flex items-start gap-2 md:ml-auto">
                        <GraphSearch nodes={graphData.nodes} analysis={analysis} onSelect={focusNode} className="flex-1 md:w-64 md:flex-none" />
                        {!chatOpen && !isMobile && (
                            <button onClick={() => setChatOpen(true)} className="glass flex h-11 items-center gap-2 rounded-2xl px-3.5 text-[13px] font-medium text-white transition hover:border-aurora-teal/40 animate-fade-in">
                                <MessagesSquare size={16} className="text-aurora-teal" />
                                Ask
                            </button>
                        )}
                    </div>
                </div>

                {/* Node inspector */}
                {selectedId && (
                    <div className="absolute inset-x-3 bottom-3 z-30 md:inset-x-auto md:bottom-auto md:left-4 md:top-[76px]">
                        <NodeInspector
                            nodeId={selectedId}
                            analysis={analysis}
                            isLit={highlightedNodes.includes(selectedId)}
                            onSelect={setSelectedId}
                            onAsk={askAbout}
                            onClose={() => setSelectedId(null)}
                        />
                    </div>
                )}

                {/* Mobile: open chat */}
                {isMobile && !chatOpen && !selectedId && (
                    <button
                        onClick={() => setChatOpen(true)}
                        className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-gradient-to-r from-aurora-teal to-aurora-violet px-5 py-3 text-sm font-semibold text-ink-950 shadow-[0_10px_40px_-8px_rgba(94,234,212,0.6)] animate-fade-up"
                    >
                        <MessagesSquare size={17} />
                        Ask the graph
                    </button>
                )}
            </div>

            {/* Chat: a floating column on desktop, a full-screen sheet on mobile. Always mounted so the conversation survives closing it. */}
            <aside
                className={
                    isMobile
                        ? `fixed inset-0 z-40 bg-ink-950 ${chatOpen ? 'animate-fade-up' : 'hidden'}`
                        : 'relative shrink-0 overflow-hidden transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'
                }
                style={isMobile ? undefined : { width: chatOpen ? 432 : 0 }}
                inert={!chatOpen}
            >
                <div className={isMobile ? 'h-full' : 'h-full w-[432px] py-3 pr-3'}>
                    <div className={isMobile ? 'h-full' : 'glass h-full overflow-hidden rounded-3xl'}>
                        <ChatInterface
                            key={documentKey}
                            chain={chain}
                            lastEngine={lastEngine}
                            documentName={documentInfo?.name}
                            suggestions={suggestions}
                            pendingQuestion={pendingQuestion}
                            onEngine={setLastEngine}
                            onHighlightNodes={setHighlightedNodes}
                            onFocusNode={focusNode}
                            onClose={() => setChatOpen(false)}
                        />
                    </div>
                </div>
            </aside>
        </div>
    );
}

export default App;
