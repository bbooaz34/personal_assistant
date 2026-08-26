/**
 * Normalization for incoming source documents (design doc §13).
 *
 * Each AI system, the CV parser, and manual entry all produce the same schema
 * but with slightly different habits — trailing whitespace, inconsistent
 * casing in ids, an entity named "Holon Institute of Technology (HIT)" in one
 * export and "Holon Institute of Technology" in another. Normalizing here
 * means the conflict detector compares claims, not formatting.
 */

import type { Entity, KnowledgeBase, Source } from '@par/knowledge';

export interface NormalizedSourceDocument {
  /** Which import this came from, e.g. `chatgpt-export-v0.2.json`. */
  origin: string;
  base: KnowledgeBase;
  /** Lowest (strongest) authority level present in the document. */
  authority: number;
}

export function normalizeId(id: string): string {
  return id.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_.]/g, '');
}

/** Strips parenthetical aliases and collapses whitespace for entity matching. */
export function normalizeName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Names an entity goes by, including anything hiding in parentheses in its display name. */
export function entityAliases(entity: Entity): Set<string> {
  const aliases = new Set<string>([normalizeName(entity.name)]);
  for (const alias of entity.aliases ?? []) aliases.add(normalizeName(alias));
  const parenthetical = /\(([^)]+)\)/.exec(entity.name);
  if (parenthetical?.[1]) aliases.add(normalizeName(parenthetical[1]));
  return aliases;
}

function strongestAuthority(sources: Source[]): number {
  if (sources.length === 0) return 4;
  return Math.min(...sources.map((s) => s.authority_level));
}

export function normalizeDocument(origin: string, base: KnowledgeBase): NormalizedSourceDocument {
  const normalized: KnowledgeBase = {
    ...base,
    entities: base.entities.map((e) => ({
      ...e,
      id: normalizeId(e.id),
      name: e.name.trim(),
      aliases: [...entityAliases(e)].filter((a) => a !== normalizeName(e.name)),
    })),
    facts: base.facts.map((f) => ({
      ...f,
      id: normalizeId(f.id),
      claim: f.claim.trim().replace(/\s+/g, ' '),
      sources: f.sources.map((s) => ({ ...s, source_id: normalizeId(s.source_id) })),
      evidence: f.evidence?.map((e) => ({ ...e, reference_id: normalizeId(e.reference_id) })),
    })),
    skills: base.skills.map((s) => ({
      ...s,
      id: normalizeId(s.id),
      name: s.name.trim(),
      evidence: s.evidence.map((e) => ({ ...e, reference_id: normalizeId(e.reference_id) })),
    })),
    projects: base.projects.map((p) => ({
      ...p,
      id: normalizeId(p.id),
      name: p.name.trim(),
      summary: p.summary.trim().replace(/\s+/g, ' '),
    })),
    sources: base.sources.map((s) => ({ ...s, id: normalizeId(s.id) })),
    relationships: base.relationships.map((r) => ({
      ...r,
      id: normalizeId(r.id),
      from_id: normalizeId(r.from_id),
      to_id: normalizeId(r.to_id),
      source_ids: r.source_ids?.map(normalizeId),
    })),
  };

  return { origin, base: normalized, authority: strongestAuthority(normalized.sources) };
}
