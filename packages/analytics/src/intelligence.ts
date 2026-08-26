/**
 * Post-session intelligence (design doc §31, §32).
 *
 * Runs privately, after the conversation, for the portfolio owner. The
 * critical property is the separation between what the recruiter actually said
 * and what a model inferred from it — an owner acting on "they seemed worried
 * about SaaS depth" needs to know whether that was stated or guessed.
 */

import type { SessionState } from './session.js';

export interface StatedFact {
  field: string;
  value: string;
  /** Verbatim, so the owner can judge it themselves. */
  quote?: string;
}

export interface Interpretation {
  claim: string;
  /** 0–1. An inference the model is unsure of should read as one. */
  confidence: number;
  basis: string;
}

export interface SessionSummary {
  sessionId: string;
  generatedAt: string;
  durationSeconds: number;
  language: string | null;

  /** Things the visitor said outright. */
  stated: StatedFact[];
  /** Things the model concluded. Never merged into `stated`. */
  interpreted: Interpretation[];

  role: string | null;
  company: string | null;
  mainInterests: string[];
  possibleConcerns: string[];
  projectsShown: string[];
  projectsThatResonated: string[];
  questionsAsked: string[];
  /** Questions the agent could not answer — the owner's knowledge-gap backlog. */
  unanswered: string[];
  policyRefusals: number;
  injectionAttempts: number;
  recommendedFollowUp: string | null;
}

/**
 * The deterministic half of the summary: counts, durations, and what actually
 * happened. Computed from events rather than asked of a model, because a model
 * summarising its own session is the wrong tool for arithmetic.
 */
export function computeSessionMetrics(state: SessionState, now: string): Pick<
  SessionSummary,
  | 'sessionId' | 'generatedAt' | 'durationSeconds' | 'language' | 'role' | 'company'
  | 'projectsShown' | 'projectsThatResonated' | 'questionsAsked' | 'unanswered'
  | 'policyRefusals' | 'injectionAttempts'
> {
  const start = Date.parse(state.startedAt);
  const end = Date.parse(state.lastActivityAt);
  const durationSeconds = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.round((end - start) / 1000))
    : 0;

  return {
    sessionId: state.id,
    generatedAt: now,
    durationSeconds,
    language: state.language,
    role: state.recruiter.role,
    company: state.recruiter.company,
    projectsShown: state.projectsShown,
    // Opening a project is a deliberate act; being shown one is not. Only the
    // former is evidence of interest.
    projectsThatResonated: state.projectsOpened,
    questionsAsked: state.questionsAsked,
    unanswered: state.unknowns,
    policyRefusals: state.events.filter((e) => e.type === 'policy_refusal').length,
    injectionAttempts: state.events.filter((e) => e.type === 'injection_flagged').length,
  };
}

/**
 * Instructions for the private summarization pass. Kept here rather than in the
 * agent package because this prompt never touches a visitor-facing turn.
 */
export const SUMMARY_INSTRUCTIONS = `
You are producing a private post-session summary for the portfolio owner. The visitor will never see this.

Rules:
- Separate what the visitor stated from what you inferred. Put stated things in "stated" with a quote where possible; put conclusions in "interpreted" with a confidence and the basis for it.
- Do not present an inference as a fact. If you are guessing at their concern, say so and score it honestly.
- Note every question the agent could not answer. Those are the owner's knowledge gaps and they are the most actionable part of this summary.
- Recommend one concrete follow-up, or null if there is nothing worth recommending.
- Be brief. The owner is scanning, not reading.
`.trim();
