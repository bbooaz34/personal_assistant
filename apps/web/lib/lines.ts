/**
 * Lines the app itself authors and may speak aloud.
 *
 * Shared deliberately. `/api/speech` will only synthesize text the server
 * wrote, which is what stops it being an open text-to-speech proxy billed to
 * the owner's key — so a line the client wants spoken has to be a line the
 * server already knows. One constant, imported by both.
 */

/** Said when the evidence stage opens. Checkable by clicking, which is the point. */
export const LIVE_ASSET_LINE =
  'Everything here is generated in real time from code. It is not an image, and it is not an ' +
  'external viewer. You can click it, scroll it, and use it like the real thing.';

export const APP_SPOKEN_LINES: readonly string[] = [LIVE_ASSET_LINE];
