/**
 * Voice turn persistence (docs/DATA-COLLECTION.md, roadmap item #4).
 *
 * A realtime session runs in the browser over WebRTC, so unlike text there is
 * no server hop that sees the conversation. Without this endpoint the voice
 * half of the product is invisible to every question the data is meant to
 * answer.
 *
 * This is an unauthenticated write, so it is bounded rather than trusted:
 * the session id is validated, the role must be one of two values, and the
 * text is capped. It can only append rows to a table that is purged on a
 * schedule — there is nothing here to read back or escalate into.
 */

import '@/lib/env';
import { agentConfig } from '@par/config';
import { getAgent } from '@/lib/agent';
import { parseVisitorSession } from '@/lib/session';
import { getSessionStore } from '@/lib/session-store';
import { openSession, recordVoiceTurn } from '@/lib/conversation-log';
import { readProvenance } from '@/lib/telemetry';

export const runtime = 'nodejs';

/** A spoken turn is short. Anything longer is a transcript run together, or noise. */
const MAX_TEXT = 4000;

interface TurnRequest {
  session?: unknown;
  role?: unknown;
  text?: unknown;
  seq?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as TurnRequest;

  const role = body.role === 'user' || body.role === 'assistant' ? body.role : null;
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  if (!role || !text) return new Response(null, { status: 204 });

  const store = getSessionStore();
  // Nothing configured: accept and discard, so the client needs no knowledge of
  // whether persistence exists.
  if (!store.enabled) return new Response(null, { status: 204 });

  const visitor = parseVisitorSession(body.session);
  const seq = Number.isFinite(body.seq) ? Math.max(0, Math.trunc(body.seq as number)) : 0;

  const { repository } = await getAgent();
  await openSession(store, {
    sessionId: visitor.id,
    startedAt: visitor.startedAt,
    model: agentConfig.model.model,
    repository,
    provenance: readProvenance(request),
    modality: 'voice',
  });
  await recordVoiceTurn(store, { sessionId: visitor.id, seq, role, text });

  return new Response(null, { status: 204 });
}
