/**
 * The policy engine.
 *
 * Two jobs, both performed before the model is involved:
 *   1. Filter the knowledge repository down to what this audience may see.
 *   2. Decide whether an incoming question targets a closed topic.
 *
 * The ordering is the whole point. `filterForAudience` runs at retrieval time,
 * so a prompt-injection attempt cannot widen access — there is nothing wider
 * in the context to reach for (design doc §3.4, §26).
 */

import {
  VISIBILITY_ORDER,
  type Fact,
  type KnowledgeRepository,
  type Project,
  type Skill,
  type Visibility,
} from '@par/knowledge';
import type { Audience, PolicyConfig, TopicAccess, TopicRule } from './config.js';

export interface PolicyDecision {
  allowed: boolean;
  /** The rule that produced this decision, when one applied. */
  rule?: TopicRule;
  /** Owner-facing explanation. Never shown verbatim to a visitor. */
  reason: string;
  /** Visitor-facing text when `allowed` is false. */
  refusal?: string;
}

export interface FilteredKnowledge {
  facts: Fact[];
  skills: Skill[];
  projects: Project[];
  /** Ids removed by policy, for owner-side auditing. */
  withheld: string[];
}

/** Higher wins when several rules match one question. */
const RESTRICTIVENESS: Record<TopicAccess, number> = {
  public: 0,
  restricted: 1,
  explicit_permission: 2,
  never: 3,
};

const DEFAULT_REFUSAL =
  'That falls outside what I can share. I can talk about professional experience, ' +
  'projects, skills, and how they map to a role you are hiring for.';

export class PolicyEngine {
  constructor(private readonly config: PolicyConfig) {}

  /** The visibility ceiling for an audience. */
  ceiling(audience: Audience): Visibility {
    return this.config.maxVisibility[audience] ?? 'public';
  }

  private withinCeiling(visibility: Visibility, audience: Audience): boolean {
    return VISIBILITY_ORDER[visibility] <= VISIBILITY_ORDER[this.ceiling(audience)];
  }

  private isPresentable(status: string): boolean {
    return (this.config.presentableVerificationStatuses as string[]).includes(status);
  }

  /**
   * Reduces the repository to the slice an audience may receive.
   *
   * Callers should treat the result as the *only* knowledge that exists for
   * that turn. Nothing downstream re-checks visibility.
   */
  filterForAudience(repository: KnowledgeRepository, audience: Audience): FilteredKnowledge {
    const withheld: string[] = [];

    const admit = (id: string, visibility: Visibility, status: string): boolean => {
      if (audience === 'owner') return true;
      if (!this.withinCeiling(visibility, audience)) {
        withheld.push(id);
        return false;
      }
      if (!this.isPresentable(status)) {
        withheld.push(id);
        return false;
      }
      if (this.config.unverifiedClaimHandling === 'hide' && status !== 'verified') {
        withheld.push(id);
        return false;
      }
      return true;
    };

    return {
      facts: repository.facts.filter((f) => admit(f.id, f.visibility, f.verification_status)),
      skills: repository.skills.filter((s) => admit(s.id, s.visibility, s.verification_status)),
      projects: repository.projects.filter((p) => admit(p.id, p.visibility, p.verification_status)),
      withheld,
    };
  }

  /** Whether a specific knowledge id may be released to this audience. */
  canRelease(
    repository: KnowledgeRepository,
    id: string,
    audience: Audience,
  ): PolicyDecision {
    if (audience === 'owner') return { allowed: true, reason: 'owner audience' };

    const item =
      repository.fact(id) ?? repository.skill(id) ?? repository.project(id) ?? repository.entity(id);
    if (!item) {
      return { allowed: false, reason: `unknown knowledge id "${id}"` };
    }
    const visibility = ('visibility' in item ? item.visibility : 'public') ?? 'public';
    if (!this.withinCeiling(visibility, audience)) {
      return {
        allowed: false,
        reason: `visibility "${visibility}" exceeds ceiling for audience "${audience}"`,
        refusal: DEFAULT_REFUSAL,
      };
    }
    return { allowed: true, reason: 'within visibility ceiling' };
  }

  /**
   * Classifies an incoming question against the closed-topic rules.
   *
   * This is a gate on *what gets retrieved*, not a content filter on the
   * answer. A blocked topic means the relevant knowledge is never assembled.
   *
   * **Deny wins.** Every matching rule is evaluated and the most restrictive
   * one decides. Returning on first match would let a broad permissive rule
   * shadow a closed one — "what salary would he expect for a lead role?"
   * matches both `professional_experience` (on "role") and `compensation`,
   * and the order they happen to sit in a config file must not determine
   * whether that question gets answered.
   */
  evaluateQuestion(question: string, audience: Audience): PolicyDecision {
    if (audience === 'owner') return { allowed: true, reason: 'owner audience' };

    const haystack = question.toLowerCase();
    const matched = this.config.topics.filter((rule) =>
      rule.matches.some((needle) => haystack.includes(needle)),
    );
    if (matched.length === 0) {
      return { allowed: true, reason: 'no closed-topic rule matched' };
    }

    const strictest = matched.reduce((worst, rule) =>
      RESTRICTIVENESS[rule.access] > RESTRICTIVENESS[worst.access] ? rule : worst,
    );

    switch (strictest.access) {
      case 'public':
        return { allowed: true, rule: strictest, reason: `topic "${strictest.topic}" is public` };
      case 'restricted':
        if (audience === 'verified_recruiter') {
          return {
            allowed: true,
            rule: strictest,
            reason: `topic "${strictest.topic}" released to verified recruiter`,
          };
        }
        return {
          allowed: false,
          rule: strictest,
          reason: `topic "${strictest.topic}" is restricted`,
          refusal: strictest.refusal ?? DEFAULT_REFUSAL,
        };
      case 'explicit_permission':
        return {
          allowed: false,
          rule: strictest,
          reason: `topic "${strictest.topic}" requires the owner's explicit permission`,
          refusal: strictest.refusal ?? DEFAULT_REFUSAL,
        };
      case 'never':
        return {
          allowed: false,
          rule: strictest,
          reason: `topic "${strictest.topic}" is never released`,
          refusal: strictest.refusal ?? DEFAULT_REFUSAL,
        };
    }
  }

  /** All topics an audience is barred from, for building the system prompt's boundary section. */
  closedTopics(audience: Audience): TopicRule[] {
    if (audience === 'owner') return [];
    return this.config.topics.filter((rule) => {
      if (rule.access === 'never' || rule.access === 'explicit_permission') return true;
      return rule.access === 'restricted' && audience !== 'verified_recruiter';
    });
  }
}
