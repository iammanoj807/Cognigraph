import React, { useEffect, useRef } from 'react';

const COLORS = ['94, 234, 212', '167, 139, 250', '147, 197, 253'];
const LINK_DISTANCE = 140;

/**
 * Drifting points that link up when they come close, a living miniature of the
 * graph the user is about to build. Leans toward the cursor and "charges" up
 * while a document is being processed.
 */
const Constellation = ({ energized = false }) => {
    const canvasRef = useRef(null);
    const energizedRef = useRef(energized);

    useEffect(() => {
        energizedRef.current = energized;
    }, [energized]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const pointer = { x: -9999, y: -9999 };
        let points = [];
        let width = 0;
        let height = 0;
        let frame;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const count = Math.round(Math.min(110, Math.max(36, (width * height) / 14000)));
            points = Array.from({ length: count }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.25,
                r: Math.random() * 1.4 + 0.6,
                c: COLORS[Math.floor(Math.random() * COLORS.length)],
            }));
        };

        const draw = () => {
            const boost = energizedRef.current ? 3.2 : 1;
            ctx.clearRect(0, 0, width, height);

            for (const p of points) {
                if (!reducedMotion) {
                    // Gentle pull toward the cursor
                    const dx = pointer.x - p.x;
                    const dy = pointer.y - p.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < 220 * 220) {
                        p.vx += dx * 0.000012;
                        p.vy += dy * 0.000012;
                    }
                    p.x += p.vx * boost;
                    p.y += p.vy * boost;
                    p.vx *= 0.999;
                    p.vy *= 0.999;
                    if (p.x < -20) p.x = width + 20;
                    if (p.x > width + 20) p.x = -20;
                    if (p.y < -20) p.y = height + 20;
                    if (p.y > height + 20) p.y = -20;
                }
            }

            for (let i = 0; i < points.length; i++) {
                const a = points[i];
                for (let j = i + 1; j < points.length; j++) {
                    const b = points[j];
                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < LINK_DISTANCE) {
                        const alpha = (1 - dist / LINK_DISTANCE) * (energizedRef.current ? 0.32 : 0.16);
                        ctx.strokeStyle = `rgba(${a.c}, ${alpha})`;
                        ctx.lineWidth = 0.8;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }

            for (const p of points) {
                ctx.fillStyle = `rgba(${p.c}, 0.85)`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }

            if (!reducedMotion) frame = requestAnimationFrame(draw);
        };

        const onPointerMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            pointer.x = e.clientX - rect.left;
            pointer.y = e.clientY - rect.top;
        };

        const onResize = () => {
            resize();
            if (reducedMotion) draw();
        };

        resize();
        draw();
        window.addEventListener('resize', onResize);
        window.addEventListener('pointermove', onPointerMove);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('pointermove', onPointerMove);
        };
    }, []);

    return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
};

export default Constellation;
