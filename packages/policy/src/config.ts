/**
 * Policy configuration types (design doc §25, §27).
 *
 * Rules live in data, not in a system prompt. The model never decides what it
 * is allowed to know — by the time a turn reaches it, the disallowed material
 * was never retrieved.
 */

import type { Visibility } from '@par/knowledge';

/** Who is on the other side of the conversation. */
export type Audience = 'public_visitor' | 'verified_recruiter' | 'owner';

export type TopicAccess =
  /** Anyone may receive this. */
  | 'public'
  /** Released only when a rule explicitly grants it to this audience. */
  | 'restricted'
  /** Released only after the owner grants permission for this session. */
  | 'explicit_permission'
  /** Never released to anyone but the owner, under any framing. */
  | 'never';

export interface TopicRule {
  /** Stable identifier, e.g. `salary`. */
  topic: string;
  access: TopicAccess;
  /**
   * Lowercase substrings and phrases that indicate a question is about this
   * topic. Matching is deliberately broad: over-refusing a compensation
   * question is a far cheaper mistake than answering one.
   */
  matches: string[];
  /** What the agent says instead. Keeps refusals consistent and non-defensive. */
  refusal?: string;
}

export interface PolicyConfig {
  /** Maximum visibility class each audience may ever reach. */
  maxVisibility: Record<Audience, Visibility>;
  topics: TopicRule[];
  /**
   * Verification statuses that may be presented to a visitor. Keeping
   * `rejected` out of retrieval matters more than it sounds: a rejected claim
   * is one someone already decided was wrong.
   */
  presentableVerificationStatuses: Array<'verified' | 'needs_verification' | 'conflicted'>;
  /** Whether unverified claims may be shown at all, and how they must be framed. */
  unverifiedClaimHandling: 'hide' | 'label' | 'allow';
}
