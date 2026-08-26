/**
 * An indexed, read-only view over a loaded knowledge base.
 *
 * Nothing here applies policy. The repository is the *whole* truth; the policy
 * layer decides which slice of it a given audience is allowed to see. Keeping
 * those separate is what makes the visibility model enforceable rather than
 * advisory (design doc §25, §27).
 */

import type {
  Entity, Fact, KnowledgeBase, Project, Relationship, Skill, Source, RelationshipType,
} from './types.js';
import type { ProjectEvidence } from './portfolio.js';

export class KnowledgeRepository {
  readonly base: KnowledgeBase;
  readonly evidence: ReadonlyMap<string, ProjectEvidence>;

  private readonly entityById: Map<string, Entity>;
  private readonly factById: Map<string, Fact>;
  private readonly skillById: Map<string, Skill>;
  private readonly projectById: Map<string, Project>;
  private readonly sourceById: Map<string, Source>;
  private readonly outgoing: Map<string, Relationship[]>;
  private readonly incoming: Map<string, Relationship[]>;

  constructor(base: KnowledgeBase, evidence: ProjectEvidence[] = []) {
    this.base = base;
    this.evidence = new Map(evidence.map((e) => [e.id, e]));
    this.entityById = new Map(base.entities.map((e) => [e.id, e]));
    this.factById = new Map(base.facts.map((f) => [f.id, f]));
    this.skillById = new Map(base.skills.map((s) => [s.id, s]));
    this.projectById = new Map(base.projects.map((p) => [p.id, p]));
    this.sourceById = new Map(base.sources.map((s) => [s.id, s]));

    this.outgoing = new Map();
    this.incoming = new Map();
    for (const rel of base.relationships) {
      push(this.outgoing, rel.from_id, rel);
      push(this.incoming, rel.to_id, rel);
    }
  }

  get subjectId(): string {
    return this.base.metadata.subject_id;
  }

  get subject(): Entity | undefined {
    return this.entityById.get(this.subjectId);
  }

  entity(id: string): Entity | undefined { return this.entityById.get(id); }
  fact(id: string): Fact | undefined { return this.factById.get(id); }
  skill(id: string): Skill | undefined { return this.skillById.get(id); }
  project(id: string): Project | undefined { return this.projectById.get(id); }
  source(id: string): Source | undefined { return this.sourceById.get(id); }
  projectEvidence(id: string): ProjectEvidence | undefined { return this.evidence.get(id); }

  get facts(): readonly Fact[] { return this.base.facts; }
  get skills(): readonly Skill[] { return this.base.skills; }
  get projects(): readonly Project[] { return this.base.projects; }
  get entities(): readonly Entity[] { return this.base.entities; }
  get sources(): readonly Source[] { return this.base.sources; }

  /** Relationships leaving `id`, optionally narrowed to one type. */
  relationsFrom(id: string, type?: RelationshipType): Relationship[] {
    const all = this.outgoing.get(id) ?? [];
    return type ? all.filter((r) => r.type === type) : all;
  }

  /** Relationships arriving at `id`, optionally narrowed to one type. */
  relationsTo(id: string, type?: RelationshipType): Relationship[] {
    const all = this.incoming.get(id) ?? [];
    return type ? all.filter((r) => r.type === type) : all;
  }

  /**
   * Resolves the citation trail behind a claim so an answer can say *why* the
   * system believes something (design doc §12, §28).
   */
  provenanceOf(id: string): Source[] {
    const item = this.factById.get(id) ?? this.projectById.get(id);
    const ids = new Set<string>();
    for (const ref of item?.sources ?? []) ids.add(ref.source_id);

    const skill = this.skillById.get(id);
    for (const ev of skill?.evidence ?? []) {
      if (ev.type === 'source') ids.add(ev.reference_id);
      if (ev.type === 'fact') {
        for (const ref of this.factById.get(ev.reference_id)?.sources ?? []) ids.add(ref.source_id);
      }
    }
    for (const rel of this.relationsFrom(id, 'supported_by')) ids.add(rel.to_id);

    return [...ids].map((sid) => this.sourceById.get(sid)).filter((s): s is Source => Boolean(s));
  }

  /** The highest authority (lowest numeric level) backing a claim, if any. */
  bestAuthorityFor(id: string): number | null {
    const levels = this.provenanceOf(id).map((s) => s.authority_level);
    return levels.length ? Math.min(...levels) : null;
  }

  /** Projects that demonstrate a given skill, via explicit relationships or project metadata. */
  projectsDemonstrating(skillId: string): Project[] {
    const viaRelationships = this.relationsTo(skillId, 'demonstrates_skill')
      .map((r) => this.projectById.get(r.from_id))
      .filter((p): p is Project => Boolean(p));
    const viaMetadata = this.base.projects.filter((p) => p.skill_ids?.includes(skillId));
    return dedupeById([...viaRelationships, ...viaMetadata]);
  }

  /** Skills a project is declared to demonstrate. */
  skillsDemonstratedBy(projectId: string): Skill[] {
    const project = this.projectById.get(projectId);
    const viaMetadata = (project?.skill_ids ?? [])
      .map((id) => this.skillById.get(id))
      .filter((s): s is Skill => Boolean(s));
    const viaRelationships = this.relationsFrom(projectId, 'demonstrates_skill')
      .map((r) => this.skillById.get(r.to_id))
      .filter((s): s is Skill => Boolean(s));
    return dedupeById([...viaMetadata, ...viaRelationships]);
  }
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}
