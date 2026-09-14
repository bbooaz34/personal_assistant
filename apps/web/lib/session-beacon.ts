/**
 * Client → server reporting for things the server cannot observe itself
 * (docs/DATA-COLLECTION.md).
 *
 * Voice turns and "the visitor opened this" both originate in the browser. The
 * hard part is not sending them, it is sending them from a page that is being
 * closed — which is exactly when the last and most interesting turn happens.
 *
 * `sendBeacon` is the only transport the browser promises to finish after the
 * page goes away, so it is preferred; `fetch(..., { keepalive: true })` is the
 * fallback. Both are fire-and-forget: a failed report must never surface to a
 * visitor, so every path here swallows its errors.
 */

import { getClientSession } from './session-client';

function post(url: string, payload: Record<string, unknown>): void {
  const body = JSON.stringify({ ...payload, session: getClientSession() });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // The type matters: anything else makes this a preflighted request, and a
      // preflight cannot complete during unload.
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Reporting is best-effort by definition.
  }
}

/** One spoken turn. Ordering is settled server-side by `created_at`. */
export function reportVoiceTurn(role: 'user' | 'assistant', text: string, seq: number): void {
  if (!text.trim()) return;
  post('/api/session/turn', { role, text, seq });
}

export function reportEvent(type: string, detail?: Record<string, unknown>): void {
  post('/api/session/event', { type, detail: detail ?? {} });
}
