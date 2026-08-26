'use client';

/**
 * Minimal markdown rendering for agent messages.
 *
 * Models emit `**bold**` and `- ` bullets whether or not you ask them to, and
 * rendering the raw text showed literal asterisks in the conversation. Rather
 * than instructing the agent to avoid formatting — bullets genuinely help when
 * it compares two things — this renders the small subset it actually uses.
 *
 * Builds React elements rather than setting innerHTML, so message text is
 * escaped by React and cannot inject markup. That matters: this content
 * originates from a model that a visitor can influence.
 */

import type { ReactNode } from 'react';

/** Splits on `**bold**`, leaving everything else as plain text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(
      <strong key={`${keyPrefix}-b${index++}`} className="font-medium text-[var(--color-ink)]">
        {match[1]}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const BULLET = /^\s*[-*•]\s+/;

export function RichText({ text, dir }: { text: string; dir: 'ltr' | 'rtl' }) {
  // Group consecutive bullet lines into one list; everything else is a
  // paragraph. Blank lines separate blocks.
  const blocks: Array<{ type: 'p' | 'ul'; lines: string[] }> = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const isBullet = BULLET.test(line);
    const last = blocks[blocks.length - 1];

    if (isBullet) {
      const content = line.replace(BULLET, '');
      if (last?.type === 'ul') last.lines.push(content);
      else blocks.push({ type: 'ul', lines: [content] });
    } else if (last?.type === 'p') {
      last.lines.push(line);
    } else {
      blocks.push({ type: 'p', lines: [line] });
    }
  }

  return (
    <div dir={dir} className="max-w-prose space-y-3 text-[15px] leading-relaxed">
      {blocks.map((block, i) =>
        block.type === 'ul' ? (
          <ul key={i} className="space-y-1.5">
            {block.lines.map((line, j) => (
              <li key={j} className="flex gap-2">
                <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
                <span>{renderInline(line, `${i}-${j}`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>{renderInline(block.lines.join('\n'), String(i))}</p>
        ),
      )}
    </div>
  );
}
