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

/** Letters and digits in any script — the characters a word may not be glued to. */
const WORD_CHAR = '[\\p{L}\\p{N}]';

const HEBREW = /[\u0590-\u05ff]/;

/**
 * Hebrew writes the definite article, "and", and several prepositions as single
 * letters glued to the front of the word, so "השכר" and "ומשכורת" are the same
 * question as "שכר". Anchoring a Hebrew needle at both ends would drop every
 * one of those, so the front lets these letters through and the back is left
 * open — Hebrew attaches possessives too, and "שכרו" is still his salary.
 * Anchoring the front is what matters anyway: it is what stops 'גיל' ("age")
 * from firing inside 'רגיל' ("ordinary").
 */
const HEBREW_PROCLITICS = 'בהוכלמש';

const NEEDLE_PATTERNS = new Map<string, RegExp>();

/**
 * Compiles a `matches` needle into a pattern that only fires on a whole word.
 *
 * This used to be `haystack.includes(needle)`, which closed topics on questions
 * that had nothing to do with them: 'rate' fires inside "demonstrates",
 * "corporate" and "integrate", 'earn' inside "learning", 'nda' inside
 * "standard" and "boundaries". "Which project demonstrates his systems
 * thinking?" came back as "I don't discuss compensation" — on a site whose
 * whole purpose is answering that question.
 *
 * The breadth in config/privacy.config.ts is deliberate and this keeps it: a
 * needle still matches anywhere in the question, in any phrasing, and the lists
 * are still free to over-reach. What it stops is breadth nobody chose, arriving
 * from an accident of English spelling. Multi-word needles are anchored the
 * same way and behave as they did — their internal spaces already made them
 * specific enough that no real question matched them by accident.
 *
 * Cached because a needle's pattern never changes and this runs on every turn.
 */
function wholeWord(needle: string): RegExp {
  const cached = NEEDLE_PATTERNS.get(needle);
  if (cached) return cached;

  const literal = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = HEBREW.test(needle)
    ? `(?<!${WORD_CHAR})[${HEBREW_PROCLITICS}]{0,2}${literal}`
    : `(?<!${WORD_CHAR})${literal}(?!${WORD_CHAR})`;

  const compiled = new RegExp(pattern, 'u');
  NEEDLE_PATTERNS.set(needle, compiled);
  return compiled;
}

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
      rule.matches.some((needle) => wholeWord(needle).test(haystack)),
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
