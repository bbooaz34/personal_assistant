/**
 * The conversation opening (design doc §19, recruiter script v0.1).
 *
 * Returns the staged beats plus the three project peeks selected from
 * evidence. Served rather than hardcoded in the client so the copy stays in
 * `config/identity.config.ts` with the rest of the agent's voice, and so the
 * peeks are chosen by the same policy-filtered knowledge everything else uses.
 */

import { selectOpening } from '@par/identity';
import { PolicyEngine } from '@par/policy';
import { selectProjectPeeks } from '@par/retrieval';
import { identityConfig, privacyConfig } from '@par/config';
import { getAgent } from '@/lib/agent';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const referrer = request.headers.get('referer');
  const campaign = new URL(request.url).searchParams.get('utm_campaign');

  const opening = selectOpening(identityConfig, { referrer, campaign, returning: false });

  const { repository } = await getAgent();
  const policy = new PolicyEngine(privacyConfig);
  // Breadth at session start: one project per discipline, because nothing is
  // known about the visitor yet.
  const peeks = selectProjectPeeks({ repository, policy, audience: 'public_visitor' });

  return Response.json({
    beats: opening.beats,
    afterPeeks: opening.after_peeks,
    starterPrompts: opening.starter_prompts,
    peeks: peeks.cards,
    focus: peeks.focus,
    owner: identityConfig.owner,
    selfReference: identityConfig.self_reference,
  });
}
