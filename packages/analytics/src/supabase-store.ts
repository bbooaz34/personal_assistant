/**
 * Supabase implementation of `SessionStore` (docs/DATA-COLLECTION.md).
 *
 * Writes go over PostgREST rather than a direct Postgres connection: the app
 * runs serverless, and an HTTP call has no connection pool to exhaust when a
 * burst of cold starts each want a socket.
 *
 * This uses the service-role key, which bypasses RLS. That is the intended
 * design — the tables carry RLS with no policies, so the service role is the
 * only thing that can reach them, and it never leaves the server.
 *
 * No method rejects. A dropped analytics row is an acceptable loss; a visitor
 * seeing an error because a telemetry insert failed is not.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { redactContactDetails } from './redact.js';
import type {
  EventRecord,
  PurgeResult,
  StoredEvent,
  StoredSession,
  StoredTurn,
  SessionRecord,
  SessionStore,
  SummaryRecord,
  TurnRecord,
} from './store.js';

export interface SupabaseStoreOptions {
  url: string;
  serviceRoleKey: string;
  /** Overridable so a caller can route failures somewhere other than the console. */
  onError?: (operation: string, error: unknown) => void;
}

/** Postgres rejects unknown keys, and `undefined` is not the same as SQL NULL. */
function compact(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

export class SupabaseStore implements SessionStore {
  readonly enabled = true;

  private readonly client: SupabaseClient;
  private readonly onError: (operation: string, error: unknown) => void;

  constructor(options: SupabaseStoreOptions) {
    this.client = createClient(options.url, options.serviceRoleKey, {
      // Server-side and stateless: there is no browser storage to persist a
      // session into, and no user to refresh a token for.
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.onError =
      options.onError ??
      ((operation, error) => {
        console.warn(`[store] ${operation} failed: ${String(error)}`);
      });
  }

  async startSession(record: SessionRecord): Promise<void> {
    try {
      const { error } = await this.client.from('sessions').upsert(
        compact({
          id: record.id,
          started_at: record.startedAt,
          modality: record.modality,
          language: record.language,
          audience: record.audience,
          app_version: record.appVersion,
          knowledge_version: record.knowledgeVersion,
          prompt_version: record.promptVersion,
          model: record.model,
          referrer_host: record.referrerHost,
          country: record.country,
          device_class: record.deviceClass,
          entry_focus: record.entryFocus,
        }),
        // The first turn creates the row; later turns must not reset its
        // `started_at`, which duration is measured from.
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (error) this.onError('startSession', error.message);
    } catch (error) {
      this.onError('startSession', error);
    }
  }

  async recordTurn(record: TurnRecord): Promise<number | null> {
    try {
      const { data, error } = await this.client
        .from('turns')
        .insert(
          compact({
            session_id: record.sessionId,
            seq: record.seq,
            role: record.role,
            // Redaction is applied here so no caller can skip it.
            content: redactContactDetails(record.content),
            modality: record.modality,
            latency_ms: record.latencyMs,
            model: record.model,
            input_tokens: record.inputTokens,
            output_tokens: record.outputTokens,
            finish_reason: record.finishReason,
            policy_topic: record.policyTopic,
            short_circuit_reason: record.shortCircuitReason,
            injection_detected: record.injectionDetected,
            injection_score: record.injectionScore,
            retrieved_project_ids: record.retrievedProjectIds,
            retrieved_skill_ids: record.retrievedSkillIds,
            plan_trace: record.planTrace,
          }),
        )
        .select('id')
        .single();

      if (error) {
        this.onError('recordTurn', error.message);
        return null;
      }
      return typeof data?.id === 'number' ? data.id : null;
    } catch (error) {
      this.onError('recordTurn', error);
      return null;
    }
  }

  async recordEvent(record: EventRecord): Promise<void> {
    try {
      const { error } = await this.client.from('events').insert(
        compact({
          session_id: record.sessionId,
          turn_id: record.turnId,
          type: record.type,
          detail: record.detail ?? {},
        }),
      );
      if (error) this.onError('recordEvent', error.message);
    } catch (error) {
      this.onError('recordEvent', error);
    }
  }

  async endSession(sessionId: string, endedAt: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('sessions')
        .update({ ended_at: endedAt })
        .eq('id', sessionId);
      if (error) this.onError('endSession', error.message);
    } catch (error) {
      this.onError('endSession', error);
    }
  }

  async findSessionsToSummarize(idleMinutes: number, limit: number): Promise<StoredSession[]> {
    try {
      const cutoff = new Date(Date.now() - idleMinutes * 60_000).toISOString();
      const { data, error } = await this.client
        .from('sessions')
        .select('id, started_at, last_activity_at, language')
        .is('summarized_at', null)
        .lt('last_activity_at', cutoff)
        // Oldest first: a backlog drains in the order it accumulated rather
        // than starving the sessions that have waited longest.
        .order('last_activity_at', { ascending: true })
        .limit(limit);

      if (error) {
        this.onError('findSessionsToSummarize', error.message);
        return [];
      }
      return (data ?? []).map((row) => ({
        id: String(row.id),
        startedAt: String(row.started_at),
        lastActivityAt: String(row.last_activity_at),
        language: (row.language as string | null) ?? null,
      }));
    } catch (error) {
      this.onError('findSessionsToSummarize', error);
      return [];
    }
  }

  async loadTurns(sessionId: string): Promise<StoredTurn[]> {
    try {
      const { data, error } = await this.client
        .from('turns')
        .select('seq, role, content, modality, created_at, policy_topic, short_circuit_reason, injection_detected, retrieved_project_ids')
        .eq('session_id', sessionId)
        // `created_at` is the ordering authority — `seq` restarts on reload.
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        this.onError('loadTurns', error.message);
        return [];
      }
      return (data ?? []).map((row) => ({
        seq: Number(row.seq ?? 0),
        role: row.role === 'assistant' ? 'assistant' : 'user',
        content: String(row.content ?? ''),
        modality: row.modality === 'voice' ? 'voice' : 'text',
        createdAt: String(row.created_at),
        policyTopic: (row.policy_topic as string | null) ?? null,
        shortCircuitReason: (row.short_circuit_reason as string | null) ?? null,
        injectionDetected: Boolean(row.injection_detected),
        retrievedProjectIds: (row.retrieved_project_ids as string[] | null) ?? [],
      }));
    } catch (error) {
      this.onError('loadTurns', error);
      return [];
    }
  }

  async loadEvents(sessionId: string): Promise<StoredEvent[]> {
    try {
      const { data, error } = await this.client
        .from('events')
        .select('type, detail, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        this.onError('loadEvents', error.message);
        return [];
      }
      return (data ?? []).map((row) => ({
        type: String(row.type ?? ''),
        detail: (row.detail as Record<string, unknown> | null) ?? {},
        createdAt: String(row.created_at),
      }));
    } catch (error) {
      this.onError('loadEvents', error);
      return [];
    }
  }

  async markSummarized(sessionId: string, at: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('sessions')
        .update({ summarized_at: at })
        .eq('id', sessionId);
      if (error) this.onError('markSummarized', error.message);
    } catch (error) {
      this.onError('markSummarized', error);
    }
  }

  /**
   * Calls the SQL function the retention migration installs. Deliberately not
   * a set of DELETEs issued from here: the window and the semantics live in
   * one place, so a scheduled route and a pg_cron job cannot drift apart.
   */
  async purgeExpired(): Promise<PurgeResult | null> {
    try {
      const { data, error } = await this.client.rpc('purge_expired_conversation_data');
      if (error) {
        this.onError('purgeExpired', error.message);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return {
        turnsDeleted: Number(row?.turns_deleted ?? 0),
        eventsDeleted: Number(row?.events_deleted ?? 0),
      };
    } catch (error) {
      this.onError('purgeExpired', error);
      return null;
    }
  }

  async saveSummary(record: SummaryRecord): Promise<void> {
    try {
      const { error } = await this.client.from('session_summaries').upsert(
        compact({
          session_id: record.sessionId,
          model: record.model,
          stated: record.stated,
          interpreted: record.interpreted,
          role: record.role,
          company: record.company,
          main_interests: record.mainInterests,
          possible_concerns: record.possibleConcerns,
          projects_shown: record.projectsShown,
          projects_resonated: record.projectsResonated,
          unanswered: record.unanswered,
          duration_seconds: record.durationSeconds,
          policy_refusals: record.policyRefusals,
          injection_attempts: record.injectionAttempts,
          recommended_follow_up: record.recommendedFollowUp,
        }),
        // Regenerating a summary should replace it, not fail on the primary key.
        { onConflict: 'session_id' },
      );
      if (error) this.onError('saveSummary', error.message);
    } catch (error) {
      this.onError('saveSummary', error);
    }
  }
}
