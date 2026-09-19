// Graph helpers shared by the 3D view, the inspector and chat suggestions.

export const ROOT_ID = 'Document';

export const TIER_COLORS = {
    root: '#ffffff',
    hub: '#a78bfa',
    concept: '#38bdf8',
    detail: '#cbd5e1',
};

export const TIER_LABELS = {
    root: 'Document',
    hub: 'Hub',
    concept: 'Concept',
    detail: 'Detail',
};

export const SIGNAL_COLOR = '#4ade80';

export const idOf = (end) => (end && typeof end === 'object' ? end.id : end);

/**
 * Degree, tier and adjacency for every node. Edges to the synthetic root are
 * ignored for ranking so its "contains" links don't make every node look central.
 */
export function analyzeGraph(data) {
    const neighbors = new Map();
    const degree = new Map();
    data.nodes.forEach((n) => {
        neighbors.set(n.id, []);
        degree.set(n.id, 0);
    });

    let linkCount = 0;
    data.links.forEach((link) => {
        const s = idOf(link.source);
        const t = idOf(link.target);
        if (!neighbors.has(s) || !neighbors.has(t)) return;
        neighbors.get(s).push({ id: t, label: link.label, direction: 'out' });
        neighbors.get(t).push({ id: s, label: link.label, direction: 'in' });
        if (s === ROOT_ID || t === ROOT_ID) return;
        linkCount += 1;
        degree.set(s, degree.get(s) + 1);
        degree.set(t, degree.get(t) + 1);
    });

    const ranked = [...degree.entries()]
        .filter(([id]) => id !== ROOT_ID)
        .sort((a, b) => b[1] - a[1]);

    // Top ~15% by degree (and at least 3 connections) are hubs
    const cutoffIndex = Math.max(0, Math.floor(ranked.length * 0.15) - 1);
    const hubThreshold = Math.max(3, ranked[cutoffIndex]?.[1] ?? 3);

    const tier = new Map();
    data.nodes.forEach((n) => {
        const d = degree.get(n.id);
        if (n.id === ROOT_ID) tier.set(n.id, 'root');
        else if (d >= hubThreshold) tier.set(n.id, 'hub');
        else if (d >= 2) tier.set(n.id, 'concept');
        else tier.set(n.id, 'detail');
    });

    return {
        neighbors,
        degree,
        tier,
        hubs: ranked.slice(0, 6).map(([id]) => id),
        nodeCount: data.nodes.filter((n) => n.id !== ROOT_ID).length,
        linkCount,
    };
}

export function nodeRadius(tier, degree) {
    if (tier === 'root') return 11;
    if (tier === 'hub') return 7 + Math.min(4, Math.sqrt(degree) * 1.2);
    if (tier === 'concept') return 5.2;
    return 3.8;
}

export const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
