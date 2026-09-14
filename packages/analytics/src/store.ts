/**
 * The persistence contract for conversation data (docs/DATA-COLLECTION.md).
 *
 * Deliberately an interface with a no-op default, for the same reason
 * `KnowledgeRepository` is one: the concrete store is chosen by the
 * application, and the repository's defining property — clone it, run it, no
 * keys required — has to survive this feature. With nothing configured the
 * agent behaves exactly as it did before any of this existed.
 *
 * Every method returns a promise that resolves. None of them reject. Telemetry
 * that can break a conversation is worse than no telemetry, so a failed write
 * is logged and dropped rather than propagated to a visitor's turn.
 */

/** One visit. Created on the first turn and never overwritten afterwards. */
export interface SessionRecord {
  id: string;
  startedAt: string;
  modality?: 'text' | 'voice' | 'mixed';
  language?: string | null;
  audience?: string;

  /** Which system produced this conversation. Without these, releases cannot be compared. */
  appVersion?: string | null;
  knowledgeVersion?: string | null;
  promptVersion?: string | null;
  model?: string | null;

  /** Coarse provenance only — never an IP or a raw user-agent. */
  referrerHost?: string | null;
  country?: string | null;
  deviceClass?: 'mobile' | 'tablet' | 'desktop' | null;

  entryFocus?: string | null;
}

/** One message. `content` is redacted by the store, not by the caller. */
export interface TurnRecord {
  sessionId: string;
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  modality?: 'text' | 'voice';

  latencyMs?: number | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  finishReason?: string | null;

  policyTopic?: string | null;
  shortCircuitReason?: 'policy_refusal' | 'injection' | null;
  injectionDetected?: boolean;
  injectionScore?: number | null;
  retrievedProjectIds?: string[];
  retrievedSkillIds?: string[];

  /** The owner-side decision trace from `TurnPlan`. Never shown to a visitor. */
  planTrace?: Record<string, unknown> | null;
}

export interface EventRecord {
  sessionId: string;
  turnId?: number | null;
  type: string;
  detail?: Record<string, unknown>;
}

export interface SummaryRecord {
  sessionId: string;
  model?: string | null;
  /** What the visitor said outright. */
  stated: unknown[];
  /** What a model concluded. Never merged into `stated`. */
  interpreted: unknown[];
  role?: string | null;
  company?: string | null;
  mainInterests?: string[];
  possibleConcerns?: string[];
  projectsShown?: string[];
  projectsResonated?: string[];
  unanswered?: string[];
  durationSeconds?: number | null;
  policyRefusals?: number;
  injectionAttempts?: number;
  recommendedFollowUp?: string | null;
}

/** A session read back for summarization. */
export interface StoredSession {
  id: string;
  startedAt: string;
  lastActivityAt: string;
  language: string | null;
}

export interface StoredTurn {
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  modality: 'text' | 'voice';
  createdAt: string;
  policyTopic: string | null;
  shortCircuitReason: string | null;
  injectionDetected: boolean;
  retrievedProjectIds: string[];
}

export interface StoredEvent {
  type: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface SessionStore {
  /** False for the no-op store, so callers can skip assembling a payload nobody will read. */
  readonly enabled: boolean;

  /** Idempotent: safe to call on every turn, and never overwrites `startedAt`. */
  startSession(record: SessionRecord): Promise<void>;

  /** Resolves to the new row's id, for events that reference a turn, or null on failure. */
  recordTurn(record: TurnRecord): Promise<number | null>;

  recordEvent(record: EventRecord): Promise<void>;

  endSession(sessionId: string, endedAt: string): Promise<void>;

  saveSummary(record: SummaryRecord): Promise<void>;

  /**
   * Sessions that have gone quiet and have no summary yet.
   *
   * Idle time is the only usable signal that a conversation is over: a visitor
   * closing a tab tells us nothing, and that is the ordinary way one ends.
   */
  findSessionsToSummarize(idleMinutes: number, limit: number): Promise<StoredSession[]>;

  loadTurns(sessionId: string): Promise<StoredTurn[]>;

  loadEvents(sessionId: string): Promise<StoredEvent[]>;

  /**
   * Marks a session as summarized. Separate from `saveSummary` so a failed
   * model call leaves the session in the queue for the next pass instead of
   * being silently dropped.
   */
  markSummarized(sessionId: string, at: string): Promise<void>;

  /**
   * Deletes verbatim turn and event data past the retention window.
   *
   * Exists on the contract because retention is a promise made to visitors,
   * and a promise that depends on one database extension being available is a
   * weaker promise than one the application can also keep itself.
   */
  purgeExpired(): Promise<PurgeResult | null>;
}

export interface PurgeResult {
  turnsDeleted: number;
  eventsDeleted: number;
}

/**
 * The default. Every call succeeds and nothing is written.
 *
 * This is what runs when no database is configured, which includes every fresh
 * clone of the repository and every contributor who never sets a Supabase key.
 */
export class NullStore implements SessionStore {
  readonly enabled = false;

  async startSession(): Promise<void> {}
  async recordTurn(): Promise<number | null> {
    return null;
  }
  async recordEvent(): Promise<void> {}
  async endSession(): Promise<void> {}
  async saveSummary(): Promise<void> {}
  async findSessionsToSummarize(): Promise<StoredSession[]> {
    return [];
  }
  async loadTurns(): Promise<StoredTurn[]> {
    return [];
  }
  async loadEvents(): Promise<StoredEvent[]> {
    return [];
  }
  async markSummarized(): Promise<void> {}
  async purgeExpired(): Promise<PurgeResult | null> {
    return null;
  }
}
