/**
 * Conversation openings (design doc §19).
 *
 * The first fifteen seconds have to explain a new interaction model. "How can
 * I help you?" spends that budget on nothing.
 */

import type { AgentIdentity, Opening } from './types.js';

export interface OpeningContext {
  /** Where the visitor came from, when known. */
  referrer?: string | null;
  campaign?: string | null;
  returning?: boolean;
}

const RECRUITER_REFERRERS = ['linkedin', 'greenhouse', 'lever', 'workable', 'ashby', 'comeet'];

export function selectOpening(identity: AgentIdentity, context: OpeningContext = {}): Opening {
  const variants = identity.openings.variants;
  const byWhen = (when: Opening['when']) => variants.find((v) => v.when === when);

  if (context.returning) {
    const returning = byWhen('returning');
    if (returning) return returning;
  }

  const referrer = (context.referrer ?? '').toLowerCase();
  if (RECRUITER_REFERRERS.some((r) => referrer.includes(r)) || context.campaign) {
    const recruiter = byWhen('recruiter');
    if (recruiter) return recruiter;
  }

  const fallback = byWhen('default') ?? variants[0];
  if (!fallback) {
    throw new Error('Agent identity defines no opening variants.');
  }
  return fallback;
}
