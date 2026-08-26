/**
 * Merges every import into a staging knowledge base and reports conflicts.
 *
 * Writes to `content/staging/`. It never touches `content/canonical/` — that
 * promotion is a human decision, by design (design doc §13).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listImports, loadImport } from '@par/knowledge';
import { formatConflictReport, mergeDocuments, normalizeDocument } from '@par/ingestion';

const root = process.cwd();
const SUBJECT_ID = 'person_boaz_ben_eli';

async function main(): Promise<void> {
  const filenames = await listImports(root);
  if (filenames.length === 0) {
    console.error('No imports found in content/imports.');
    process.exit(1);
  }

  const documents = [];
  for (const filename of filenames) {
    const base = await loadImport(root, filename);
    documents.push(normalizeDocument(filename, base));
  }

  const generatedAt = new Date().toISOString().slice(0, 10);
  const result = mergeDocuments(documents, SUBJECT_ID, generatedAt);

  const outputDir = join(root, 'content', 'staging');
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, 'staging-knowledge.json'),
    JSON.stringify(result.staging, null, 2) + '\n',
    'utf8',
  );
  await writeFile(
    join(outputDir, 'conflict-report.md'),
    formatConflictReport(result.conflicts) + '\n',
    'utf8',
  );

  console.log(`Merged ${result.stats.documents} document(s):`);
  console.log(`  facts:      ${result.stats.facts}`);
  console.log(`  skills:     ${result.stats.skills}`);
  console.log(`  projects:   ${result.stats.projects}`);
  console.log(`  duplicates collapsed: ${result.stats.duplicatesCollapsed}`);
  console.log(`  conflicts detected:   ${result.conflicts.length}`);
  console.log(`\nReview queue (${result.reviewQueue.length} items):`);

  const byKind = new Map<string, number>();
  for (const item of result.reviewQueue) {
    byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
  }
  for (const [kind, count] of byKind) console.log(`  ${kind}: ${count}`);

  console.log('\nWrote content/staging/staging-knowledge.json and content/staging/conflict-report.md');
  console.log('Nothing canonical was modified. Resolve conflicts by hand, then edit');
  console.log('content/canonical/canonical-knowledge.json and record the decision in docs/knowledge/.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
