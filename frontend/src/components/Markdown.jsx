import React from 'react';

// Minimal Markdown for chat answers: headings, lists, tables, code, bold/italic/inline code.
// Builds React elements only (never innerHTML), so model output can't inject markup.

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;

function renderInline(text, keyPrefix) {
    const parts = [];
    let last = 0;
    let i = 0;
    let match;
    INLINE.lastIndex = 0;
    while ((match = INLINE.exec(text))) {
        if (match.index > last) parts.push(text.slice(last, match.index));
        const token = match[0];
        const key = `${keyPrefix}-${i++}`;
        if (token.startsWith('**')) {
            parts.push(<strong key={key} className="font-semibold text-white">{token.slice(2, -2)}</strong>);
        } else if (token.startsWith('`')) {
            parts.push(<code key={key} className="rounded bg-white/[0.07] px-1 py-0.5 font-mono text-[0.85em] text-aurora-teal">{token.slice(1, -1)}</code>);
        } else {
            parts.push(<em key={key}>{token.slice(1, -1)}</em>);
        }
        last = match.index + token.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

const BULLET = /^(\s*)[-*•]\s+(.*)$/;
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

const splitRow = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

function parseBlocks(source) {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed || /^(-{3,}|\*{3,})$/.test(trimmed)) {
            i++;
            continue;
        }

        if (trimmed.startsWith('```')) {
            const code = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
            i++;
            blocks.push({ type: 'code', text: code.join('\n') });
            continue;
        }

        const heading = trimmed.match(HEADING);
        if (heading) {
            blocks.push({ type: 'heading', text: heading[2] });
            i++;
            continue;
        }

        if (trimmed.includes('|') && TABLE_SEPARATOR.test(lines[i + 1] || '')) {
            const header = splitRow(trimmed);
            const rows = [];
            i += 2;
            while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
            blocks.push({ type: 'table', header, rows });
            continue;
        }

        const listType = BULLET.test(line) ? 'ul' : NUMBERED.test(line) ? 'ol' : null;
        if (listType) {
            const pattern = listType === 'ul' ? BULLET : NUMBERED;
            const items = [];
            while (i < lines.length) {
                const m = lines[i].match(pattern) || lines[i].match(listType === 'ul' ? NUMBERED : BULLET);
                if (m) {
                    items.push({ depth: Math.min(2, Math.floor(m[1].length / 2)), text: m[2] });
                } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
                    items[items.length - 1].text += ` ${lines[i].trim()}`;
                } else {
                    break;
                }
                i++;
            }
            blocks.push({ type: listType, items });
            continue;
        }

        const paragraph = [trimmed];
        i++;
        while (i < lines.length) {
            const next = lines[i].trim();
            if (!next || next.startsWith('```') || HEADING.test(next) || BULLET.test(lines[i]) || NUMBERED.test(lines[i])) break;
            paragraph.push(next);
            i++;
        }
        blocks.push({ type: 'p', text: paragraph.join(' ') });
    }
    return blocks;
}

const Markdown = ({ text }) => {
    const blocks = parseBlocks(text || '');
    return (
        <div className="space-y-2.5">
            {blocks.map((block, b) => {
                const key = `b${b}`;
                switch (block.type) {
                    case 'heading':
                        return <p key={key} className="pt-1 font-display text-[13.5px] font-semibold text-white">{renderInline(block.text, key)}</p>;
                    case 'code':
                        return (
                            <pre key={key} className="thin-scroll overflow-x-auto rounded-lg border border-white/[0.06] bg-black/30 p-3 font-mono text-[12px] leading-relaxed text-slate-300">
                                {block.text}
                            </pre>
                        );
                    case 'table':
                        return (
                            <div key={key} className="thin-scroll overflow-x-auto rounded-lg border border-white/[0.08]">
                                <table className="w-full border-collapse text-left text-[12.5px]">
                                    <thead className="bg-white/[0.04] text-slate-300">
                                        <tr>{block.header.map((h, c) => <th key={c} className="px-3 py-2 font-semibold">{renderInline(h, `${key}h${c}`)}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {block.rows.map((row, r) => (
                                            <tr key={r} className="border-t border-white/[0.06]">
                                                {row.map((cell, c) => <td key={c} className="px-3 py-2 align-top">{renderInline(cell, `${key}r${r}c${c}`)}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    case 'ul':
                    case 'ol':
                        return (
                            <ul key={key} className="space-y-1.5">
                                {block.items.map((item, n) => (
                                    <li key={n} className="flex gap-2.5" style={{ paddingLeft: item.depth * 16 }}>
                                        <span className={`shrink-0 select-none ${block.type === 'ol' ? 'min-w-[1.1rem] font-mono text-[11px] leading-[1.6rem] text-aurora-teal' : 'mt-[0.6rem] h-1 w-1 rounded-full bg-aurora-teal'}`}>
                                            {block.type === 'ol' ? `${n + 1}.` : ''}
                                        </span>
                                        <span className="min-w-0">{renderInline(item.text, `${key}i${n}`)}</span>
                                    </li>
                                ))}
                            </ul>
                        );
                    default:
                        return <p key={key}>{renderInline(block.text, key)}</p>;
                }
            })}
        </div>
    );
};

export default Markdown;
