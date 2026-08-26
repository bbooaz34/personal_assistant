/**
 * The conversation opening (design doc §19).
 *
 * Served rather than hardcoded in the client so the variant can be chosen from
 * referrer or campaign, and so the copy stays in `config/identity.config.ts`
 * with the rest of the agent's voice.
 */

import { selectOpening } from '@par/identity';
import { identityConfig } from '@par/config';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const referrer = request.headers.get('referer');
  const campaign = new URL(request.url).searchParams.get('utm_campaign');

  const opening = selectOpening(identityConfig, { referrer, campaign, returning: false });

  return Response.json({
    text: opening.text,
    starterPrompts: opening.starter_prompts,
    owner: identityConfig.owner,
    selfReference: identityConfig.self_reference,
  });
}
