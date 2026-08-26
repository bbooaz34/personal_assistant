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

export const uiConfig = {
  enabledTools,
  allowedEmbedOrigins,
  /** Sandbox attributes applied to every external embed. */
  embedSandbox: 'allow-scripts allow-same-origin allow-popups-to-escape-sandbox',
} as const;
