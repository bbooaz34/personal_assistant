/**
 * Visitor session identity (docs/DATA-COLLECTION.md).
 *
 * The id exists to tie a conversation's rows together. It is minted by the
 * browser and therefore untrusted: it identifies a row and grants nothing.
 * Audience is still decided server-side, exactly as it was before this
 * existed — a visitor cannot become a recruiter by editing a request body.
 *
 * Validation here is not about security, then, but about data integrity. An
 * arbitrary client string as a primary key would let one visitor write into
 * another's session, or poison duration metrics with a fabricated timestamp.
 */

import { randomUUID } from 'node:crypto';

export interface VisitorSession {
  id: string;
  startedAt: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A session older than this is treated as a clock problem rather than a very
 * patient visitor. Duration is derived from `startedAt`, so an unbounded value
 * would show up as a single implausible outlier in every average.
 */
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000;

function clampStartedAt(raw: unknown, now: number): string {
  if (typeof raw !== 'string') return new Date(now).toISOString();
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return new Date(now).toISOString();
  // A start in the future or beyond the age ceiling is not usable arithmetic.
  if (parsed > now || parsed < now - MAX_SESSION_AGE_MS) return new Date(now).toISOString();
  return new Date(parsed).toISOString();
}

/**
 * Normalises whatever the client sent into a session that is safe to key rows
 * on. An unusable id becomes a fresh server-minted one rather than an error:
 * losing the thread between turns is a worse outcome than refusing the turn.
 */
export function parseVisitorSession(raw: unknown): VisitorSession {
  const now = Date.now();
  const input = (raw ?? {}) as { id?: unknown; startedAt?: unknown };
  const id =
    typeof input.id === 'string' && UUID_PATTERN.test(input.id)
      ? input.id.toLowerCase()
      : randomUUID();
  return { id, startedAt: clampStartedAt(input.startedAt, now) };
}
