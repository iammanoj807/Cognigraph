import React, { useRef, useState, useEffect } from 'react';
import { Upload, FileText, Clock, Check, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import Constellation from './Constellation';
import EngineChain from './EngineChain';

const ACCEPTED = ['.pdf', '.txt', '.md'];

const PIPELINE = [
    'Reading the document',
    'Indexing passages for retrieval',
    'Extracting entities & relations',
    'Weaving the graph',
];

// When each pipeline step starts (ms after upload begins); the last one holds until the server replies.
const STEP_TIMINGS = [0, 1200, 2800, 5200];

const formatCountdown = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? `${h}h ` : ''}${m}m ${s}s`;
};

const WelcomeScreen = ({ onUploadSuccess, onUploadError, autoTrigger, chain }) => {
    const fileInputRef = useRef(null);
    const hasTriggeredRef = useRef(false); // Guard against StrictMode double-fire
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [fileName, setFileName] = useState('');
    const [step, setStep] = useState(0);
    const [error, setError] = useState(null);
    const [retryIn, setRetryIn] = useState(0);

    // Auto-click upload if triggered from the "New document" button
    useEffect(() => {
        if (autoTrigger && fileInputRef.current && !hasTriggeredRef.current) {
            hasTriggeredRef.current = true;
            fileInputRef.current.click();
        }
    }, [autoTrigger]);

    // Auto-countdown for rate limit errors
    useEffect(() => {
        if (!retryIn) return;
        const timer = setInterval(() => {
            setRetryIn((prev) => {
                if (prev <= 1) {
                    setError(null); // Clear error when timer hits 0
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [retryIn]);

    // Walk through the pipeline labels while the server works
    useEffect(() => {
        if (!isUploading) return;
        setStep(0);
        const timers = STEP_TIMINGS.slice(1).map((ms, i) => setTimeout(() => setStep(i + 1), ms));
        return () => timers.forEach(clearTimeout);
    }, [isUploading]);

    const uploadFile = async (file) => {
        if (!file) return;
        const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!ACCEPTED.includes(extension)) {
            setError(`"${file.name}" isn't supported. Use a PDF, TXT or Markdown file.`);
            return;
        }

        setFileName(file.name);
        setIsUploading(true);
        setError(null);
        setRetryIn(0);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (!response.data?.nodes?.length) {
                throw new Error('No concepts could be extracted from this document.');
            }
            onUploadSuccess(response.data);
        } catch (err) {
            console.error('Upload failed:', err);
            const errorMsg = err.response?.data?.detail || err.message || 'Failed to upload document. Please try again.';

            // Check for wait time in error message
            const match = String(errorMsg).match(/wait (\d+)s/);
            if (match && match[1]) {
                setRetryIn(parseInt(match[1], 10));
            }
            setError(String(errorMsg));
            onUploadError?.();
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (!isUploading) uploadFile(e.dataTransfer.files?.[0]);
    };

    return (
        <div className="relative h-full w-full overflow-y-auto overflow-x-hidden bg-ink-950 dot-grid thin-scroll">
            {/* Aurora glows */}
            <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-aurora-teal/10 blur-[120px]" />
            <div className="pointer-events-none absolute -right-40 top-1/3 h-[560px] w-[560px] rounded-full bg-aurora-violet/10 blur-[140px]" />
            <Constellation energized={isUploading} />

            <div className="relative z-10 mx-auto flex min-h-full max-w-5xl flex-col px-4 sm:px-8">
                <main className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                    <img src="/graph-favicon.svg" alt="" className="h-14 w-14 animate-fade-up drop-shadow-[0_0_24px_rgba(167,139,250,0.55)] sm:h-16 sm:w-16" />
                    <h1 className="mt-5 font-display text-[4.2rem] font-bold leading-none tracking-tighter text-white animate-fade-up [animation-delay:80ms] sm:text-8xl md:text-9xl">
                        Cogni<span className="aurora-text">Graph</span>
                    </h1>
                    <p className="mt-5 text-base text-slate-400 animate-fade-up [animation-delay:160ms] sm:text-lg">
                        Turn any document into a 3D knowledge graph you can talk to.
                    </p>

                    {/* Upload portal */}
                    <div
                        role="button"
                        tabIndex={0}
                        aria-label="Upload a document"
                        data-active={isDragging || isUploading}
                        onClick={() => !isUploading && fileInputRef.current?.click()}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !isUploading && fileInputRef.current?.click()}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragging(true);
                        }}
                        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setIsDragging(false)}
                        onDrop={onDrop}
                        className={`portal glass mt-12 w-full max-w-xl rounded-[28px] px-6 py-8 text-left transition-transform duration-300 animate-fade-up [animation-delay:240ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/60 sm:px-8 ${isUploading ? 'cursor-progress' : 'cursor-pointer hover:-translate-y-0.5'} ${isDragging ? 'scale-[1.02]' : ''}`}
                    >
                        {isUploading ? (
                            <div>
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aurora-teal/10 text-aurora-teal">
                                        <FileText size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-white">{fileName}</p>
                                        <p className="text-xs text-slate-500">Building your knowledge graph…</p>
                                    </div>
                                </div>
                                <ol className="mt-6 space-y-3">
                                    {PIPELINE.map((label, i) => {
                                        const done = i < step;
                                        const active = i === step;
                                        return (
                                            <li key={label} className={`flex items-center gap-3 text-sm transition-colors duration-300 ${done ? 'text-slate-400' : active ? 'text-white' : 'text-slate-600'}`}>
                                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? 'border-aurora-teal/40 bg-aurora-teal/15 text-aurora-teal' : active ? 'border-aurora-teal text-aurora-teal' : 'border-slate-700'}`}>
                                                    {done ? <Check size={12} strokeWidth={3} /> : active ? <Loader2 size={12} className="animate-spin" /> : null}
                                                </span>
                                                {label}
                                            </li>
                                        );
                                    })}
                                </ol>
                            </div>
                        ) : (
                            <div className="flex items-center gap-5">
                                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-aurora-teal/20 to-aurora-violet/20 text-white">
                                    <Upload size={26} />
                                    <span className="absolute left-1/2 top-1/2 -ml-1 -mt-1 h-2 w-2 rounded-full bg-aurora-teal shadow-[0_0_10px_#5eead4] animate-orbit [--orbit-r:38px]" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-display text-xl font-semibold text-white">
                                        {isDragging ? 'Release to map it' : 'Drop a document here'}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-400">
                                        or <span className="text-aurora-teal underline decoration-aurora-teal/40 underline-offset-4">browse your files</span>
                                    </p>
                                    <p className="mt-3 font-mono text-[11px] text-slate-500">PDF · TXT · MD</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div role="alert" className="mt-4 flex w-full max-w-xl items-start gap-2.5 rounded-2xl border border-red-400/20 bg-red-500/[0.07] px-4 py-3 text-left">
                            {retryIn > 0 ? <Clock size={16} className="mt-0.5 shrink-0 text-orange-300" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-300" />}
                            <p className="break-words text-sm text-red-200">
                                {retryIn > 0 ? `Every AI provider is rate-limited. Retry in ${formatCountdown(retryIn)}.` : error}
                            </p>
                        </div>
                    )}

                    <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => uploadFile(e.target.files[0])} accept={ACCEPTED.join(',')} />

                    {/* Engine chain */}
                    <div className="mt-12 w-full max-w-md animate-fade-up [animation-delay:320ms]">
                        <p className="eyebrow mb-4">AI fallback chain</p>
                        <EngineChain chain={chain} busy={isUploading} />
                    </div>
                </main>

                <footer className="pb-6 pt-4 text-center font-mono text-[10px] text-slate-600">
                    Processed in memory, never stored · © CogniGraph {new Date().getFullYear()}
                </footer>
            </div>
        </div>
    );
};

export default WelcomeScreen;
