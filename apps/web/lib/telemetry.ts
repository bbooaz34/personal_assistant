/**
 * Version stamps and coarse request provenance (docs/DATA-COLLECTION.md).
 *
 * The stamps are the reason the conversation data can answer "did that change
 * help" rather than only "what happened". They are deliberately derived from
 * things that actually move — a deploy, a knowledge publish, a config edit —
 * and are null when nothing real is available, because a stamp that never
 * changes is worse than an absent one: it makes two different systems look
 * like the same one.
 */

import { createHash } from 'node:crypto';
import { agentConfig } from '@par/config';

/**
 * The deploy. Vercel sets this; locally there is no meaningful build identity,
 * so it stays null rather than pretending `0.1.0` distinguishes anything.
 */
export function appVersion(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null;
}

/**
 * A short digest of the agent configuration — model, temperature, enabled
 * tools, persona, policy rules. This is what actually changes when the agent is
 * tuned, and it changes exactly when the answers might. Computed once: the
 * config is frozen for the life of the process.
 */
let cachedConfigVersion: string | null = null;
export function configVersion(): string {
  cachedConfigVersion ??= createHash('sha256')
    .update(JSON.stringify(agentConfig))
    .digest('hex')
    .slice(0, 12);
  return cachedConfigVersion;
}

/**
 * Coarse provenance from request headers.
 *
 * What is deliberately absent: the IP address and the raw user-agent. Either
 * would turn an anonymous session into a fingerprint, which is the property
 * the whole collection posture rests on. The user-agent is read, reduced to one
 * of three values, and discarded.
 */
export interface RequestProvenance {
  referrerHost: string | null;
  country: string | null;
  deviceClass: 'mobile' | 'tablet' | 'desktop' | null;
}

function deviceClass(userAgent: string | null): RequestProvenance['deviceClass'] {
  if (!userAgent) return null;
  if (/\biPad\b|\bTablet\b|\bPlayBook\b|\bSilk\b|Android(?!.*Mobile)/i.test(userAgent)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod|IEMobile|Opera Mini/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

export function readProvenance(request: Request): RequestProvenance {
  const headers = request.headers;

  let referrerHost: string | null = null;
  const referer = headers.get('referer');
  if (referer) {
    try {
      // Host only: a full referrer URL can carry a query string, and query
      // strings are where third-party sites put identifiers.
      referrerHost = new URL(referer).host || null;
    } catch {
      referrerHost = null;
    }
  }

  return {
    referrerHost,
    // Set by Vercel's edge network; absent locally and on other hosts.
    country: headers.get('x-vercel-ip-country'),
    deviceClass: deviceClass(headers.get('user-agent')),
  };
}
