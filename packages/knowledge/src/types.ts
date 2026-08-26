/**
 * Types for the canonical knowledge repository.
 *
 * These mirror `schemas/knowledge-schema-v0.2.json`. The JSON Schema stays the
 * portable contract used by the AI export protocol; these types are what the
 * running system compiles against. When you change one, change the other.
 */

/** Access class for every piece of knowledge (design doc §27). */
export type Visibility = 'public' | 'restricted' | 'private' | 'system';

export type VerificationStatus =
  | 'verified'
  | 'needs_verification'
  | 'conflicted'
  | 'rejected';

/** How the claim came to exist, kept separate so inference never masquerades as fact. */
export type KnowledgeType = 'explicit' | 'derived' | 'inferred';

export type EntityType =
  | 'person'
  | 'company'
  | 'institution'
  | 'role'
  | 'industry'
  | 'tool'
  | 'technology'
  | 'project'
  | 'location';

export type FactCategory =
  | 'identity'
  | 'career'
  | 'education'
  | 'achievement'
  | 'responsibility'
  | 'preference'
  | 'working_style'
  | 'tool'
  | 'technology'
  | 'industry'
  | 'metric'
  | 'career_goal'
  | 'portfolio'
  | 'other';

export type SkillCategory =
  | 'product'
  | 'creative'
  | 'leadership'
  | 'ai'
  | 'technical'
  | 'research'
  | 'strategy'
  | 'motion'
  | '3d'
  | 'other';

export type Proficiency = 'foundational' | 'working' | 'advanced' | 'expert' | null;

export type SourceType =
  | 'cv'
  | 'portfolio'
  | 'case_study'
  | 'document'
  | 'ai_memory'
  | 'conversation'
  | 'manual'
  | 'analytics'
  | 'external';

/**
 * Source authority (design doc §12, export protocol "Source Authority").
 * 1 = authoritative (CV, approved case study, manual confirmation)
 * 2 = strong (project documentation, factual work statements)
 * 3 = inferred / AI memory
 * 4 = unverified
 */
export type AuthorityLevel = 1 | 2 | 3 | 4;

export type EvidenceType =
  | 'fact'
  | 'project'
  | 'role'
  | 'source'
  | 'artifact'
  | 'metric'
  | 'testimonial';

export type RelationshipType =
  | 'worked_at'
  | 'held_role'
  | 'worked_on'
  | 'used_skill'
  | 'used_tool'
  | 'demonstrates_skill'
  | 'belongs_to_industry'
  | 'supported_by'
  | 'led'
  | 'managed'
  | 'contributed_to'
  | 'related_to';

export type MediaType = 'image' | 'video' | 'prototype' | 'document' | 'link' | 'other';

export interface SourceRef {
  source_id: string;
  locator?: string;
  quote_or_excerpt?: string;
  /** 0–1. How much this particular citation supports the claim. */
  reliability?: number;
}

export interface EvidenceRef {
  type: EvidenceType;
  reference_id: string;
  /** 0–1. How strongly this evidence supports the thing it is attached to. */
  strength?: number;
  note?: string;
}

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  aliases?: string[];
  description?: string;
  visibility?: Visibility;
}

export interface Fact {
  id: string;
  claim: string;
  category: FactCategory;
  knowledge_type: KnowledgeType;
  confidence: number;
  verification_status: VerificationStatus;
  visibility: Visibility;
  sources: SourceRef[];
  evidence?: EvidenceRef[];
  valid_from?: string | null;
  valid_to?: string | null;
  last_verified?: string | null;
  notes?: string;
}

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  proficiency?: Proficiency;
  confidence: number;
  verification_status: VerificationStatus;
  visibility: Visibility;
  evidence: EvidenceRef[];
  related_tools?: string[];
  related_projects?: string[];
  notes?: string;
}

export interface Metric {
  label: string;
  value: string;
  source_id?: string | null;
  verified?: boolean;
}

export interface Media {
  type: MediaType;
  uri: string;
  caption?: string;
  visibility?: Visibility;
}

export interface Project {
  id: string;
  name: string;
  company_id?: string | null;
  role_ids?: string[];
  summary: string;
  problem?: string;
  responsibilities?: string[];
  process?: string[];
  outcomes?: string[];
  metrics?: Metric[];
  skill_ids?: string[];
  tool_ids?: string[];
  industry_ids?: string[];
  media?: Media[];
  sources?: SourceRef[];
  verification_status: VerificationStatus;
  visibility: Visibility;
  notes?: string;
}

export interface Source {
  id: string;
  type: SourceType;
  name: string;
  authority_level: AuthorityLevel;
  uri?: string | null;
  date?: string | null;
  notes?: string;
}

export interface Relationship {
  id: string;
  from_id: string;
  type: RelationshipType;
  to_id: string;
  confidence?: number;
  source_ids?: string[];
}

export interface Conflict {
  id: string;
  topic: string;
  candidate_claim_ids: string[];
  status: 'open' | 'resolved';
  resolution?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
}

export interface Unknown {
  id: string;
  topic: string;
  reason: string;
  suggested_source?: string;
}

export interface KnowledgeMetadata {
  schema_version: '0.2';
  subject_id: string;
  generated_at: string;
  generated_by?: string;
  notes?: string;
}

/**
 * One knowledge document. Both a source export (a ChatGPT memory dump, a CV
 * extraction) and the canonical repository use this same shape — the
 * difference is provenance and review state, not structure.
 */
export interface KnowledgeBase {
  metadata: KnowledgeMetadata;
  entities: Entity[];
  facts: Fact[];
  skills: Skill[];
  projects: Project[];
  sources: Source[];
  relationships: Relationship[];
  conflicts?: Conflict[];
  unknowns?: Unknown[];
}

/** Anything in the repository that carries a visibility class. */
export type KnowledgeItem = Fact | Skill | Project | Entity;

export const VISIBILITY_ORDER: Record<Visibility, number> = {
  public: 0,
  restricted: 1,
  private: 2,
  system: 3,
};
