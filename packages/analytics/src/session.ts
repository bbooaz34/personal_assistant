/**
 * Conversation state (design doc §30).
 *
 * Two purposes: stop the agent repeating itself, and let it decide what would
 * actually be useful next. Everything here is derived from the conversation
 * itself — the agent builds this by listening, not by making the visitor fill
 * in a form (§5, §20).
 */

export interface RecruiterProfile {
  name: string | null;
  company: string | null;
  role: string | null;
  industry: string | null;
}

export interface InteractionEvent {
  type: 'message' | 'component_rendered' | 'project_opened' | 'media_viewed' | 'policy_refusal' | 'injection_flagged';
  at: string;
  detail: Record<string, unknown>;
}

export interface SessionState {
  id: string;
  startedAt: string;
  lastActivityAt: string;
  language: string | null;
  recruiter: RecruiterProfile;
  /** What the visitor is trying to accomplish, in their words where possible. */
  intent: string[];
  priorities: string[];
  concerns: string[];
  questionsAsked: string[];
  /** Projects the agent surfaced. */
  projectsShown: string[];
  /** Projects the visitor actually expanded — a much stronger interest signal. */
  projectsOpened: string[];
  /** Things the agent tried to answer and could not. Feeds the owner's backlog. */
  unknowns: string[];
  events: InteractionEvent[];
  /** Clarifying questions asked in a row, to enforce the anti-interrogation rule. */
  consecutiveQuestions: number;
}

export function createSession(id: string, startedAt: string): SessionState {
  return {
    id,
    startedAt,
    lastActivityAt: startedAt,
    language: null,
    recruiter: { name: null, company: null, role: null, industry: null },
    intent: [],
    priorities: [],
    concerns: [],
    questionsAsked: [],
    projectsShown: [],
    projectsOpened: [],
    unknowns: [],
    events: [],
    consecutiveQuestions: 0,
  };
}

/**
 * Structured context the agent may propose after a turn.
 *
 * Everything is optional and additive: the agent updates what it learned and
 * leaves the rest alone, so a single ambiguous turn cannot wipe out context
 * established earlier.
 */
export interface SessionUpdate {
  language?: string;
  recruiter?: Partial<RecruiterProfile>;
  intent?: string[];
  priorities?: string[];
  concerns?: string[];
  questionAsked?: string;
  projectsShown?: string[];
  projectsOpened?: string[];
  unknowns?: string[];
  askedClarifyingQuestion?: boolean;
}

function mergeUnique(existing: string[], incoming: string[] | undefined): string[] {
  if (!incoming?.length) return existing;
  const set = new Set(existing);
  for (const item of incoming) {
    const trimmed = item.trim();
    if (trimmed) set.add(trimmed);
  }
  return [...set];
}

export function applyUpdate(state: SessionState, update: SessionUpdate, at: string): SessionState {
  const next: SessionState = {
    ...state,
    lastActivityAt: at,
    language: update.language ?? state.language,
    recruiter: {
      // Never overwrite a known value with null: forgetting the company because
      // one turn did not mention it is worse than a slightly stale profile.
      name: update.recruiter?.name ?? state.recruiter.name,
      company: update.recruiter?.company ?? state.recruiter.company,
      role: update.recruiter?.role ?? state.recruiter.role,
      industry: update.recruiter?.industry ?? state.recruiter.industry,
    },
    intent: mergeUnique(state.intent, update.intent),
    priorities: mergeUnique(state.priorities, update.priorities),
    concerns: mergeUnique(state.concerns, update.concerns),
    questionsAsked: update.questionAsked
      ? mergeUnique(state.questionsAsked, [update.questionAsked])
      : state.questionsAsked,
    projectsShown: mergeUnique(state.projectsShown, update.projectsShown),
    projectsOpened: mergeUnique(state.projectsOpened, update.projectsOpened),
    unknowns: mergeUnique(state.unknowns, update.unknowns),
    consecutiveQuestions: update.askedClarifyingQuestion ? state.consecutiveQuestions + 1 : 0,
  };
  return next;
}

export function recordEvent(state: SessionState, event: InteractionEvent): SessionState {
  return { ...state, events: [...state.events, event], lastActivityAt: event.at };
}

/** Whether the agent may ask another clarifying question this turn (§20). */
export function mayAskQuestion(state: SessionState, maxConsecutive: number): boolean {
  return state.consecutiveQuestions < maxConsecutive;
}
