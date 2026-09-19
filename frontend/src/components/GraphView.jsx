import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { Plus, Minus, Maximize, Rotate3d, Tags } from 'lucide-react';
import { ROOT_ID, TIER_COLORS, TIER_LABELS, SIGNAL_COLOR, idOf, nodeRadius, escapeHtml } from '../lib/graph';

const SPHERE = new THREE.SphereGeometry(1, 24, 18);
const LABEL_COLOR = '#e7ebf3';
const AUTO_ROTATE_SPEED = 0.6;

// Soft radial sprite shared by every node's halo, so nodes glow without post-processing
let glowTexture = null;
const getGlowTexture = () => {
    if (glowTexture) return glowTexture;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    glowTexture = new THREE.CanvasTexture(canvas);
    return glowTexture;
};

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Applies the current highlight / selection / hover state to a node's meshes.
 * Objects are built once and mutated here, which is far cheaper than rebuilding them.
 */
function styleNode(obj, node, v) {
    const ud = obj.userData;
    const lit = v.lit.has(node.id);
    const selected = node.id === v.selectedId;
    const hovered = node.id === v.hoverId;
    const near = v.focus ? v.focus.has(node.id) : false;
    const active = lit || selected || near || hovered;
    const faded = v.dimming && !active;
    const color = lit ? SIGNAL_COLOR : selected ? '#ffffff' : ud.color;
    const scale = lit || selected ? 1.3 : hovered ? 1.2 : 1;

    ud.core.material.color.set(color);
    ud.core.material.opacity = faded ? 0.14 : 1;
    ud.core.scale.setScalar(ud.r * scale);

    ud.halo.material.color.set(color);
    ud.halo.material.opacity = faded ? 0.03 : lit || selected ? 0.9 : 0.35;
    ud.halo.scale.setScalar(ud.r * (lit || selected ? 6 : 4));

    const important = ud.tier === 'root' || ud.tier === 'hub';
    ud.label.visible = active || (v.labelMode === 'all' ? !faded : important && !v.dimming);
    const labelColor = lit ? SIGNAL_COLOR : LABEL_COLOR;
    if (ud.label.color !== labelColor) ud.label.color = labelColor;
    ud.label.position.y = ud.r * scale + ud.label.textHeight * 0.8 + 1.5;
}

const GraphView = ({ data, analysis, documentName, highlightedNodes = [], selectedId, onSelect }) => {
    const fgRef = useRef();
    const containerRef = useRef();
    const rotateTimerRef = useRef();
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [hoverId, setHoverId] = useState(null);
    const [autoRotate, setAutoRotate] = useState(true);
    const [labelMode, setLabelMode] = useState(() => (data.nodes.length > 70 ? 'smart' : 'all'));
    const autoRotateRef = useRef(autoRotate);

    const visual = useMemo(() => {
        const lit = new Set(highlightedNodes);
        const focus = selectedId ? new Set([selectedId, ...(analysis.neighbors.get(selectedId) || []).map((n) => n.id)]) : null;
        return { lit, focus, selectedId, labelMode, dimming: lit.size > 0 || !!focus };
    }, [highlightedNodes, selectedId, analysis, labelMode]);

    // Read by the node builder, so freshly created objects start in the right state
    const visualRef = useRef({ ...visual, hoverId });
    useLayoutEffect(() => {
        visualRef.current = { ...visual, hoverId };
        autoRotateRef.current = autoRotate;
    });

    const nodeThreeObject = useCallback((node) => {
        const tier = analysis.tier.get(node.id) || 'detail';
        const color = TIER_COLORS[tier];
        const r = nodeRadius(tier, analysis.degree.get(node.id) || 0);

        const core = new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color, transparent: true }));
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: getGlowTexture(),
            color,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }));

        const text = node.id === ROOT_ID && documentName ? truncate(documentName, 32) : truncate(String(node.id), 40);
        const label = new SpriteText(text);
        label.fontFace = 'Inter, system-ui, sans-serif';
        label.fontWeight = tier === 'hub' || tier === 'root' ? '600' : '500';
        label.textHeight = tier === 'root' ? 8 : tier === 'hub' ? 6.5 : tier === 'concept' ? 5 : 4.2;
        label.color = LABEL_COLOR;
        label.backgroundColor = 'rgba(5,7,13,0.6)';
        label.padding = [3, 1.5];
        label.borderRadius = 2.5;
        label.material.depthWrite = false;

        const group = new THREE.Group();
        group.add(halo, core, label);
        group.userData = { core, halo, label, color, r, tier };
        styleNode(group, node, visualRef.current);
        return group;
    }, [analysis, documentName]);

    // Re-style existing objects whenever highlight, selection, hover or label mode changes
    useEffect(() => {
        const current = { ...visual, hoverId };
        data.nodes.forEach((node) => {
            if (node.__threeObj?.userData?.core) styleNode(node.__threeObj, node, current);
        });
    }, [visual, hoverId, data]);

    const linkColor = useCallback((link) => {
        const s = idOf(link.source);
        const t = idOf(link.target);
        const rootEdge = s === ROOT_ID || t === ROOT_ID;
        if (visual.lit.has(s) && visual.lit.has(t)) return 'rgba(74,222,128,0.95)';
        if (visual.selectedId && (s === visual.selectedId || t === visual.selectedId)) return 'rgba(255,255,255,0.75)';
        if (!rootEdge && (visual.lit.has(s) || visual.lit.has(t))) return 'rgba(74,222,128,0.35)';
        if (visual.dimming) return rootEdge ? 'rgba(148,163,184,0.03)' : 'rgba(148,163,184,0.06)';
        return rootEdge ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,255,0.5)';
    }, [visual]);

    const linkWidth = useCallback((link) => {
        const s = idOf(link.source);
        const t = idOf(link.target);
        if (visual.lit.has(s) && visual.lit.has(t)) return 1.8;
        if (visual.selectedId && (s === visual.selectedId || t === visual.selectedId)) return 1.2;
        return 0.5;
    }, [visual]);

    const linkParticles = useCallback((link) => {
        const s = idOf(link.source);
        const t = idOf(link.target);
        if (visual.lit.has(s) && visual.lit.has(t)) return 3;
        if (visual.selectedId && (s === visual.selectedId || t === visual.selectedId)) return 2;
        return 0;
    }, [visual]);

    const linkParticleColor = useCallback((link) => (visual.lit.has(idOf(link.source)) ? SIGNAL_COLOR : '#ffffff'), [visual]);

    const linkLabel = useCallback((link) => {
        const s = idOf(link.source);
        const t = idOf(link.target);
        if (s === ROOT_ID || t === ROOT_ID) return '';
        return `<div class="graph-tip">${escapeHtml(s)} <span class="rel">— ${escapeHtml(link.label || 'related to')} →</span> ${escapeHtml(t)}</div>`;
    }, []);

    // Suspend auto-rotation while the camera flies, so the two motions don't fight
    const pauseAutoRotate = useCallback((ms) => {
        const controls = fgRef.current?.controls();
        if (!controls) return;
        controls.autoRotate = false;
        clearTimeout(rotateTimerRef.current);
        rotateTimerRef.current = setTimeout(() => {
            controls.autoRotate = autoRotateRef.current;
        }, ms + 200);
    }, []);

    /**
     * Centers the camera on a set of nodes and pulls back just far enough to fit them,
     * keeping the current viewing angle. (The library's zoomToFit always aims at the
     * origin, which leaves a lit-up cluster off to one side.)
     */
    const frameNodes = useCallback((ids, ms = 1200, { pad = 25, scale = 1.45 } = {}) => {
        const fg = fgRef.current;
        if (!fg) return;
        const wanted = new Set(ids);
        const points = data.nodes.filter((n) => wanted.has(n.id) && n.x != null);
        if (!points.length) return;

        const center = { x: 0, y: 0, z: 0 };
        points.forEach((p) => {
            center.x += p.x / points.length;
            center.y += p.y / points.length;
            center.z += p.z / points.length;
        });
        const radius = Math.max(40, ...points.map((p) => Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z)));

        // Fit against the narrower of the vertical / horizontal field of view
        const camera = fg.camera();
        const vFov = ((camera.fov || 50) * Math.PI) / 180;
        const fov = Math.min(vFov, 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 1)));
        // Extra room for node size, labels and the floating top bar
        const distance = ((radius + pad) * scale) / Math.sin(fov / 2);

        const pos = fg.cameraPosition();
        const target = fg.controls()?.target || { x: 0, y: 0, z: 0 };
        let dir = { x: pos.x - target.x, y: pos.y - target.y, z: pos.z - target.z };
        const len = Math.hypot(dir.x, dir.y, dir.z);
        dir = len > 0.001 ? { x: dir.x / len, y: dir.y / len, z: dir.z / len } : { x: 0, y: 0, z: 1 };

        pauseAutoRotate(ms);
        fg.cameraPosition(
            { x: center.x + dir.x * distance, y: center.y + dir.y * distance, z: center.z + dir.z * distance },
            center,
            ms
        );
    }, [data, pauseAutoRotate]);

    // The whole graph gets a tighter fit than an answer's cluster; the library's zoomToFit
    // sizes against a bounding cube and leaves the graph tiny on portrait screens.
    const fitAll = useCallback((ms = 900) => {
        frameNodes(data.nodes.map((n) => n.id), ms, { pad: 8, scale: 1.08 });
    }, [data, frameNodes]);

    const isReady = dimensions.width > 0;

    // Physics + camera setup for each new graph
    useEffect(() => {
        const fg = fgRef.current;
        if (!fg) return;
        fg.d3Force('charge').strength(-180);
        // No reheat here: the graph digest runs on a deferred tick and re-heats with these forces itself.
        // Reheating before that digest starts the engine without a layout and crashes the render loop.
        fg.d3Force('link').distance((link) => (idOf(link.source) === ROOT_ID || idOf(link.target) === ROOT_ID ? 75 : 42));

        const controls = fg.controls();
        if (controls) {
            controls.enableDamping = true;
            controls.dampingFactor = 0.12;
            controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
            controls.autoRotate = autoRotateRef.current;
        }

        const timer = setTimeout(() => fitAll(1000), 900);
        return () => clearTimeout(timer);
    }, [data, isReady, fitAll]);

    useEffect(() => {
        const controls = fgRef.current?.controls();
        if (controls) controls.autoRotate = autoRotate;
    }, [autoRotate]);

    // Fly to the selected node, framed with its neighbourhood
    useEffect(() => {
        if (!selectedId) return;
        const neighbours = (analysis.neighbors.get(selectedId) || []).map((n) => n.id).filter((id) => id !== ROOT_ID);
        frameNodes([selectedId, ...neighbours]);
    }, [selectedId, analysis, frameNodes]);

    // Frame whatever the latest answer lit up
    useEffect(() => {
        if (highlightedNodes.length) frameNodes(highlightedNodes, 1300);
    }, [highlightedNodes, frameNodes]);

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
            }
        };
        updateDimensions();
        const observer = new ResizeObserver(updateDimensions);
        if (containerRef.current) observer.observe(containerRef.current);
        window.addEventListener('orientationchange', updateDimensions);
        return () => {
            observer.disconnect();
            window.removeEventListener('orientationchange', updateDimensions);
            clearTimeout(rotateTimerRef.current);
        };
    }, []);

    const zoomBy = (factor) => {
        const fg = fgRef.current;
        if (!fg) return;
        const pos = fg.cameraPosition();
        const target = fg.controls()?.target || { x: 0, y: 0, z: 0 };
        pauseAutoRotate(450);
        fg.cameraPosition(
            {
                x: target.x + (pos.x - target.x) * factor,
                y: target.y + (pos.y - target.y) * factor,
                z: target.z + (pos.z - target.z) * factor,
            },
            null,
            450
        );
    };

    const controlButton = (active) =>
        `flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${active ? 'bg-aurora-teal/15 text-aurora-teal' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`;

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,#0e1426_0%,#05070d_70%)]"
            style={{ cursor: hoverId ? 'pointer' : 'grab' }}
        >
            <div className="pointer-events-none absolute inset-0 dot-grid opacity-60" />
            {isReady && (
                <ForceGraph3D
                    ref={fgRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={data}
                    backgroundColor="rgba(0,0,0,0)"
                    showNavInfo={false}
                    controlType="orbit"
                    warmupTicks={60}
                    nodeLabel={() => ''}
                    nodeThreeObject={nodeThreeObject}
                    linkColor={linkColor}
                    linkWidth={linkWidth}
                    linkOpacity={1}
                    linkLabel={linkLabel}
                    linkDirectionalParticles={linkParticles}
                    linkDirectionalParticleWidth={2.6}
                    linkDirectionalParticleSpeed={0.006}
                    linkDirectionalParticleColor={linkParticleColor}
                    onNodeHover={(node) => setHoverId(node ? node.id : null)}
                    onNodeClick={(node) => onSelect(node.id)}
                    onBackgroundClick={() => onSelect(null)}
                />
            )}

            {/* Legend */}
            <div className="pointer-events-none absolute bottom-4 left-4 hidden items-center gap-4 rounded-full border border-white/[0.06] bg-ink-950/60 px-4 py-2 backdrop-blur-md md:flex">
                {['hub', 'concept', 'detail'].map((tier) => (
                    <span key={tier} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="h-2 w-2 rounded-full" style={{ background: TIER_COLORS[tier], boxShadow: `0 0 8px ${TIER_COLORS[tier]}` }} />
                        {TIER_LABELS[tier]}
                    </span>
                ))}
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-signal shadow-[0_0_8px_#4ade80]" />
                    In answer
                </span>
                <span className="h-3 w-px bg-white/10" />
                <span className="font-mono text-[10.5px] text-slate-500">drag to orbit · scroll to zoom · click a node</span>
            </div>

            {/* Camera controls */}
            <div className="glass absolute bottom-24 right-3 flex flex-col gap-0.5 rounded-2xl p-1 md:bottom-4 md:right-4">
                <button onClick={() => zoomBy(0.75)} className={controlButton(false)} title="Zoom in" aria-label="Zoom in"><Plus size={17} /></button>
                <button onClick={() => zoomBy(1.33)} className={controlButton(false)} title="Zoom out" aria-label="Zoom out"><Minus size={17} /></button>
                <button onClick={() => fitAll()} className={controlButton(false)} title="Fit graph to view" aria-label="Fit graph to view"><Maximize size={15} /></button>
                <span className="mx-2 my-0.5 h-px bg-white/10" />
                <button onClick={() => setAutoRotate((v) => !v)} className={controlButton(autoRotate)} title={autoRotate ? 'Stop rotating' : 'Auto-rotate'} aria-label="Toggle auto-rotate" aria-pressed={autoRotate}>
                    <Rotate3d size={16} />
                </button>
                <button onClick={() => setLabelMode((m) => (m === 'all' ? 'smart' : 'all'))} className={controlButton(labelMode === 'all')} title={labelMode === 'all' ? 'Show only key labels' : 'Show all labels'} aria-label="Toggle labels" aria-pressed={labelMode === 'all'}>
                    <Tags size={16} />
                </button>
            </div>
        </div>
    );
};

export default GraphView;
