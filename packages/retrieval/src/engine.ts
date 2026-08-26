/**
 * The retrieval engine (design doc §15).
 *
 *   question → policy → metadata filter + lexical + semantic → rerank → bundle
 *
 * Policy runs first and unconditionally. Every later stage operates on the
 * already-filtered slice, so no ranking signal, tuning mistake, or model
 * behaviour can surface something the audience was not entitled to.
 */

import type { Fact, KnowledgeRepository, Project, Skill, Source } from '@par/knowledge';
import type { PolicyEngine } from '@par/policy';
import { LexicalIndex, tokenize } from './lexical.js';
import { extractIntent, intentScore, type Intent } from './intent.js';
import type { VectorIndex } from './embeddings.js';
import {
  DEFAULT_WEIGHTS,
  type EvidenceBundle,
  type RetrievableKind,
  type RetrievalQuery,
  type RetrievalWeights,
  type ScoredItem,
} from './types.js';

interface CorpusEntry {
  id: string;
  kind: RetrievableKind;
  item: Fact | Skill | Project;
  text: string;
  tokens: string[];
  tags: Set<string>;
  /** Fact/skill category, used by the intent stage. */
  category: string | undefined;
  /** Whether the claim is still current. Facts with no end date are ongoing. */
  ongoing: boolean;
}

export interface RetrievalEngineOptions {
  weights?: Partial<RetrievalWeights>;
  vectorIndex?: VectorIndex;
  /** Topical relevance below which an item is dropped as irrelevant. */
  relevanceFloor?: number;
  /** Default number of items returned. */
  defaultLimit?: number;
}

export class RetrievalEngine {
  private readonly weights: RetrievalWeights;
  private readonly relevanceFloor: number;
  private readonly defaultLimit: number;

  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly policy: PolicyEngine,
    private readonly options: RetrievalEngineOptions = {},
  ) {
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights };
    this.relevanceFloor = options.relevanceFloor ?? 0.12;
    this.defaultLimit = options.defaultLimit ?? 8;
  }

  async retrieve(query: RetrievalQuery): Promise<EvidenceBundle> {
    // 1. Policy first. Everything downstream sees only this slice.
    const permitted = this.policy.filterForAudience(this.repository, query.audience);
    const kinds = new Set<RetrievableKind>(query.kinds ?? ['fact', 'skill', 'project']);

    // Entity ids are resolved to their names before indexing. Without this a
    // project tagged `industry_fintech` is invisible to the word "fintech",
    // which is exactly how a recruiter asks about it.
    const resolve = (ids: string[] | undefined): string[] =>
      (ids ?? []).map((id) => this.repository.entity(id)?.name).filter((n): n is string => Boolean(n));

    const corpus: CorpusEntry[] = [];
    if (kinds.has('fact')) for (const f of permitted.facts) corpus.push(factEntry(f));
    if (kinds.has('skill')) for (const s of permitted.skills) corpus.push(skillEntry(s));
    if (kinds.has('project')) {
      for (const p of permitted.projects) {
        corpus.push(projectEntry(p, [
          ...resolve(p.company_id ? [p.company_id] : []),
          ...resolve(p.industry_ids),
          ...resolve(p.tool_ids),
          ...(p.skill_ids ?? []).map((id) => this.repository.skill(id)?.name ?? ''),
        ].filter(Boolean)));
      }
    }

    if (corpus.length === 0) {
      return emptyBundle(query);
    }

    // 2. Lexical.
    const queryTokens = tokenize(query.question);
    const lexicalIndex = new LexicalIndex(corpus.map((e) => ({ id: e.id, tokens: e.tokens })));
    const lexicalScores = lexicalIndex.scoreAll(queryTokens);

    // 3. Semantic, when a provider is configured.
    let semanticScores = new Map<string, number>();
    if (this.options.vectorIndex) {
      try {
        semanticScores = await this.options.vectorIndex.search(query.question);
      } catch {
        // A degraded lexical answer beats a failed turn. The vector layer is
        // an enhancement, never a dependency.
        semanticScores = new Map();
      }
    }

    // 4. Metadata (session context + intent), then the ordering signals.
    const intents = extractIntent(query.question);
    const contextTerms = buildContextTerms(query);
    const shown = new Set(query.alreadyShown ?? []);

    const ranked: ScoredItem[] = corpus.map((entry) => {
      const signals = {
        lexical: lexicalScores.get(entry.id) ?? 0,
        metadata: Math.max(
          metadataScore(entry, contextTerms),
          intentScore(intents, entry.kind, entry.category, entry.ongoing),
        ),
        semantic: semanticScores.get(entry.id) ?? 0,
        authority: this.authorityScore(entry.id),
        recency: recencyScore(entry),
        novelty: shown.has(entry.id) ? 0 : 1,
      };

      // Relevance and ordering are kept separate on purpose. Authority,
      // recency and novelty say which of several relevant items to prefer;
      // they must never be able to push an irrelevant item over the bar. An
      // earlier version summed all six and let a well-sourced, current,
      // never-shown fact clear the floor on those three alone — which meant
      // "does he know Kubernetes?" returned his degree.
      const relevance =
        signals.lexical * this.weights.lexical +
        signals.metadata * this.weights.metadata +
        signals.semantic * this.weights.semantic;

      const ordering =
        signals.authority * this.weights.authority +
        signals.recency * this.weights.recency +
        signals.novelty * this.weights.novelty;

      return { id: entry.id, kind: entry.kind, score: relevance + ordering, relevance, signals, item: entry.item };
    });

    // 5. Rerank and cut on relevance alone, then reserve room for evidence
    //    the agent can actually show.
    const limit = query.limit ?? this.defaultLimit;
    const eligible = ranked
      .filter((r) => r.relevance >= this.relevanceFloor)
      .sort((a, b) => b.score - a.score);
    const survivors = diversifyByKind(eligible, limit);

    // 6. Bundle, with the provenance needed to justify anything said.
    const facts: Fact[] = [];
    const skills: Skill[] = [];
    const projects: Project[] = [];
    for (const r of survivors) {
      if (r.kind === 'fact') facts.push(r.item as Fact);
      else if (r.kind === 'skill') skills.push(r.item as Skill);
      else projects.push(r.item as Project);
    }

    const sources = dedupeSources(
      survivors.flatMap((r) => this.repository.provenanceOf(r.id)),
    );

    return {
      query,
      facts,
      skills,
      projects,
      ranked: survivors,
      sources,
      empty: survivors.length === 0,
    };
  }

  /** Authority level 1 → 1.0, level 4 → 0.25. Unsourced items score 0. */
  private authorityScore(id: string): number {
    const level = this.repository.bestAuthorityFor(id);
    if (level === null) return 0;
    return (5 - level) / 4;
  }
}

/**
 * Guarantees the bundle is not all one kind.
 *
 * Facts are short and keyword-dense, so pure score ordering lets them take
 * every slot — which leaves the agent with plenty to *say* and nothing to
 * *show*, defeating the point of a generative portfolio (§8, §9). Reserving a
 * small number of project and skill slots costs a couple of marginal facts and
 * makes the difference between describing work and rendering it.
 *
 * Only items that already cleared the relevance floor are eligible, so this
 * promotes relevant evidence — it never manufactures it.
 */
function diversifyByKind(eligible: ScoredItem[], limit: number): ScoredItem[] {
  if (eligible.length <= limit) return eligible;

  const RESERVED: Array<{ kind: RetrievableKind; slots: number }> = [
    { kind: 'project', slots: 2 },
    { kind: 'skill', slots: 1 },
  ];

  const selected: ScoredItem[] = [];
  const taken = new Set<string>();

  for (const { kind, slots } of RESERVED) {
    for (const item of eligible.filter((r) => r.kind === kind).slice(0, slots)) {
      selected.push(item);
      taken.add(item.id);
    }
  }

  for (const item of eligible) {
    if (selected.length >= limit) break;
    if (taken.has(item.id)) continue;
    selected.push(item);
    taken.add(item.id);
  }

  // Restore score order so the agent reads the strongest evidence first.
  return selected.slice(0, limit).sort((a, b) => b.score - a.score);
}

function factEntry(f: Fact): CorpusEntry {
  // Notes are indexed but excluded from tags: they carry owner-facing caveats
  // ("do not attribute this to the rebrand") that should be findable without
  // acting as topic labels.
  const text = [f.claim, f.category, f.notes ?? ''].join(' ');
  return {
    id: f.id, kind: 'fact', item: f, text,
    tokens: tokenize(text),
    tags: new Set([f.category, ...tokenize(f.claim)]),
    category: f.category,
    ongoing: f.valid_to === null || f.valid_to === undefined,
  };
}

function skillEntry(s: Skill): CorpusEntry {
  const text = [s.name, s.category, s.proficiency ?? '', s.notes ?? '', ...(s.related_tools ?? [])].join(' ');
  return {
    id: s.id, kind: 'skill', item: s, text,
    tokens: tokenize(text),
    tags: new Set([s.category, ...tokenize(s.name), ...(s.related_projects ?? [])]),
    category: s.category,
    ongoing: true,
  };
}

function projectEntry(p: Project, relatedNames: string[]): CorpusEntry {
  const text = [
    p.name, p.summary, p.problem ?? '',
    ...(p.responsibilities ?? []), ...(p.outcomes ?? []), ...(p.process ?? []),
    ...relatedNames,
  ].join(' ');
  return {
    id: p.id, kind: 'project', item: p, text,
    tokens: tokenize(text),
    tags: new Set([
      ...tokenize(p.name),
      ...relatedNames.flatMap((n) => tokenize(n)),
      ...(p.skill_ids ?? []), ...(p.industry_ids ?? []), ...(p.tool_ids ?? []),
      ...(p.company_id ? [p.company_id] : []),
    ]),
    category: 'portfolio',
    ongoing: true,
  };
}

/**
 * Session context is what makes two recruiters asking the same question get
 * different evidence (design doc §2). Role and priorities weigh more than
 * industry because they change *which work is relevant*, not just its framing.
 */
function buildContextTerms(query: RetrievalQuery): Map<string, number> {
  const terms = new Map<string, number>();
  const add = (text: string | null | undefined, weight: number) => {
    if (!text) return;
    for (const token of tokenize(text)) {
      terms.set(token, Math.max(terms.get(token) ?? 0, weight));
    }
  };
  add(query.context?.role, 1.0);
  for (const p of query.context?.priorities ?? []) add(p, 0.9);
  for (const c of query.context?.concerns ?? []) add(c, 0.8);
  add(query.context?.industry, 0.6);
  return terms;
}

function metadataScore(entry: CorpusEntry, contextTerms: Map<string, number>): number {
  if (contextTerms.size === 0) return 0;
  let total = 0;
  let hits = 0;
  for (const [term, weight] of contextTerms) {
    if (entry.tags.has(term) || entry.tokens.includes(term)) {
      total += weight;
      hits += 1;
    }
  }
  if (hits === 0) return 0;
  // Normalize by the best achievable score so long context does not inflate.
  const ceiling = [...contextTerms.values()].reduce((a, b) => a + b, 0);
  return ceiling === 0 ? 0 : total / ceiling;
}

/** Current roles and recently verified claims outrank stale ones. */
function recencyScore(entry: CorpusEntry): number {
  if (entry.kind !== 'fact') return 0.5;
  const item = entry.item as Partial<Fact>;
  const verified = item.last_verified ? 1 : 0.5;
  return entry.ongoing ? verified : verified * 0.6;
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Map<string, Source>();
  for (const s of sources) if (!seen.has(s.id)) seen.set(s.id, s);
  return [...seen.values()].sort((a, b) => a.authority_level - b.authority_level);
}

function emptyBundle(query: RetrievalQuery): EvidenceBundle {
  return { query, facts: [], skills: [], projects: [], ranked: [], sources: [], empty: true };
}
