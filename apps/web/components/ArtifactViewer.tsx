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
/** Mobile artifacts get a phone, not a letterboxed desktop. */
const MOBILE_VIEWPORT = { width: 375, height: 812 };

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

  // Restarting is a remount: the nonce joins the iframe key, so the prototype
  // reboots at its first screen instead of wherever the visitor wandered to.
  const [reloadNonce, setReloadNonce] = useState(0);

  // Expanded: measure the frame and scale the artifact's own viewport to it —
  // a phone-portrait box for mobile artifacts, the stage's width for desktop.
  const viewport = active?.viewport === 'mobile' ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    if (!expanded) return;
    const el = stageRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / viewport.width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, viewport.width, active?.id]);

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
        <button
          type="button"
          onClick={() => setReloadNonce((n) => n + 1)}
          aria-label="Restart the prototype from its first screen"
          title="Restart"
          className="ms-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-[var(--color-ink-muted)] transition hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          restart
        </button>
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
            className={`relative overflow-hidden border border-[var(--color-edge)] bg-white ${
              active.viewport === 'mobile' ? 'mx-auto rounded-[26px]' : 'rounded-lg'
            }`}
            style={
              active.viewport === 'mobile'
                ? { height: 'min(72vh, 760px)', aspectRatio: `${viewport.width} / ${viewport.height}` }
                : { height: Math.round(viewport.height * (scale || 0.5)) }
            }
          >
            <iframe
              // Remounting on change avoids showing the previous stage while
              // the next one loads, which reads as a flicker between designs.
              // Absolutely anchored: in this RTL document the unscaled frame
              // would otherwise lay out flush right and clip once scaled.
              key={`${active.id}-${reloadNonce}`}
              title={`${projectName} — ${active.label}`}
              src={active.url}
              sandbox={sandbox}
              loading="lazy"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: viewport.width,
                height: viewport.height,
                transform: `scale(${scale || 0.5})`,
                transformOrigin: 'top left',
                border: 0,
              }}
              className="bg-white"
            />
          </div>
        ) : (
          <iframe
            key={`${active.id}-${reloadNonce}`}
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
