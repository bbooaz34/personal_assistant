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
 *
 * Responsive rule (applies to every project's generative UI): inline, the
 * chat column is phone-width, so the artifact gets a phone-portrait viewport
 * and renders its mobile layout; the expanded stage is desktop-width, so the
 * same artifact reflows into its desktop layout with more height to use.
 */

import { useEffect, useRef, useState } from 'react';
import type { ProjectArtifact } from './portfolio-types';

/**
 * The artifact's expanded viewport is a real desktop, rendered at full size
 * and scaled down to whatever width the stage actually has — so the visitor
 * sees the desktop layout in its true proportions instead of a squeezed one.
 */
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

export function ArtifactViewer({
  projectName,
  artifacts,
  initialArtifactId,
  sandbox,
  expanded = false,
}: {
  projectName: string;
  artifacts: ProjectArtifact[];
  initialArtifactId?: string;
  sandbox: string;
  expanded?: boolean;
}) {
  const initial =
    artifacts.find((a) => a.id === initialArtifactId) ?? artifacts[0];
  const [activeId, setActiveId] = useState(initial?.id);
  const active = artifacts.find((a) => a.id === activeId) ?? initial;

  // Expanded: measure the stage and scale the fixed desktop viewport to it.
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    if (!expanded) return;
    const el = stageRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / DESKTOP_VIEWPORT.width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);

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
        {expanded ? (
          <div
            ref={stageRef}
            className="overflow-hidden rounded-lg border border-[var(--color-edge)] bg-white"
            style={{ height: Math.round(DESKTOP_VIEWPORT.height * (scale || 0.5)) }}
          >
            <iframe
              // Remounting on change avoids showing the previous stage while
              // the next one loads, which reads as a flicker between designs.
              key={active.id}
              title={`${projectName} — ${active.label}`}
              src={active.url}
              sandbox={sandbox}
              loading="lazy"
              style={{
                width: DESKTOP_VIEWPORT.width,
                height: DESKTOP_VIEWPORT.height,
                transform: `scale(${scale || 0.5})`,
                transformOrigin: 'top left',
                border: 0,
              }}
              className="bg-white"
            />
          </div>
        ) : (
          <iframe
            key={active.id}
            title={`${projectName} — ${active.label}`}
            src={active.url}
            sandbox={sandbox}
            loading="lazy"
            className="h-[520px] w-full rounded-lg border border-[var(--color-edge)] bg-white"
          />
        )}
      </div>

      <p className="px-3 pb-3 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
        This is the real interface, running. Names and addresses shown inside it are
        placeholders — the original contained colleagues&rsquo; details and was sanitized
        before publication.
      </p>
    </section>
  );
}
