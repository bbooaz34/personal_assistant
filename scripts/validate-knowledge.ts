/**
 * Validates every knowledge document in the repository.
 *
 * Run this before committing knowledge changes and in CI. Errors fail the
 * build; warnings are printed because most of them describe real gaps worth
 * closing (an unsourced skill, a public claim nobody verified).
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  formatValidationResult,
  loadProjectEvidence,
  validateKnowledgeBase,
  type KnowledgeBase,
} from '@par/knowledge';
import { listImports } from '@par/knowledge';

const root = process.cwd();

async function validateFile(label: string, path: string): Promise<number> {
  const raw = await readFile(path, 'utf8');
  const result = validateKnowledgeBase(JSON.parse(raw) as KnowledgeBase);
  console.log(formatValidationResult(label, result));
  return result.errors.length;
}

async function main(): Promise<void> {
  let errors = 0;

  errors += await validateFile(
    'canonical/canonical-knowledge.json',
    join(root, 'content', 'canonical', 'canonical-knowledge.json'),
  );

  for (const filename of await listImports(root)) {
    errors += await validateFile(`imports/${filename}`, join(root, 'content', 'imports', filename));
  }

  // Project packages use a different schema; check the invariants that matter
  // at runtime rather than re-validating the whole shape.
  const projects = await loadProjectEvidence(root);
  console.log(`\nproject packages: ${projects.length}`);
  for (const project of projects) {
    const issues: string[] = [];
    if (!project.presentation?.short_pitch) issues.push('no short_pitch — the project card has nothing to say');
    if (project.evidence.length === 0) issues.push('no evidence attached');
    if (project.status === 'published' && project.evidence.every((e) => e.verification_status !== 'verified')) {
      issues.push('published without a single verified piece of evidence');
      errors += 1;
    }
    const state = issues.length ? `\n    - ${issues.join('\n    - ')}` : ' ok';
    console.log(`  ${project.id} [${project.status}]${state}`);
  }

  if (errors > 0) {
    console.error(`\n${errors} error(s). Knowledge is not publishable.`);
    process.exit(1);
  }
  console.log('\nAll knowledge documents valid.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
