/**
 * Turning a turn into rows (docs/DATA-COLLECTION.md).
 *
 * Kept out of the route so `route.ts` stays what it says it is — a thin carrier
 * between `prepareTurn` and a provider. Nothing here may throw: every function
 * delegates to a `SessionStore`, whose contract is that failures are logged and
 * dropped rather than propagated into a visitor's turn.
 */

import type { SessionStore } from '@par/analytics';
import type { TurnPlan } from '@par/agent';
import type { KnowledgeRepository } from '@par/knowledge';
import { appVersion, configVersion, type RequestProvenance } from './telemetry';

/**
 * The owner-side decision trace.
 *
 * This is the half of the record that makes the dataset diagnostic rather than
 * merely descriptive. A transcript shows that an answer was poor; this shows
 * whether retrieval missed, policy over-refused, or the model had good evidence
 * and phrased it badly — three different fixes.
 */
export function planTrace(plan: TurnPlan): Record<string, unknown> {
  return {
    policyReason: plan.audit.policyReason,
    policyTopic: plan.audit.policyTopic,
    withheldCount: plan.audit.withheldCount,
    shortCircuit: plan.shortCircuit?.reason ?? null,
    injection: {
      detected: plan.injection.detected,
      score: plan.injection.score,
      signals: plan.injection.signals,
    },
    retrieval: {
      empty: plan.bundle.empty,
      projects: plan.bundle.projects.map((p) => p.id),
      skills: plan.bundle.skills.map((s) => s.id),
      factCount: plan.bundle.facts.length,
      sourceCount: plan.bundle.sources.length,
    },
    toolsOffered: plan.tools.map((t) => t.name),
  };
}

/**
 * Creates the session row if it is not already there.
 *
 * Idempotent by way of the store's upsert, so this runs on every turn rather
 * than requiring the route to know whether it is the first one.
 */
export function openSession(
  store: SessionStore,
  args: {
    sessionId: string;
    startedAt: string;
    model: string;
    repository: KnowledgeRepository;
    provenance: RequestProvenance;
    /** How the session opened. A trigger promotes the row to 'mixed' if the other appears. */
    modality?: 'text' | 'voice';
  },
): Promise<void> {
  return store.startSession({
    id: args.sessionId,
    startedAt: args.startedAt,
    modality: args.modality ?? 'text',
    audience: 'public_visitor',
    appVersion: appVersion(),
    // Moves when knowledge is republished, which is the other thing that
    // changes an answer without any code changing.
    knowledgeVersion: args.repository.base.metadata.generated_at,
    promptVersion: configVersion(),
    model: args.model,
    referrerHost: args.provenance.referrerHost,
    country: args.provenance.country,
    deviceClass: args.provenance.deviceClass,
  });
}

/**
 * A voice turn, which reaches us from the browser rather than from a route that
 * produced it. The realtime session runs over WebRTC and the server never sees
 * those messages, so this is the only way they can be recorded at all.
 */
export function recordVoiceTurn(
  store: SessionStore,
  args: { sessionId: string; seq: number; role: 'user' | 'assistant'; text: string },
): Promise<number | null> {
  return store.recordTurn({
    sessionId: args.sessionId,
    seq: args.seq,
    role: args.role,
    content: args.text,
    modality: 'voice',
  });
}

export function recordQuestion(
  store: SessionStore,
  args: { sessionId: string; seq: number; question: string; plan: TurnPlan },
): Promise<number | null> {
  return store.recordTurn({
    sessionId: args.sessionId,
    seq: args.seq,
    role: 'user',
    content: args.question,
    modality: 'text',
    policyTopic: args.plan.audit.policyTopic,
    shortCircuitReason: args.plan.shortCircuit?.reason ?? null,
    injectionDetected: args.plan.injection.detected,
    injectionScore: args.plan.injection.score,
    retrievedProjectIds: args.plan.bundle.projects.map((p) => p.id),
    retrievedSkillIds: args.plan.bundle.skills.map((s) => s.id),
    planTrace: planTrace(args.plan),
  });
}

export function recordAnswer(
  store: SessionStore,
  args: {
    sessionId: string;
    seq: number;
    text: string;
    model: string;
    latencyMs: number;
    inputTokens?: number | null;
    outputTokens?: number | null;
    finishReason?: string | null;
    /** Set when the answer was a fixed refusal rather than a generated one. */
    shortCircuitReason?: 'policy_refusal' | 'injection' | null;
  },
): Promise<number | null> {
  return store.recordTurn({
    sessionId: args.sessionId,
    seq: args.seq,
    role: 'assistant',
    content: args.text,
    modality: 'text',
    model: args.model,
    latencyMs: args.latencyMs,
    inputTokens: args.inputTokens ?? null,
    outputTokens: args.outputTokens ?? null,
    finishReason: args.finishReason ?? null,
    shortCircuitReason: args.shortCircuitReason ?? null,
  });
}
