/**
 * Scheduled retention purge (docs/DATA-COLLECTION.md).
 *
 * The primary schedule is pg_cron, installed by the retention migration. This
 * route exists because pg_cron is not available on every Supabase plan, and
 * "raw transcripts are deleted after 30 days" is a promise made to visitors on
 * the entry screen — it should not quietly depend on one extension being
 * enabled. Running both is harmless: the second pass finds nothing left.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations.
 * Without the secret set the route refuses outright rather than defaulting to
 * open, because an unauthenticated endpoint that deletes rows is worse than no
 * fallback at all.
 */

import '@/lib/env';
import { getSessionStore } from '@/lib/session-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const store = getSessionStore();
  if (!store.enabled) {
    return Response.json({ purged: false, reason: 'no store configured' });
  }

  const result = await store.purgeExpired();
  if (!result) {
    // The store logs the cause. Reporting failure matters: a purge that
    // silently does nothing is how a retention promise quietly stops being true.
    return Response.json({ purged: false, reason: 'purge failed' }, { status: 500 });
  }

  console.info(
    `[retention] purged ${result.turnsDeleted} turns and ${result.eventsDeleted} events`,
  );
  return Response.json({ purged: true, ...result });
}
