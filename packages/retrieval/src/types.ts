import type { Fact, Project, Skill, Source } from '@par/knowledge';
import type { Audience } from '@par/policy';

export type RetrievableKind = 'fact' | 'skill' | 'project';

export interface RetrievalQuery {
  /** The visitor's question, verbatim. */
  question: string;
  audience: Audience;
  /** Structured session context, used to bias ranking toward the role being discussed. */
  context?: {
    role?: string | null;
    industry?: string | null;
    priorities?: string[];
    concerns?: string[];
  };
  /** Ids already shown this session; deprioritised so the agent stops repeating itself. */
  alreadyShown?: string[];
  limit?: number;
  kinds?: RetrievableKind[];
}

export interface ScoredItem {
  id: string;
  kind: RetrievableKind;
  /** Final score after blending and reranking. Used for ordering. */
  score: number;
  /** Topical match only (lexical + metadata + semantic). Used for the cut-off. */
  relevance: number;
  /** Per-signal contributions, kept for observability and for tuning weights. */
  signals: {
    lexical: number;
    metadata: number;
    semantic: number;
    authority: number;
    recency: number;
    novelty: number;
  };
  item: Fact | Skill | Project;
}

/**
 * Everything an answer is allowed to be built from, plus the provenance needed
 * to justify it. The agent receives one of these per turn and nothing else
 * (design doc §15, §28).
 */
export interface EvidenceBundle {
  query: RetrievalQuery;
  facts: Fact[];
  skills: Skill[];
  projects: Project[];
  ranked: ScoredItem[];
  /** Sources backing the retrieved items, deduplicated. */
  sources: Source[];
  /** True when nothing cleared the relevance floor — the agent must say so rather than improvise. */
  empty: boolean;
}

export interface RetrievalWeights {
  lexical: number;
  metadata: number;
  semantic: number;
  authority: number;
  recency: number;
  novelty: number;
}

export const DEFAULT_WEIGHTS: RetrievalWeights = {
  lexical: 1.0,
  metadata: 0.8,
  semantic: 1.0,
  // Authority is a tiebreaker, not a ranker: a CV-verified fact should win a
  // close contest against an AI-memory claim, not outrank a better answer.
  authority: 0.35,
  recency: 0.15,
  novelty: 0.25,
};
