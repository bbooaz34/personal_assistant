/**
 * Interaction events from the browser (docs/DATA-COLLECTION.md).
 *
 * Only the events the server cannot see itself arrive here — chiefly what the
 * visitor chose to open. `component_rendered`, `policy_refusal` and
 * `injection_flagged` are all recorded server-side where they actually happen,
 * because an event the client is trusted to report is an event a client can
 * decline to report.
 *
 * The type is accepted as free text to match `events.type` in the schema: a
 * closed list here would silently drop telemetry the day a new event is added
 * to the union. It is length-capped instead.
 */

import '@/lib/env';
import { agentConfig } from '@par/config';
import { getAgent } from '@/lib/agent';
import { parseVisitorSession } from '@/lib/session';
import { getSessionStore } from '@/lib/session-store';
import { openSession } from '@/lib/conversation-log';
import { readProvenance } from '@/lib/telemetry';

export const runtime = 'nodejs';

const MAX_TYPE = 64;
const MAX_DETAIL_BYTES = 4000;

interface EventRequest {
  session?: unknown;
  type?: unknown;
  detail?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as EventRequest;

  const type = typeof body.type === 'string' ? body.type.trim().slice(0, MAX_TYPE) : '';
  if (!type) return new Response(null, { status: 204 });

  const store = getSessionStore();
  if (!store.enabled) return new Response(null, { status: 204 });

  // A detail blob is visitor-influenced, so it is bounded before it is stored.
  let detail: Record<string, unknown> = {};
  if (body.detail && typeof body.detail === 'object' && !Array.isArray(body.detail)) {
    const candidate = body.detail as Record<string, unknown>;
    if (JSON.stringify(candidate).length <= MAX_DETAIL_BYTES) detail = candidate;
  }

  const visitor = parseVisitorSession(body.session);
  const { repository } = await getAgent();

  await openSession(store, {
    sessionId: visitor.id,
    startedAt: visitor.startedAt,
    model: agentConfig.model.model,
    repository,
    provenance: readProvenance(request),
  });
  await store.recordEvent({ sessionId: visitor.id, type, detail });

  return new Response(null, { status: 204 });
}
