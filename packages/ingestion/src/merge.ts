/**
 * Staging merge (design doc §13).
 *
 *   sources → normalize → deduplicate → detect conflicts → human review → publish
 *
 * This module implements everything up to the arrow that a person has to walk
 * through. It produces a *staging* knowledge base and a review queue; it never
 * writes canonical knowledge. Promotion is a human act, recorded in a
 * changelog, which is what makes "verified" mean anything downstream.
 */

import type { AuthorityLevel, Fact, KnowledgeBase, Project, Skill, Source } from '@par/knowledge';
import { detectConflicts, type DetectedConflict } from './conflicts.js';
import { normalizeName, type NormalizedSourceDocument } from './normalize.js';

export interface MergeResult {
  /** Everything from every source, deduplicated. Not yet canonical. */
  staging: KnowledgeBase;
  conflicts: DetectedConflict[];
  /** Items that need a human decision before they can be published. */
  reviewQueue: ReviewItem[];
  stats: {
    documents: number;
    facts: number;
    skills: number;
    projects: number;
    duplicatesCollapsed: number;
  };
}

export interface ReviewItem {
  kind: 'conflict' | 'unverified_claim' | 'unsourced_skill' | 'authority_upgrade';
  id: string;
  summary: string;
  detail: string;
}

function dedupe<T extends { id: string }>(
  items: Array<{ item: T; authority: number }>,
  onCollapse: () => void,
): T[] {
  const byId = new Map<string, { item: T; authority: number }>();
  for (const entry of items) {
    const existing = byId.get(entry.item.id);
    if (!existing) {
      byId.set(entry.item.id, entry);
      continue;
    }
    onCollapse();
    // Lower authority number wins. Ties keep the first, which is stable given
    // documents are processed in a deterministic order.
    if (entry.authority < existing.authority) byId.set(entry.item.id, entry);
  }
  return [...byId.values()].map((e) => e.item);
}

export function mergeDocuments(
  documents: NormalizedSourceDocument[],
  subjectId: string,
  generatedAt: string,
): MergeResult {
  let duplicatesCollapsed = 0;
  const collapse = () => { duplicatesCollapsed += 1; };

  // Process strongest sources first so ties resolve toward authority.
  const ordered = [...documents].sort((a, b) => a.authority - b.authority);

  const facts = dedupe<Fact>(
    ordered.flatMap((d) => d.base.facts.map((item) => ({ item, authority: d.authority }))),
    collapse,
  );
  const skills = dedupe<Skill>(
    ordered.flatMap((d) => d.base.skills.map((item) => ({ item, authority: d.authority }))),
    collapse,
  );
  const projects = dedupe<Project>(
    ordered.flatMap((d) => d.base.projects.map((item) => ({ item, authority: d.authority }))),
    collapse,
  );
  const sources = dedupe<Source>(
    ordered.flatMap((d) => d.base.sources.map((item) => ({ item, authority: d.authority }))),
    collapse,
  );

  // Entities also merge by normalized name, since two exports routinely spell
  // the same company differently.
  const entitiesByName = new Map<string, (typeof ordered)[number]['base']['entities'][number]>();
  for (const doc of ordered) {
    for (const entity of doc.base.entities) {
      const key = normalizeName(entity.name);
      const existing = entitiesByName.get(key);
      if (!existing) {
        entitiesByName.set(key, entity);
      } else {
        duplicatesCollapsed += 1;
        const aliases = new Set([...(existing.aliases ?? []), ...(entity.aliases ?? [])]);
        entitiesByName.set(key, { ...existing, aliases: [...aliases] });
      }
    }
  }

  const relationships = dedupe(
    ordered.flatMap((d) => d.base.relationships.map((item) => ({ item, authority: d.authority }))),
    collapse,
  );

  const conflicts = detectConflicts(ordered);

  const staging: KnowledgeBase = {
    metadata: {
      schema_version: '0.2',
      subject_id: subjectId,
      generated_at: generatedAt,
      generated_by: 'ingestion/merge',
      notes:
        'STAGING. Merged from ' +
        ordered.map((d) => d.origin).join(', ') +
        '. Not canonical — requires human review before publication.',
    },
    entities: [...entitiesByName.values()],
    facts,
    skills,
    projects,
    sources,
    relationships,
    conflicts: conflicts.map((c) => ({
      id: c.id,
      topic: c.topic,
      candidate_claim_ids: c.candidates.map((cand) => cand.fact.id),
      status: 'open' as const,
      resolution: null,
      resolved_by: null,
      resolved_at: null,
    })),
    unknowns: ordered.flatMap((d) => d.base.unknowns ?? []),
  };

  return {
    staging,
    conflicts,
    reviewQueue: buildReviewQueue(staging, conflicts),
    stats: {
      documents: ordered.length,
      facts: facts.length,
      skills: skills.length,
      projects: projects.length,
      duplicatesCollapsed,
    },
  };
}

function buildReviewQueue(staging: KnowledgeBase, conflicts: DetectedConflict[]): ReviewItem[] {
  const queue: ReviewItem[] = [];

  for (const conflict of conflicts) {
    queue.push({
      kind: 'conflict',
      id: conflict.id,
      summary: `Conflicting claims about ${conflict.topic}`,
      detail: conflict.candidates.map((c) => `${c.origin}: ${c.fact.claim}`).join('\n'),
    });
  }

  for (const fact of staging.facts) {
    if (fact.visibility !== 'public') continue;
    if (fact.verification_status === 'verified') continue;
    queue.push({
      kind: 'unverified_claim',
      id: fact.id,
      summary: `Public but unverified: ${fact.claim.slice(0, 80)}`,
      detail: `knowledge_type=${fact.knowledge_type}, confidence=${fact.confidence}. ` +
        'A public claim the agent may repeat to recruiters should be verified first.',
    });
  }

  for (const skill of staging.skills) {
    if (skill.evidence.length > 0) continue;
    queue.push({
      kind: 'unsourced_skill',
      id: skill.id,
      summary: `Skill without evidence: ${skill.name}`,
      detail: 'Attach a project, role, or source, or lower confidence and mark it needs_verification.',
    });
  }

  // A claim that only ever came from AI memory should not quietly acquire the
  // authority of the CV just because it survived the merge.
  for (const fact of staging.facts) {
    const levels = fact.sources
      .map((ref) => staging.sources.find((s) => s.id === ref.source_id)?.authority_level)
      .filter((l): l is AuthorityLevel => typeof l === 'number');
    if (levels.length && Math.min(...levels) >= 3 && fact.verification_status === 'verified') {
      queue.push({
        kind: 'authority_upgrade',
        id: fact.id,
        summary: `Level-3 source marked verified: ${fact.claim.slice(0, 80)}`,
        detail: 'AI memory is a source, not truth. Confirm against the CV, a case study, or the owner.',
      });
    }
  }

  return queue;
}
