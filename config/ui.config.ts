/**
 * Which generative-UI components this deployment exposes (design doc §8).
 *
 * Enabling a component is a promise that it renders well with the content that
 * actually exists. `show_prototype` stays off until a prototype is hosted and
 * sandboxed — an approved tool that resolves to nothing is worse than a tool
 * the model never reaches for.
 */

import type { UIToolName } from '@par/ui';

export const enabledTools: UIToolName[] = [
  'show_project',
  'show_gallery',
  'show_timeline',
  'show_skill_map',
  'show_cv_section',
  'show_process',
  'show_transformation',
  'show_artifact',
  'compare_projects',
  // Enable once media and hosting are in place (Phase 3):
  // 'show_video',
  // 'show_prototype',
];

/** Hosts permitted to be framed for interactive prototypes (§9). */
export const allowedEmbedOrigins: string[] = [
  'https://www.figma.com',
  'https://embed.figma.com',
];

/**
 * Origin that serves embedded artifacts.
 *
 * **Why this exists.** Artifacts need `allow-same-origin` to run — their
 * runtime touches storage, which throws in an opaque origin and leaves the
 * frame blank. But `allow-scripts` plus `allow-same-origin` on a *same-origin*
 * document is not a sandbox at all: the framed page can reach the parent and
 * remove its own restrictions.
 *
 * Two things make that acceptable here, and both must stay true:
 *
 *   1. Artifacts are first-party. They are committed files that went through
 *      `scripts/import-artifacts.ts`, not anything a visitor can supply. If
 *      that ever changes, this decision has to change with it.
 *   2. In production, set `ARTIFACT_ORIGIN` to a separate host (or a distinct
 *      subdomain). `allow-same-origin` then refers to *that* origin, so the
 *      artifact is genuinely isolated from the app — the "controlled hosting"
 *      the design doc calls for.
 *
 * Left empty, artifacts are served from the app's own origin, which is fine
 * for local development and for a deployment serving only reviewed content.
 */
export const artifactOrigin: string = process.env.ARTIFACT_ORIGIN ?? '';

export const uiConfig = {
  enabledTools,
  allowedEmbedOrigins,
  artifactOrigin,
  /**
   * Sandbox applied to every embedded artifact.
   *
   * `allow-popups-to-escape-sandbox` is deliberately absent — a popup from an
   * artifact should inherit the restrictions, not shed them.
   */
  embedSandbox: 'allow-scripts allow-same-origin allow-popups allow-forms',
} as const;
