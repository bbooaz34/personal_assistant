/**
 * The conversation opening (design doc §19, recruiter script v0.2).
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
import { toWirePeek } from '@/lib/peek-wire';
import { getSessionStore } from '@/lib/session-store';

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
    starterPrompts: opening.starter_prompts,
    // Optional: the stretch of the script the orb spends as a crystal ball.
    projection: opening.projection ?? null,
    peeks: peeks.cards.map(toWirePeek),
    focus: peeks.focus,
    owner: identityConfig.owner,
    agentName: identityConfig.name,
    selfReference: identityConfig.self_reference,
    // Drives the entry-screen notice. Sent from the server because the client
    // cannot know whether a store is configured — and a page that claims to be
    // recording when it is not is its own kind of dishonesty.
    recording: getSessionStore().enabled,
  });
}
