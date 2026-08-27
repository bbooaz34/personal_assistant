/**
 * Non-sensitive voice settings the client needs before connecting.
 *
 * Split from the token endpoint on purpose: this is cacheable, safe to fetch
 * on page load, and does not spend a credential just to render a button.
 */

import { voiceConfig, enabledTools } from '@par/config';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return Response.json({
    voice: voiceConfig.voice,
    enabledComponents: [...enabledTools],
  });
}
