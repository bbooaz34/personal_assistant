/**
 * The post-session summary pass (design doc §31, §32; Phase 7).
 *
 * Two halves, deliberately kept apart:
 *
 *   - What happened is *computed*. Durations, refusal counts, which projects
 *     were shown versus opened — all derived from stored rows by
 *     `computeSessionMetrics`. A model summarising its own session is the wrong
 *     tool for arithmetic, and asking it to count is how a summary ends up
 *     confidently wrong about something checkable.
 *   - What it meant is *inferred*, by a model, and every inference carries a
 *     confidence and its basis. `stated` and `interpreted` never merge: an
 *     owner acting on "they seemed worried about SaaS depth" has to know
 *     whether the visitor said that or a model guessed it.
 *
 * This runs privately, long after the visitor has gone. Nothing it produces is
 * ever shown to them.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import {
  applyUpdate,
  computeSessionMetrics,
  createSession,
  recordEvent,
  SUMMARY_INSTRUCTIONS,
  type SessionState,
  type SessionStore,
  type StoredEvent,
  type StoredTurn,
} from '@par/analytics';
import { agentConfig } from '@par/config';
import { resolveModel } from './model';

/** Enough of a conversation to be worth reading. One stray turn is not. */
const MIN_TURNS = 2;

const InferenceSchema = z.object({
  stated: z
    .array(
      z.object({
        field: z.string().describe('what this tells you, e.g. role, company, hiring need'),
        value: z.string(),
        quote: z.string().optional().describe('the visitor’s own words, where they exist'),
      }),
    )
    .describe('Only things the visitor said outright.'),
  interpreted: z
    .array(
      z.object({
        claim: z.string(),
        confidence: z.number().min(0).max(1),
        basis: z.string().describe('what in the conversation supports this'),
      }),
    )
    .describe('Conclusions drawn. Never things the visitor stated.'),
  role: z.string().nullable(),
  company: z.string().nullable(),
  mainInterests: z.array(z.string()),
  possibleConcerns: z.array(z.string()),
  unanswered: z
    .array(z.string())
    .describe('Questions the agent could not answer. The most actionable part of this.'),
  recommendedFollowUp: z.string().nullable(),
});

/**
 * Rebuilds the session state the metrics function expects from stored rows.
 *
 * Reusing `computeSessionMetrics` rather than recomputing here means the
 * counting rules live in one place — including the distinction it draws
 * between a project being shown and a visitor choosing to open one.
 */
function replay(
  sessionId: string,
  startedAt: string,
  lastActivityAt: string,
  language: string | null,
  turns: StoredTurn[],
  events: StoredEvent[],
): SessionState {
  let state = createSession(sessionId, startedAt);
  state = { ...state, lastActivityAt, language };

  const questions = turns.filter((t) => t.role === 'user').map((t) => t.content);
  const shown = new Set<string>();
  const opened = new Set<string>();

  for (const event of events) {
    const projectId = typeof event.detail.project_id === 'string' ? event.detail.project_id : null;
    if (event.type === 'component_rendered') {
      const args = event.detail.args as Record<string, unknown> | undefined;
      const fromArgs = typeof args?.project_id === 'string' ? args.project_id : null;
      if (fromArgs) shown.add(fromArgs);
    }
    if (event.type === 'project_opened' && projectId) opened.add(projectId);

    if (event.type === 'policy_refusal' || event.type === 'injection_flagged') {
      state = recordEvent(state, {
        type: event.type === 'injection_flagged' ? 'injection_flagged' : 'policy_refusal',
        at: event.createdAt,
        detail: event.detail,
      });
    }
  }

  for (const question of questions) {
    state = applyUpdate(state, { questionAsked: question }, lastActivityAt);
  }
  state = applyUpdate(
    state,
    { projectsShown: [...shown], projectsOpened: [...opened] },
    lastActivityAt,
  );
  // `applyUpdate` moves `lastActivityAt` forward; duration is measured from the
  // real end of the conversation, not from when this pass happened to run.
  return { ...state, lastActivityAt };
}

function transcriptFor(turns: StoredTurn[]): string {
  return turns
    .map((t) => `${t.role === 'user' ? 'Visitor' : 'Agent'}: ${t.content}`)
    .join('\n\n')
    .slice(0, 24_000);
}

export interface SummarizeOutcome {
  sessionId: string;
  status: 'summarized' | 'skipped_too_short' | 'failed';
}

/**
 * Summarizes one session and marks it done.
 *
 * The session is marked only on success, so a model outage leaves it queued for
 * the next pass rather than silently losing it.
 */
export async function summarizeSession(
  store: SessionStore,
  session: { id: string; startedAt: string; lastActivityAt: string; language: string | null },
): Promise<SummarizeOutcome> {
  const [turns, events] = await Promise.all([
    store.loadTurns(session.id),
    store.loadEvents(session.id),
  ]);

  if (turns.length < MIN_TURNS) {
    // Nothing to learn from, but it must leave the queue or it is reconsidered
    // on every run forever.
    await store.markSummarized(session.id, new Date().toISOString());
    return { sessionId: session.id, status: 'skipped_too_short' };
  }

  const state = replay(
    session.id,
    session.startedAt,
    session.lastActivityAt,
    session.language,
    turns,
    events,
  );
  const metrics = computeSessionMetrics(state, new Date().toISOString());

  try {
    // Which questions were refused is a fact we hold, not a judgment to
    // delegate. Handing over the exact list beats asking the model to work out
    // which of its own non-answers were deliberate.
    const refused = turns
      .filter((t) => t.role === 'user' && t.shortCircuitReason)
      .map((t) => `- ${t.content}`)
      .join('\n');

    const { object } = await generateObject({
      model: resolveModel(agentConfig.model),
      schema: InferenceSchema,
      system: SUMMARY_INSTRUCTIONS,
      prompt:
        `Conversation transcript:\n\n${transcriptFor(turns)}` +
        (refused
          ? `\n\nDeclined on purpose by policy — these are not knowledge gaps, ` +
            `leave them out of "unanswered":\n${refused}`
          : ''),
      // The judgment here is about evidence, not phrasing. Sampling variance
      // would show up as a different read of the same conversation.
      temperature: 0,
    });

    await store.saveSummary({
      sessionId: session.id,
      model: agentConfig.model.model,
      stated: object.stated,
      interpreted: object.interpreted,
      // The model's read of who they were, but the counts stay computed.
      role: object.role ?? metrics.role,
      company: object.company ?? metrics.company,
      mainInterests: object.mainInterests,
      possibleConcerns: object.possibleConcerns,
      projectsShown: metrics.projectsShown,
      projectsResonated: metrics.projectsThatResonated,
      unanswered: object.unanswered,
      durationSeconds: metrics.durationSeconds,
      policyRefusals: metrics.policyRefusals,
      injectionAttempts: metrics.injectionAttempts,
      recommendedFollowUp: object.recommendedFollowUp,
    });
    await store.markSummarized(session.id, new Date().toISOString());
    return { sessionId: session.id, status: 'summarized' };
  } catch (error) {
    console.warn(`[summary] ${session.id} failed: ${String(error)}`);
    return { sessionId: session.id, status: 'failed' };
  }
}
