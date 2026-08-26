/**
 * Intent extraction — the first stage of the retrieval pipeline (design doc §15).
 *
 * Lexical matching alone cannot answer "what is he doing now?": the useful
 * words are stopwords, and "now" appears in no document. But the *intent* is
 * unambiguous, and it maps cleanly onto structured metadata the knowledge base
 * already carries — category `career`, still ongoing.
 *
 * This is a rule table rather than a model call. On a corpus this size the
 * rules are legible, instant, free, and testable, and a wrong classification
 * degrades ranking rather than fabricating an answer. When the question space
 * outgrows them, replace `extractIntent` with a structured-output model call —
 * the shape it returns is the contract, and nothing downstream changes.
 */

import type { FactCategory } from '@par/knowledge';
import type { RetrievableKind } from './types.js';

export type IntentName =
  | 'current_role'
  | 'career_history'
  | 'education'
  | 'leadership'
  | 'ai_capability'
  | 'projects'
  | 'skills'
  | 'tools'
  | 'outcomes';

export interface Intent {
  name: IntentName;
  /** Fact categories this intent points at. */
  categories: FactCategory[];
  /** Item kinds worth boosting. */
  kinds: RetrievableKind[];
  /** Restricts to claims with no end date — "now", "currently", "these days". */
  requiresOngoing?: boolean;
}

interface IntentRule extends Intent {
  pattern: RegExp;
}

/**
 * Patterns are matched against the raw question, before tokenization, so they
 * can use phrases. Hebrew triggers sit alongside English ones rather than in a
 * separate table — a policy or ranking behaviour that only works in one
 * language is a gap, not a limitation (§24).
 */
const RULES: IntentRule[] = [
  {
    name: 'current_role',
    pattern: /\b(right now|now|currently|current(ly)?|today|these days|at the moment|at present|present role|doing now|up to)\b|עכשיו|כרגע|היום/i,
    categories: ['career', 'responsibility'],
    kinds: ['fact'],
    requiresOngoing: true,
  },
  {
    name: 'career_history',
    pattern: /\b(career|history|background|worked at|where has he|previous|before that|track record|how long|since when|experience at)\b|קריירה|רקע|ניסיון/i,
    categories: ['career', 'responsibility'],
    kinds: ['fact'],
  },
  {
    name: 'education',
    pattern: /\b(stud(y|ies|ied|ying)|education|degree|university|college|school|graduat\w*|academic|b\.?des|bachelor)\b|לימודים|תואר|אוניברסיטה/i,
    categories: ['education'],
    kinds: ['fact'],
  },
  {
    name: 'leadership',
    pattern: /\b(lead|leads|led|leading|manage\w*|mentor\w*|team|teams|report\w*|hands.?on|people|headcount|direct reports)\b|ניהול|צוות|מוביל/i,
    categories: ['career', 'responsibility'],
    kinds: ['fact', 'skill'],
  },
  {
    name: 'ai_capability',
    pattern: /\b(ai|a\.i\.|generative|genai|gen.ai|llm|machine learning|ml|diffusion|comfyui|lora|agents?|prompt\w*)\b|בינה מלאכותית/i,
    categories: ['tool', 'technology', 'working_style'],
    kinds: ['fact', 'skill', 'project'],
  },
  {
    name: 'projects',
    pattern: /\b(project|projects|case stud\w+|portfolio|work sample|show me|example|examples)\b|פרויקט|תיק עבודות/i,
    categories: ['portfolio'],
    kinds: ['project'],
  },
  {
    name: 'skills',
    pattern: /\b(skill|skills|good at|strong at|capab\w+|expertise|specialt\w+|what can he)\b|כישורים|מומחיות/i,
    categories: [],
    kinds: ['skill'],
  },
  {
    name: 'tools',
    pattern: /\b(tool|tools|software|stack|figma|blender|adobe|photoshop|after effects)\b|כלים/i,
    categories: ['tool', 'technology'],
    kinds: ['fact', 'skill'],
  },
  {
    name: 'outcomes',
    pattern: /\b(impact|result|results|outcome\w*|metric\w*|roi|business value|numbers|measurable)\b|תוצאות|השפעה/i,
    categories: ['metric', 'achievement'],
    kinds: ['fact', 'project'],
  },
];

export function extractIntent(question: string): Intent[] {
  return RULES.filter((rule) => rule.pattern.test(question)).map(
    ({ pattern: _pattern, ...intent }) => intent,
  );
}

/**
 * How well an item matches the detected intents, 0–1.
 *
 * Returns 0 when no intent was detected, which is the important case: a
 * question the rules do not recognise must not receive a blanket boost, or
 * every item in the corpus clears the relevance floor.
 */
export function intentScore(
  intents: Intent[],
  kind: RetrievableKind,
  category: string | undefined,
  isOngoing: boolean,
): number {
  if (intents.length === 0) return 0;

  let best = 0;
  for (const intent of intents) {
    let score = 0;
    if (intent.kinds.includes(kind)) score += 0.5;
    if (category && intent.categories.includes(category as FactCategory)) score += 0.5;
    // A "what is he doing now" intent that lands on a role he left is worse
    // than useless — it is confidently out of date.
    if (intent.requiresOngoing) {
      if (!isOngoing) score = 0;
      else if (score > 0) score = Math.min(1, score + 0.25);
    }
    best = Math.max(best, score);
  }
  return best;
}
