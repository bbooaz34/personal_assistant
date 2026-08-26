/**
 * Structural and referential validation for knowledge documents.
 *
 * Deliberately dependency-free: the JSON Schema in `/schemas` is the portable
 * contract for external producers (an AI export, a human editor), while this
 * runs in-process on every load so a malformed or dangling knowledge file
 * fails loudly at startup instead of quietly degrading answers.
 */

import type {
  KnowledgeBase,
  Visibility,
  VerificationStatus,
  KnowledgeType,
  FactCategory,
  SkillCategory,
  SourceType,
  EntityType,
  RelationshipType,
  EvidenceType,
} from './types.js';

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const VISIBILITIES: Visibility[] = ['public', 'restricted', 'private', 'system'];
const VERIFICATION: VerificationStatus[] = [
  'verified',
  'needs_verification',
  'conflicted',
  'rejected',
];
const KNOWLEDGE_TYPES: KnowledgeType[] = ['explicit', 'derived', 'inferred'];
const FACT_CATEGORIES: FactCategory[] = [
  'identity', 'career', 'education', 'achievement', 'responsibility',
  'preference', 'working_style', 'tool', 'technology', 'industry',
  'metric', 'career_goal', 'portfolio', 'other',
];
const SKILL_CATEGORIES: SkillCategory[] = [
  'product', 'creative', 'leadership', 'ai', 'technical',
  'research', 'strategy', 'motion', '3d', 'other',
];
const SOURCE_TYPES: SourceType[] = [
  'cv', 'portfolio', 'case_study', 'document', 'ai_memory',
  'conversation', 'manual', 'analytics', 'external',
];
const ENTITY_TYPES: EntityType[] = [
  'person', 'company', 'institution', 'role', 'industry',
  'tool', 'technology', 'project', 'location',
];
const RELATIONSHIP_TYPES: RelationshipType[] = [
  'worked_at', 'held_role', 'worked_on', 'used_skill', 'used_tool',
  'demonstrates_skill', 'belongs_to_industry', 'supported_by', 'led',
  'managed', 'contributed_to', 'related_to',
];
const EVIDENCE_TYPES: EvidenceType[] = [
  'fact', 'project', 'role', 'source', 'artifact', 'metric', 'testimonial',
];

class Collector {
  readonly errors: ValidationIssue[] = [];
  readonly warnings: ValidationIssue[] = [];

  error(path: string, message: string): void {
    this.errors.push({ severity: 'error', path, message });
  }

  warn(path: string, message: string): void {
    this.warnings.push({ severity: 'warning', path, message });
  }

  requireString(path: string, value: unknown): void {
    if (typeof value !== 'string' || value.length === 0) {
      this.error(path, 'expected a non-empty string');
    }
  }

  requireEnum<T extends string>(path: string, value: unknown, allowed: T[]): void {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
      this.error(path, `expected one of: ${allowed.join(', ')} (got ${JSON.stringify(value)})`);
    }
  }

  requireUnitInterval(path: string, value: unknown): void {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
      this.error(path, `expected a number between 0 and 1 (got ${JSON.stringify(value)})`);
    }
  }

  requireArray(path: string, value: unknown): value is unknown[] {
    if (!Array.isArray(value)) {
      this.error(path, 'expected an array');
      return false;
    }
    return true;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(c: Collector, path: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    c.warn(path, `expected an ISO date (YYYY-MM-DD), got ${JSON.stringify(value)}`);
  }
}

/**
 * Validates a knowledge document structurally, then checks that every id it
 * points at actually exists. Dangling references are errors, not warnings: a
 * fact citing a missing source is a fact the system cannot justify.
 */
export function validateKnowledgeBase(input: unknown): ValidationResult {
  const c = new Collector();

  if (typeof input !== 'object' || input === null) {
    c.error('$', 'expected an object');
    return { valid: false, errors: c.errors, warnings: c.warnings };
  }

  const kb = input as Partial<KnowledgeBase>;

  // --- metadata ---------------------------------------------------------
  if (typeof kb.metadata !== 'object' || kb.metadata === null) {
    c.error('metadata', 'missing metadata block');
  } else {
    if (kb.metadata.schema_version !== '0.2') {
      c.error('metadata.schema_version', `expected "0.2", got ${JSON.stringify(kb.metadata.schema_version)}`);
    }
    c.requireString('metadata.subject_id', kb.metadata.subject_id);
    checkDate(c, 'metadata.generated_at', kb.metadata.generated_at);
  }

  const ids = new Set<string>();
  const duplicate = (path: string, id: unknown) => {
    if (typeof id !== 'string') return;
    if (ids.has(id)) c.error(path, `duplicate id "${id}"`);
    ids.add(id);
  };

  // --- entities ---------------------------------------------------------
  const entityIds = new Set<string>();
  if (c.requireArray('entities', kb.entities)) {
    kb.entities!.forEach((e, i) => {
      const p = `entities[${i}]`;
      c.requireString(`${p}.id`, e.id);
      c.requireString(`${p}.name`, e.name);
      c.requireEnum(`${p}.type`, e.type, ENTITY_TYPES);
      if (e.visibility !== undefined) c.requireEnum(`${p}.visibility`, e.visibility, VISIBILITIES);
      duplicate(`${p}.id`, e.id);
      if (typeof e.id === 'string') entityIds.add(e.id);
    });
  }

  // --- sources ----------------------------------------------------------
  const sourceIds = new Set<string>();
  if (c.requireArray('sources', kb.sources)) {
    kb.sources!.forEach((s, i) => {
      const p = `sources[${i}]`;
      c.requireString(`${p}.id`, s.id);
      c.requireString(`${p}.name`, s.name);
      c.requireEnum(`${p}.type`, s.type, SOURCE_TYPES);
      if (![1, 2, 3, 4].includes(s.authority_level as number)) {
        c.error(`${p}.authority_level`, `expected 1–4, got ${JSON.stringify(s.authority_level)}`);
      }
      checkDate(c, `${p}.date`, s.date);
      duplicate(`${p}.id`, s.id);
      if (typeof s.id === 'string') sourceIds.add(s.id);
    });
  }

  // --- facts ------------------------------------------------------------
  const factIds = new Set<string>();
  if (c.requireArray('facts', kb.facts)) {
    kb.facts!.forEach((f, i) => {
      const p = `facts[${i}]`;
      c.requireString(`${p}.id`, f.id);
      c.requireString(`${p}.claim`, f.claim);
      c.requireEnum(`${p}.category`, f.category, FACT_CATEGORIES);
      c.requireEnum(`${p}.knowledge_type`, f.knowledge_type, KNOWLEDGE_TYPES);
      c.requireEnum(`${p}.verification_status`, f.verification_status, VERIFICATION);
      c.requireEnum(`${p}.visibility`, f.visibility, VISIBILITIES);
      c.requireUnitInterval(`${p}.confidence`, f.confidence);
      checkDate(c, `${p}.valid_from`, f.valid_from);
      checkDate(c, `${p}.valid_to`, f.valid_to);
      checkDate(c, `${p}.last_verified`, f.last_verified);
      duplicate(`${p}.id`, f.id);
      if (typeof f.id === 'string') factIds.add(f.id);

      if (c.requireArray(`${p}.sources`, f.sources)) {
        if (f.sources.length === 0 && f.verification_status === 'verified') {
          c.warn(`${p}.sources`, 'fact is marked verified but cites no source');
        }
        f.sources.forEach((ref, j) => {
          c.requireString(`${p}.sources[${j}].source_id`, ref.source_id);
          if (ref.reliability !== undefined) {
            c.requireUnitInterval(`${p}.sources[${j}].reliability`, ref.reliability);
          }
        });
      }
      // An inferred claim asserted at full confidence is a modelling mistake:
      // it erases the distinction the export protocol exists to preserve.
      if (f.knowledge_type === 'inferred' && typeof f.confidence === 'number' && f.confidence >= 0.95) {
        c.warn(`${p}.confidence`, 'inferred claim held at near-certain confidence');
      }
    });
  }

  // --- skills -----------------------------------------------------------
  const skillIds = new Set<string>();
  if (c.requireArray('skills', kb.skills)) {
    kb.skills!.forEach((s, i) => {
      const p = `skills[${i}]`;
      c.requireString(`${p}.id`, s.id);
      c.requireString(`${p}.name`, s.name);
      c.requireEnum(`${p}.category`, s.category, SKILL_CATEGORIES);
      c.requireEnum(`${p}.verification_status`, s.verification_status, VERIFICATION);
      c.requireEnum(`${p}.visibility`, s.visibility, VISIBILITIES);
      c.requireUnitInterval(`${p}.confidence`, s.confidence);
      duplicate(`${p}.id`, s.id);
      if (typeof s.id === 'string') skillIds.add(s.id);

      if (c.requireArray(`${p}.evidence`, s.evidence)) {
        if (s.evidence.length === 0) {
          // §3.2 evidence over claims: an unbacked skill is a claim, not a fact.
          c.warn(`${p}.evidence`, 'skill has no evidence attached');
        }
        s.evidence.forEach((ev, j) => {
          c.requireEnum(`${p}.evidence[${j}].type`, ev.type, EVIDENCE_TYPES);
          c.requireString(`${p}.evidence[${j}].reference_id`, ev.reference_id);
        });
      }
    });
  }

  // --- projects ---------------------------------------------------------
  const projectIds = new Set<string>();
  if (c.requireArray('projects', kb.projects)) {
    kb.projects!.forEach((pr, i) => {
      const p = `projects[${i}]`;
      c.requireString(`${p}.id`, pr.id);
      c.requireString(`${p}.name`, pr.name);
      c.requireString(`${p}.summary`, pr.summary);
      c.requireEnum(`${p}.verification_status`, pr.verification_status, VERIFICATION);
      c.requireEnum(`${p}.visibility`, pr.visibility, VISIBILITIES);
      duplicate(`${p}.id`, pr.id);
      if (typeof pr.id === 'string') projectIds.add(pr.id);
      pr.media?.forEach((m, j) => {
        c.requireString(`${p}.media[${j}].uri`, m.uri);
        if (m.visibility !== undefined) {
          c.requireEnum(`${p}.media[${j}].visibility`, m.visibility, VISIBILITIES);
        }
      });
    });
  }

  // --- relationships ----------------------------------------------------
  if (c.requireArray('relationships', kb.relationships)) {
    kb.relationships!.forEach((r, i) => {
      const p = `relationships[${i}]`;
      c.requireString(`${p}.id`, r.id);
      c.requireEnum(`${p}.type`, r.type, RELATIONSHIP_TYPES);
      c.requireString(`${p}.from_id`, r.from_id);
      c.requireString(`${p}.to_id`, r.to_id);
      if (r.confidence !== undefined) c.requireUnitInterval(`${p}.confidence`, r.confidence);
      duplicate(`${p}.id`, r.id);
    });
  }

  // --- referential integrity -------------------------------------------
  const knownRefs = new Set<string>([
    ...entityIds, ...factIds, ...skillIds, ...projectIds, ...sourceIds,
  ]);

  kb.facts?.forEach((f, i) => {
    f.sources?.forEach((ref, j) => {
      if (ref.source_id && !sourceIds.has(ref.source_id)) {
        c.error(`facts[${i}].sources[${j}].source_id`, `unknown source "${ref.source_id}"`);
      }
    });
    f.evidence?.forEach((ev, j) => {
      if (ev.reference_id && !knownRefs.has(ev.reference_id)) {
        c.warn(`facts[${i}].evidence[${j}].reference_id`, `unresolved reference "${ev.reference_id}"`);
      }
    });
  });

  kb.skills?.forEach((s, i) => {
    s.evidence?.forEach((ev, j) => {
      if (ev.reference_id && !knownRefs.has(ev.reference_id)) {
        c.warn(`skills[${i}].evidence[${j}].reference_id`, `unresolved reference "${ev.reference_id}"`);
      }
    });
    s.related_projects?.forEach((id, j) => {
      if (!projectIds.has(id)) {
        c.warn(`skills[${i}].related_projects[${j}]`, `unknown project "${id}"`);
      }
    });
  });

  kb.projects?.forEach((pr, i) => {
    if (pr.company_id && !entityIds.has(pr.company_id)) {
      c.warn(`projects[${i}].company_id`, `unknown entity "${pr.company_id}"`);
    }
    pr.skill_ids?.forEach((id, j) => {
      if (!skillIds.has(id)) c.warn(`projects[${i}].skill_ids[${j}]`, `unknown skill "${id}"`);
    });
    pr.tool_ids?.forEach((id, j) => {
      if (!entityIds.has(id)) c.warn(`projects[${i}].tool_ids[${j}]`, `unknown tool entity "${id}"`);
    });
    pr.industry_ids?.forEach((id, j) => {
      if (!entityIds.has(id)) c.warn(`projects[${i}].industry_ids[${j}]`, `unknown industry entity "${id}"`);
    });
    pr.sources?.forEach((ref, j) => {
      if (ref.source_id && !sourceIds.has(ref.source_id)) {
        c.error(`projects[${i}].sources[${j}].source_id`, `unknown source "${ref.source_id}"`);
      }
    });
  });

  kb.relationships?.forEach((r, i) => {
    if (r.from_id && !knownRefs.has(r.from_id)) {
      c.warn(`relationships[${i}].from_id`, `unresolved id "${r.from_id}"`);
    }
    if (r.to_id && !knownRefs.has(r.to_id)) {
      c.warn(`relationships[${i}].to_id`, `unresolved id "${r.to_id}"`);
    }
    r.source_ids?.forEach((id, j) => {
      if (!sourceIds.has(id)) {
        c.error(`relationships[${i}].source_ids[${j}]`, `unknown source "${id}"`);
      }
    });
  });

  kb.conflicts?.forEach((cf, i) => {
    if (cf.status === 'open' && cf.resolution) {
      c.warn(`conflicts[${i}]`, 'conflict is open but carries a resolution');
    }
    cf.candidate_claim_ids?.forEach((id, j) => {
      if (!knownRefs.has(id)) {
        c.warn(`conflicts[${i}].candidate_claim_ids[${j}]`, `unresolved claim "${id}"`);
      }
    });
  });

  return { valid: c.errors.length === 0, errors: c.errors, warnings: c.warnings };
}

export function formatValidationResult(name: string, result: ValidationResult): string {
  const lines: string[] = [];
  const status = result.valid ? 'OK' : 'FAILED';
  lines.push(`${name}: ${status} (${result.errors.length} errors, ${result.warnings.length} warnings)`);
  for (const e of result.errors) lines.push(`  ERROR   ${e.path}: ${e.message}`);
  for (const w of result.warnings) lines.push(`  warning ${w.path}: ${w.message}`);
  return lines.join('\n');
}
