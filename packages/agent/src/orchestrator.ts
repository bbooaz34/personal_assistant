/**
 * The turn pipeline (design doc §26).
 *
 *   input → injection assessment → policy → authorized retrieval → prompt → model
 *
 * `prepareTurn` performs every step up to the model call and returns a plan.
 * It deliberately does not call a model: keeping the decision-making here and
 * the transport in the app means provider changes, streaming details, and
 * framework upgrades never touch the logic that decides what may be said.
 */

import type { KnowledgeRepository } from '@par/knowledge';
import { PolicyEngine, assessInjection, injectionResponse, type InjectionAssessment } from '@par/policy';
import { RetrievalEngine, type EvidenceBundle } from '@par/retrieval';
import { buildSystemPrompt, type EvidenceItemView } from '@par/identity';
import { resolveToolCall, type ResolutionResult, type ToolCall } from '@par/ui';
import { mayAskQuestion, type SessionState } from '@par/analytics';
import type { AgentConfig } from './config.js';
import { toolSchemas, type ToolSchema } from './tools.js';

export interface TurnInput {
  message: string;
  session: SessionState;
  audience?: 'public_visitor' | 'verified_recruiter' | 'owner';
}

export interface TurnPlan {
  /** When set, the turn ends here — no model call. */
  shortCircuit?: { reason: 'policy_refusal' | 'injection'; response: string };
  systemPrompt: string;
  tools: ToolSchema[];
  bundle: EvidenceBundle;
  injection: InjectionAssessment;
  /** Ids the model may legally reference in tool calls this turn. */
  allowedProjectIds: Set<string>;
  allowedSkillIds: Set<string>;
  /** Owner-side trace of what policy withheld. Never sent to the visitor. */
  audit: { withheldCount: number; policyReason: string };
}

export class Agent {
  private readonly policy: PolicyEngine;
  private readonly retrieval: RetrievalEngine;

  constructor(
    private readonly config: AgentConfig,
    private readonly repository: KnowledgeRepository,
  ) {
    this.policy = new PolicyEngine(config.policy);
    this.retrieval = new RetrievalEngine(repository, this.policy, {
      ...(config.retrieval?.weights ? { weights: config.retrieval.weights } : {}),
      ...(config.retrieval?.limit !== undefined ? { defaultLimit: config.retrieval.limit } : {}),
      ...(config.retrieval?.relevanceFloor !== undefined
        ? { relevanceFloor: config.retrieval.relevanceFloor }
        : {}),
    });
  }

  get policyEngine(): PolicyEngine {
    return this.policy;
  }

  async prepareTurn(input: TurnInput): Promise<TurnPlan> {
    const audience = input.audience ?? 'public_visitor';
    const injection = assessInjection(input.message);

    // 1. Policy on the question itself. A closed topic never becomes a
    //    retrieval, so the model is never in a position to leak it.
    const decision = this.policy.evaluateQuestion(input.message, audience);

    // 2. Retrieval, already narrowed to this audience by the policy engine.
    //    Runs even on a refusal so the agent can offer a real alternative
    //    instead of a dead end.
    const bundle = await this.retrieval.retrieve({
      question: input.message,
      audience,
      context: {
        role: input.session.recruiter.role,
        industry: input.session.recruiter.industry,
        priorities: input.session.priorities,
        concerns: input.session.concerns,
      },
      alreadyShown: input.session.projectsShown,
      ...(this.config.retrieval?.limit !== undefined ? { limit: this.config.retrieval.limit } : {}),
    });

    const allowedProjectIds = new Set(bundle.projects.map((p) => p.id));
    const allowedSkillIds = new Set(bundle.skills.map((s) => s.id));

    const plan: Omit<TurnPlan, 'systemPrompt' | 'shortCircuit'> = {
      tools: toolSchemas(this.config.enabledTools),
      bundle,
      injection,
      allowedProjectIds,
      allowedSkillIds,
      audit: {
        withheldCount: this.policy.filterForAudience(this.repository, audience).withheld.length,
        policyReason: decision.reason,
      },
    };

    const systemPrompt = buildSystemPrompt({
      identity: this.config.identity,
      closedTopics: this.policy.closedTopics(audience).map((rule) => ({
        topic: rule.topic,
        ...(rule.refusal ? { refusal: rule.refusal } : {}),
      })),
      evidence: toEvidenceViews(bundle, this.repository),
      availableTools: plan.tools.map((t) => t.name),
      session: {
        role: input.session.recruiter.role,
        company: input.session.recruiter.company,
        priorities: input.session.priorities,
        concerns: input.session.concerns,
        projectsShown: input.session.projectsShown,
      },
      evidenceEmpty: bundle.empty,
    });

    if (injection.detected && injection.score >= 0.5) {
      return {
        ...plan,
        systemPrompt,
        shortCircuit: { reason: 'injection', response: injectionResponse() },
      };
    }

    if (!decision.allowed) {
      return {
        ...plan,
        systemPrompt,
        shortCircuit: {
          reason: 'policy_refusal',
          response: decision.refusal ?? 'That is outside what I can share.',
        },
      };
    }

    return { ...plan, systemPrompt };
  }

  /** Validates a model's component call against what it was actually shown. */
  resolveComponent(call: ToolCall, plan: TurnPlan): ResolutionResult {
    return resolveToolCall(call, {
      allowedProjectIds: plan.allowedProjectIds,
      allowedSkillIds: plan.allowedSkillIds,
    });
  }

  /** Whether another clarifying question is permitted (§20). */
  mayAskQuestion(session: SessionState): boolean {
    return mayAskQuestion(session, this.config.identity.behaviour.max_consecutive_questions);
  }
}

function toEvidenceViews(bundle: EvidenceBundle, repository: KnowledgeRepository): EvidenceItemView[] {
  return bundle.ranked.map((scored) => {
    const sources = repository.provenanceOf(scored.id).map((s) => `${s.name} (level ${s.authority_level})`);
    const item = scored.item;

    let text: string;
    if (scored.kind === 'fact') {
      text = (item as { claim: string }).claim;
    } else if (scored.kind === 'skill') {
      const skill = item as { name: string; proficiency?: string | null; category: string };
      text = `${skill.name} — ${skill.category}${skill.proficiency ? `, ${skill.proficiency}` : ''}`;
    } else {
      const project = item as { name: string; summary: string; outcomes?: string[] };
      text = `${project.name}: ${project.summary}` +
        (project.outcomes?.length ? `\n  Outcomes: ${project.outcomes.join('; ')}` : '');

      // Surface embeddable artifacts explicitly. Without this the model has no
      // way to know that `show_artifact` would resolve for this project, so it
      // falls back to describing work it could have shown running.
      const artifacts = repository
        .projectEvidence(scored.id)
        ?.artifacts?.filter((a) => (a.visibility ?? 'public') === 'public' && a.sanitized);
      if (artifacts?.length) {
        text +=
          `\n  Embeddable artifacts (the real running interface — prefer show_artifact over describing these): ` +
          artifacts.map((a) => `${a.id} "${a.label}"`).join(', ');
      }
    }

    const verified = (item as { verification_status?: string }).verification_status === 'verified';
    return { id: scored.id, kind: scored.kind, text, sources, verified };
  });
}
