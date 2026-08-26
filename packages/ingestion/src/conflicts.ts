/**
 * Conflict detection across source documents (design doc §13).
 *
 * The governing rule: **conflicting information is never silently resolved by
 * a model.** This module's job is to *find* disagreements and hand them to a
 * human with a recommendation attached — not to pick a winner. A wrong
 * auto-resolution becomes a confident, verified-looking falsehood that the
 * agent will then repeat to recruiters.
 */

import type { Fact, KnowledgeBase } from '@par/knowledge';
import { normalizeName } from './normalize.js';

export interface ClaimCandidate {
  origin: string;
  authority: number;
  fact: Fact;
  /** Numeric values found in the claim, used to spot quantitative disagreement. */
  numbers: number[];
}

export interface DetectedConflict {
  id: string;
  topic: string;
  candidates: ClaimCandidate[];
  /** What the authority hierarchy suggests. Advisory only — status stays open. */
  recommendation: string;
  /** Always 'open'. Only a human sets this to resolved. */
  status: 'open';
  kind: 'quantitative' | 'categorical' | 'temporal';
}

const NUMBER_PATTERN = /\b(\d+(?:\.\d+)?)\s*(?:%|percent|\+)?/g;

export function extractNumbers(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const value = Number(match[1]);
    // Bare four-digit values are almost always years, not quantities under
    // dispute; treating "2020" as a conflicting metric produces pure noise.
    if (Number.isFinite(value) && !(value >= 1900 && value <= 2100)) found.push(value);
  }
  return found;
}

/**
 * A coarse topic key. Facts about the same category and the same named entity
 * are treated as talking about the same thing, which is deliberately broad:
 * a false grouping costs a human one glance, a missed grouping ships a
 * contradiction.
 */
export function topicKey(fact: Fact, entityNames: Map<string, string>): string {
  const claim = normalizeName(fact.claim);
  const mentioned: string[] = [];
  for (const [normalized, id] of entityNames) {
    if (normalized.length > 2 && claim.includes(normalized)) mentioned.push(id);
  }
  mentioned.sort();
  return `${fact.category}::${mentioned.join('+') || 'general'}`;
}

function buildEntityNameIndex(documents: Array<{ base: KnowledgeBase }>): Map<string, string> {
  const index = new Map<string, string>();
  for (const doc of documents) {
    for (const entity of doc.base.entities) {
      index.set(normalizeName(entity.name), entity.id);
      for (const alias of entity.aliases ?? []) index.set(normalizeName(alias), entity.id);
    }
  }
  return index;
}

function classify(candidates: ClaimCandidate[]): DetectedConflict['kind'] | null {
  const numberSets = candidates.map((c) => c.numbers.join(','));
  if (new Set(numberSets).size > 1 && candidates.some((c) => c.numbers.length > 0)) {
    return 'quantitative';
  }

  const ranges = candidates.map((c) => `${c.fact.valid_from ?? '?'}→${c.fact.valid_to ?? '?'}`);
  if (new Set(ranges).size > 1) return 'temporal';

  const claims = candidates.map((c) => normalizeName(c.fact.claim));
  // Containment means one export is simply more detailed than another, which
  // is a merge, not a conflict.
  const distinct = claims.filter((a, i) => !claims.some((b, j) => j !== i && b.includes(a)));
  if (new Set(distinct).size > 1) return 'categorical';

  return null;
}

function recommend(candidates: ClaimCandidate[]): string {
  const sorted = [...candidates].sort((a, b) => a.authority - b.authority);
  const best = sorted[0];
  const runnerUp = sorted[1];
  if (!best) return 'No candidates.';

  if (runnerUp && best.authority === runnerUp.authority) {
    return `Sources are of equal authority (level ${best.authority}). A human must choose the canonical value.`;
  }
  return (
    `Authority favours "${best.origin}" (level ${best.authority}) over ` +
    `"${runnerUp?.origin ?? 'others'}" (level ${runnerUp?.authority ?? 'n/a'}). ` +
    `This is a recommendation, not a resolution — confirm before promoting to canonical.`
  );
}

export function detectConflicts(
  documents: Array<{ origin: string; authority: number; base: KnowledgeBase }>,
): DetectedConflict[] {
  const entityNames = buildEntityNameIndex(documents);
  const groups = new Map<string, ClaimCandidate[]>();

  for (const doc of documents) {
    for (const fact of doc.base.facts) {
      const key = topicKey(fact, entityNames);
      const candidate: ClaimCandidate = {
        origin: doc.origin,
        authority: doc.authority,
        fact,
        numbers: extractNumbers(fact.claim),
      };
      const existing = groups.get(key);
      if (existing) existing.push(candidate);
      else groups.set(key, [candidate]);
    }
  }

  const conflicts: DetectedConflict[] = [];
  for (const [key, candidates] of groups) {
    // Two claims from the same document are a redundancy problem, not a conflict.
    if (new Set(candidates.map((c) => c.origin)).size < 2) continue;

    const kind = classify(candidates);
    if (!kind) continue;

    conflicts.push({
      id: `conflict_${key.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
      topic: key,
      candidates,
      recommendation: recommend(candidates),
      status: 'open',
      kind,
    });
  }

  return conflicts.sort((a, b) => a.id.localeCompare(b.id));
}

export function formatConflictReport(conflicts: DetectedConflict[]): string {
  if (conflicts.length === 0) return 'No conflicts detected.';

  const lines = [`# Detected conflicts (${conflicts.length})`, ''];
  for (const conflict of conflicts) {
    lines.push(`## ${conflict.topic}  _(${conflict.kind})_`);
    for (const candidate of conflict.candidates) {
      lines.push(
        `- **${candidate.origin}** (authority ${candidate.authority}, ` +
          `${candidate.fact.knowledge_type}, confidence ${candidate.fact.confidence}): ${candidate.fact.claim}`,
      );
    }
    lines.push('');
    lines.push(`_Recommendation:_ ${conflict.recommendation}`);
    lines.push('');
    lines.push('**Owner action required:** `[Accept higher authority]` `[Accept alternative]` `[Enter canonical value]`');
    lines.push('');
  }
  return lines.join('\n');
}
