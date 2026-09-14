/**
 * Scheduled post-session summaries (docs/DATA-COLLECTION.md, Phase 7).
 *
 * Runs on a schedule rather than on a "session ended" signal, because there is
 * no such signal: the ordinary way a conversation ends is a closed tab. Idle
 * time is the only honest indicator, so a session is summarized once it has
 * been quiet for a while.
 *
 * Batched and capped. A backlog drains over several runs instead of one
 * invocation trying to summarize everything and timing out partway, which
 * would leave the same work undone every time.
 */

import '@/lib/env';
import { agentConfig } from '@par/config';
import { getSessionStore } from '@/lib/session-store';
import { hasCredentials } from '@/lib/model';
import { summarizeSession } from '@/lib/summarize';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Quiet for this long and the conversation is treated as over. */
const IDLE_MINUTES = 30;

/** Per run. Keeps one invocation inside its time budget. */
const BATCH = 10;

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
    return Response.json({ summarized: 0, reason: 'no store configured' });
  }
  if (!hasCredentials(agentConfig.model)) {
    // Without a key the sessions stay queued rather than being marked done,
    // so nothing is lost by returning early.
    return Response.json({ summarized: 0, reason: 'no model credentials' }, { status: 503 });
  }

  const sessions = await store.findSessionsToSummarize(IDLE_MINUTES, BATCH);

  // Sequential on purpose: this is a background job with no one waiting, and
  // ten concurrent model calls is a good way to meet a rate limit.
  const outcomes = [];
  for (const session of sessions) {
    outcomes.push(await summarizeSession(store, session));
  }

  const counts = {
    summarized: outcomes.filter((o) => o.status === 'summarized').length,
    skipped: outcomes.filter((o) => o.status === 'skipped_too_short').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
  };
  console.info(
    `[summary] ${counts.summarized} summarized, ${counts.skipped} skipped, ${counts.failed} failed`,
  );
  return Response.json({ considered: sessions.length, ...counts });
}
