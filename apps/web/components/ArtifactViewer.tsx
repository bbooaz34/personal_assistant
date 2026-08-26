'use client';

/**
 * Embeds a real project artifact in the conversation (design doc §9).
 *
 * The recruiter should not have to leave the conversation to understand the
 * work — and for a project whose whole argument is a visual transformation,
 * describing it is a poor substitute for showing the same screens under each
 * design language.
 *
 * Security: the iframe sandboxes *without* `allow-same-origin`, so the
 * artifact runs in an opaque origin and cannot read cookies, storage, or the
 * surrounding DOM. The serving route adds a CSP with `connect-src 'none'`, so
 * it cannot send anything anywhere either.
 */

import { useState } from 'react';
import type { ProjectArtifact } from './portfolio-types';

export function ArtifactViewer({
  projectName,
  artifacts,
  initialArtifactId,
  sandbox,
}: {
  projectName: string;
  artifacts: ProjectArtifact[];
  initialArtifactId?: string;
  sandbox: string;
}) {
  const initial =
    artifacts.find((a) => a.id === initialArtifactId) ?? artifacts[0];
  const [activeId, setActiveId] = useState(initial?.id);
  const active = artifacts.find((a) => a.id === activeId) ?? initial;

  if (!active) return null;

  return (
    <section
      aria-label={`Artifact: ${projectName}`}
      className="my-3 overflow-hidden rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)]"
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-edge)] p-2">
        {artifacts.map((artifact) => {
          const selected = artifact.id === active.id;
          return (
            <button
              key={artifact.id}
              type="button"
              onClick={() => setActiveId(artifact.id)}
              aria-pressed={selected}
              className={`rounded-lg px-2.5 py-1 text-xs transition ${
                selected
                  ? 'bg-[var(--color-accent)] text-[var(--color-ground)]'
                  : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]'
              }`}
            >
              {artifact.label}
            </button>
          );
        })}
      </div>

      {active.description ? (
        <p className="px-3 pt-2.5 text-xs leading-relaxed text-[var(--color-ink-faint)]">
          {active.description}
        </p>
      ) : null}

      <div className="p-2">
        <iframe
          // Remounting on change avoids showing the previous stage while the
          // next one loads, which reads as a flicker between designs.
          key={active.id}
          title={`${projectName} — ${active.label}`}
          src={active.url}
          sandbox={sandbox}
          loading="lazy"
          className="h-[460px] w-full rounded-lg border border-[var(--color-edge)] bg-white"
        />
      </div>

      <p className="px-3 pb-3 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
        This is the real interface, running. Names and addresses shown inside it are
        placeholders — the original contained colleagues&rsquo; details and was sanitized
        before publication.
      </p>
    </section>
  );
}
