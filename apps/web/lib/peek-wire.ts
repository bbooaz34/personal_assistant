/**
 * Turns a selected peek into the shape the client renders.
 *
 * `selectProjectPeeks` decides *what* a card should show; only the web app
 * knows *where* it is served from, so the address is assembled here — the same
 * split the portfolio route already makes for its artifacts. Keeping it in one
 * function means the opening and the re-selection cannot drift into serving
 * two different URLs for the same artifact.
 */

import type { PeekCard } from '@par/retrieval';
import { uiConfig } from '@par/config';

export interface WirePeekCard extends Omit<PeekCard, 'preview'> {
  preview: { url: string; viewport: 'mobile' | 'desktop'; label: string; external: boolean } | null;
}

export function toWirePeek(card: PeekCard): WirePeekCard {
  const { preview, ...rest } = card;
  if (!preview) return { ...rest, preview: null };

  return {
    ...rest,
    preview: {
      url:
        preview.kind === 'artifact'
          ? `${uiConfig.artifactOrigin}/api/artifact/${preview.path}`
          : preview.path,
      viewport: preview.viewport,
      label: preview.label,
      // The client frames a site it does not control more cautiously than one
      // of ours: no same-origin grant, and a visible attribution.
      external: preview.kind === 'external',
    },
  };
}
