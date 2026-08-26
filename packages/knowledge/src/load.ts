/**
 * Filesystem loading for the knowledge repository.
 *
 * `/content` is the source of truth for the MVP. Postgres + pgvector can back
 * this later without touching callers: everything downstream depends on
 * `KnowledgeRepository`, not on files.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { KnowledgeBase } from './types.js';
import type { ProjectEvidence } from './portfolio.js';
import { KnowledgeRepository } from './repository.js';
import { formatValidationResult, validateKnowledgeBase } from './validate.js';

export interface LoadOptions {
  /** Repository root that contains `/content`. Defaults to `PAR_CONTENT_ROOT` or cwd. */
  contentRoot?: string;
  /** Throw on validation errors instead of returning them. Defaults to true. */
  strict?: boolean;
}

export interface LoadedKnowledge {
  repository: KnowledgeRepository;
  warnings: string[];
}

export function resolveContentRoot(explicit?: string): string {
  const root = explicit ?? process.env.PAR_CONTENT_ROOT ?? process.cwd();
  return resolve(root);
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf8');
  try {
    return JSON.parse(raw) as T;
  } catch (cause) {
    throw new Error(`Invalid JSON in ${path}: ${(cause as Error).message}`);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Loads every `project.json` under `content/projects/*`. */
export async function loadProjectEvidence(contentRoot: string): Promise<ProjectEvidence[]> {
  const dir = join(contentRoot, 'content', 'projects');
  if (!(await exists(dir))) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const projects: ProjectEvidence[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(dir, entry.name, 'project.json');
    if (!(await exists(file))) continue;
    projects.push(await readJson<ProjectEvidence>(file));
  }
  return projects.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Loads the canonical knowledge base plus its project packages.
 *
 * Validation runs on every load by design. A knowledge repository that fails
 * referential integrity produces answers it cannot justify, which is worse
 * than not answering.
 */
export async function loadKnowledge(options: LoadOptions = {}): Promise<LoadedKnowledge> {
  const contentRoot = resolveContentRoot(options.contentRoot);
  const strict = options.strict ?? true;

  const canonicalPath = join(contentRoot, 'content', 'canonical', 'canonical-knowledge.json');
  if (!(await exists(canonicalPath))) {
    throw new Error(
      `No canonical knowledge found at ${canonicalPath}. ` +
        `Set contentRoot or PAR_CONTENT_ROOT to the repository root.`,
    );
  }

  const base = await readJson<KnowledgeBase>(canonicalPath);
  const result = validateKnowledgeBase(base);
  if (!result.valid && strict) {
    throw new Error(formatValidationResult('canonical-knowledge.json', result));
  }

  const evidence = await loadProjectEvidence(contentRoot);
  const warnings = result.warnings.map((w) => `${w.path}: ${w.message}`);

  // A published case study whose project is absent from canonical knowledge
  // can be shown but never cited — worth flagging, not worth blocking.
  for (const project of evidence) {
    if (project.status === 'published' && !base.projects.some((p) => p.id === project.id)) {
      warnings.push(`projects/${project.id}: published case study has no canonical project entry`);
    }
  }

  return { repository: new KnowledgeRepository(base, evidence), warnings };
}

/** Loads a source export from `content/imports` (a CV extraction, an AI memory dump). */
export async function loadImport(contentRoot: string, filename: string): Promise<KnowledgeBase> {
  return readJson<KnowledgeBase>(join(contentRoot, 'content', 'imports', filename));
}

/** Lists the import filenames available for ingestion. */
export async function listImports(contentRoot: string): Promise<string[]> {
  const dir = join(contentRoot, 'content', 'imports');
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir);
  return entries.filter((f) => f.endsWith('.json')).sort();
}
