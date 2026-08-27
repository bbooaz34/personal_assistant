/**
 * Re-selects the project peeks once the visitor reveals what they are hiring for.
 *
 * Session start shows breadth — one project per discipline. The moment a role
 * is named, the spread is the wrong answer: a Senior Product Designer should
 * see product work, not one card of each. This endpoint detects the emphasis
 * and returns the re-selection, or `focus: null` when nothing recognisable was
 * said, in which case the caller leaves the existing cards alone.
 */

import { PolicyEngine } from '@par/policy';
import { selectProjectPeeks } from '@par/retrieval';
import { privacyConfig } from '@par/config';
import { getAgent } from '@/lib/agent';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === 'string' ? body.text.slice(0, 2000) : '';

  if (!text.trim()) {
    return Response.json({ cards: [], focus: null });
  }

  const { repository } = await getAgent();
  const policy = new PolicyEngine(privacyConfig);
  const selection = selectProjectPeeks({
    repository,
    policy,
    audience: 'public_visitor',
    intentText: text,
  });

  // No recognised emphasis: say so rather than returning a fresh breadth set,
  // which would make the rail churn on every unrelated message.
  if (!selection.focus) return Response.json({ cards: [], focus: null });

  return Response.json({ cards: selection.cards, focus: selection.focus });
}
