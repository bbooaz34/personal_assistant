/**
 * Project peeks: the three pieces of work offered at the opening.
 *
 * The recruiter script is explicit that these must not be hard-coded — the
 * system picks them from evidence, so that adding a documented project
 * changes what a visitor is offered without anyone editing a script.
 *
 * Two selection modes:
 *
 *   **Breadth** (session start, nothing known about the visitor). One project
 *   per slot — product thinking, leadership/creative direction, AI-native
 *   work — so the opening shows the span of the career rather than three
 *   variations on one theme.
 *
 *   **Depth** (the visitor has named a role). Slots dissolve and the top three
 *   by focus-weighted score win, which is how "I'm hiring a Senior Product
 *   Designer" replaces the spread with product-heavy work.
 *
 * Axis scores come from the *categories* of the skills a project demonstrates,
 * not from a list of project ids. That is what keeps this evidence-driven: a
 * project earns the AI slot by demonstrating AI skills, and stops earning it
 * if that evidence is withdrawn.
 */

import type { KnowledgeRepository, Project, SkillCategory } from '@par/knowledge';
import type { Audience, PolicyEngine } from '@par/policy';

export type PeekAxis = 'product' | 'leadership' | 'creative' | 'ai';

/** How much a skill in each category contributes to each axis. */
const CATEGORY_AXES: Record<SkillCategory, Partial<Record<PeekAxis, number>>> = {
  product: { product: 1 },
  leadership: { leadership: 1 },
  creative: { creative: 1 },
  ai: { ai: 1 },
  // Workflow and systems work is the technical face of AI-native practice,
  // which is where it reads strongest to a recruiter.
  technical: { ai: 0.7, product: 0.3 },
  strategy: { leadership: 0.6, product: 0.4 },
  '3d': { creative: 0.6 },
  motion: { creative: 0.5 },
  research: { product: 0.5 },
  other: {},
};

/** The three opening slots, in the order the script presents them. */
const SLOTS: Array<{ axes: PeekAxis[]; cta: string }> = [
  { axes: ['product'], cta: 'Explore this project' },
  { axes: ['leadership', 'creative'], cta: 'Take a look' },
  { axes: ['ai'], cta: 'Show me the AI work' },
];

export interface PeekCard {
  projectId: string;
  name: string;
  /** One line: what the project is. */
  hook: string;
  /** The disciplines it evidences. */
  supporting: string;
  cta: string;
  /** Which axis earned it a place. */
  axis: PeekAxis;
  /** True when the real running interface can be embedded. */
  hasArtifact: boolean;
  verified: boolean;
}

export interface PeekSelection {
  cards: PeekCard[];
  /** Null at session start; the detected emphasis once a role is known. */
  focus: PeekFocus | null;
}

export interface PeekFocus {
  /** What the visitor said that produced this focus, trimmed for display. */
  label: string;
  weights: Partial<Record<PeekAxis, number>>;
}

interface FocusRule {
  pattern: RegExp;
  label: string;
  weights: Partial<Record<PeekAxis, number>>;
}

/**
 * Role → emphasis. A rule table rather than a model call: it is instant,
 * legible, and testable, and a miss degrades to the breadth selection rather
 * than to a wrong answer. Weights blend on purpose — "Creative AI Lead" is
 * not one axis, it is AI plus creative plus a little leadership.
 */
const FOCUS_RULES: FocusRule[] = [
  {
    pattern: /\b(creative\s+ai|ai\s+creative)\b|\bcreative\b[^.]{0,20}\bai\b[^.]{0,20}\b(lead|leader|head|director)\b/i,
    label: 'creative AI',
    weights: { ai: 1, creative: 0.85, leadership: 0.6 },
  },
  {
    pattern: /\b(ai|genai|generative|ml|machine learning)\b[^.]{0,30}\b(lead|leader|head|director|manager)\b|\b(lead|head|director)\b[^.]{0,30}\b(ai|genai|generative)\b/i,
    label: 'AI leadership',
    weights: { ai: 1, leadership: 0.8, product: 0.4 },
  },
  {
    // Before the leadership rule: "creative director" is a creative role, and
    // a leadership pattern loose enough to catch it would swallow it whole.
    pattern: /\bcreative director\b|\bart director\b|\bbrand\b|\bvisual identity\b|\bcreative direction\b/i,
    label: 'creative direction',
    weights: { creative: 1, leadership: 0.6 },
  },
  {
    pattern: /\bdesign\s+(team\s+)?(lead|leader|manager|director)\b|\bhead of design\b|\bmanag\w*\s+(a\s+)?(team|designers?)\b|\bteam lead(er)?\b|\bpeople manage\w*\b/i,
    label: 'design leadership',
    weights: { leadership: 1, creative: 0.5, product: 0.5 },
  },
  {
    pattern: /\bproduct design(er)?\b|\bux\b|\bui\/ux\b|\bproduct thinking\b|\bsenior product\b|\bproduct lead\b/i,
    label: 'product design',
    weights: { product: 1, leadership: 0.4 },
  },
  {
    pattern: /\b(ai|genai|generative|ai-native|llm|agents?)\b/i,
    label: 'AI-native work',
    weights: { ai: 1, product: 0.4 },
  },
];

export function detectPeekFocus(text: string): PeekFocus | null {
  for (const rule of FOCUS_RULES) {
    if (rule.pattern.test(text)) return { label: rule.label, weights: rule.weights };
  }
  return null;
}

/** Per-axis strength of one project, 0–1-ish before normalization. */
function axisScores(repository: KnowledgeRepository, project: Project): Record<PeekAxis, number> {
  const scores: Record<PeekAxis, number> = { product: 0, leadership: 0, creative: 0, ai: 0 };

  for (const skill of repository.skillsDemonstratedBy(project.id)) {
    const contribution = CATEGORY_AXES[skill.category] ?? {};
    for (const [axis, weight] of Object.entries(contribution)) {
      scores[axis as PeekAxis] += (weight ?? 0) * skill.confidence;
    }
  }

  // Leadership is rarely a *skill a project demonstrates* — it is the role the
  // work was done in, which the knowledge base already records per project.
  // Without this the leadership axis scores zero everywhere and a "Design Team
  // Lead" query silently returns product work.
  for (const roleId of project.role_ids ?? []) {
    const role = repository.entity(roleId);
    if (role && /\b(lead|leader|director|head)\b/i.test(role.name)) {
      // Weighted like two skills, not one. Leadership only ever receives this
      // single contribution while product or AI accumulate three to five, so
      // matching a lone skill would structurally bury the axis rather than
      // reflect the evidence.
      scores.leadership += 1.8;
      // Direction carries a creative charge that a pure management title does not.
      if (/creative/i.test(role.name)) scores.creative += 0.4;
    }
  }

  // A peek card is an invitation to look. Work that can actually be shown, and
  // work that is documented enough to survive a follow-up question, is worth
  // more at the opening than work that is only a name and a summary.
  const evidence = repository.projectEvidence(project.id);
  const showable = (evidence?.artifacts ?? []).some(
    (a) => (a.visibility ?? 'public') === 'public' && a.sanitized,
  );
  const documented =
    (project.responsibilities?.length ?? 0) > 0 &&
    (project.outcomes?.length ?? 0) > 0;

  const multiplier =
    1 +
    (showable ? 0.5 : 0) +
    (documented ? 0.35 : 0) +
    (project.verification_status === 'verified' ? 0.2 : 0);

  for (const axis of Object.keys(scores) as PeekAxis[]) scores[axis] *= multiplier;
  return scores;
}

function firstSentence(text: string): string {
  const match = /^(.{20,150}?[.!?])(\s|$)/.exec(text.trim());
  return (match?.[1] ?? text.trim()).replace(/\s+/g, ' ');
}

function buildCard(
  repository: KnowledgeRepository,
  project: Project,
  axis: PeekAxis,
  cta: string,
): PeekCard {
  const evidence = repository.projectEvidence(project.id);
  const peek = evidence?.peek;

  const skills = repository.skillsDemonstratedBy(project.id).map((s) => s.name);
  const hasArtifact = (evidence?.artifacts ?? []).some(
    (a) => (a.visibility ?? 'public') === 'public' && a.sanitized,
  );

  return {
    projectId: project.id,
    name: project.name,
    hook: peek?.hook ?? evidence?.presentation?.short_pitch ?? firstSentence(project.summary),
    // Generated fallback lists the disciplines the project evidences — safe,
    // because it is read straight off the knowledge base rather than written.
    supporting: peek?.supporting ?? skills.slice(0, 5).join(', '),
    cta: peek?.cta ?? cta,
    axis,
    hasArtifact,
    verified: project.verification_status === 'verified',
  };
}

export function selectProjectPeeks({
  repository,
  policy,
  audience,
  intentText,
  limit = 3,
}: {
  repository: KnowledgeRepository;
  policy: PolicyEngine;
  audience: Audience;
  /** Something the visitor said, used to detect a role emphasis. */
  intentText?: string | null;
  limit?: number;
}): PeekSelection {
  // Policy first, as everywhere: a peek is a retrieval like any other.
  const permitted = policy.filterForAudience(repository, audience).projects;
  if (permitted.length === 0) return { cards: [], focus: null };

  const scored = permitted.map((project) => ({
    project,
    scores: axisScores(repository, project),
  }));

  const focus = intentText ? detectPeekFocus(intentText) : null;

  if (focus) {
    // Depth: the emphasis decides, slots do not.
    const ranked = scored
      .map(({ project, scores }) => {
        let total = 0;
        for (const [axis, weight] of Object.entries(focus.weights)) {
          total += (weight ?? 0) * scores[axis as PeekAxis];
        }
        return { project, total, scores };
      })
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);

    const cards = ranked.map(({ project, scores }) => {
      // Label the card with whichever axis actually carries it.
      const best = (Object.keys(scores) as PeekAxis[]).reduce((a, b) =>
        scores[a] >= scores[b] ? a : b,
      );
      const slot = SLOTS.find((s) => s.axes.includes(best)) ?? SLOTS[0]!;
      return buildCard(repository, project, best, slot.cta);
    });
    return { cards, focus };
  }

  // Breadth: one project per slot, best first, no repeats.
  const used = new Set<string>();
  const cards: PeekCard[] = [];
  for (const slot of SLOTS) {
    const best = scored
      .filter(({ project }) => !used.has(project.id))
      .map(({ project, scores }) => ({
        project,
        axis: slot.axes.reduce((a, b) => (scores[a] >= scores[b] ? a : b)),
        score: Math.max(...slot.axes.map((axis) => scores[axis])),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)[0];
    if (!best) continue;
    used.add(best.project.id);
    cards.push(buildCard(repository, best.project, best.axis, slot.cta));
  }

  return { cards: cards.slice(0, limit), focus: null };
}
