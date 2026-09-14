/**
 * Reads the standing queries and prints them (docs/DATA-COLLECTION.md).
 *
 * The views in `supabase/migrations` are the analysis layer; this is a way to
 * read them without opening a SQL editor. It answers, in order: what the agent
 * could not answer, what it failed to retrieve, which policy rules are firing,
 * which projects earn attention, and whether the last release did better.
 *
 * Read-only. Every number here comes from a view, so the terminal and the
 * dashboard that eventually replaces it cannot disagree.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Scripts run from the repository root, where the .env lives.
function loadEnv(): void {
  try {
    for (const rawLine of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const at = line.indexOf('=');
      if (at === -1) continue;
      const key = line.slice(0, at).trim();
      const value = line.slice(at + 1).trim().replace(/\s+#.*$/, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // A real environment may supply everything directly.
  }
}

function heading(title: string): void {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function table(rows: Record<string, unknown>[], columns: string[]): void {
  if (rows.length === 0) {
    console.log('  (nothing yet)');
    return;
  }
  const widths = columns.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').slice(0, 60).length)),
  );
  console.log('  ' + columns.map((c, i) => c.padEnd(widths[i]!)).join('  '));
  console.log('  ' + widths.map((w) => '─'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(
      '  ' +
        columns
          .map((c, i) => String(row[c] ?? '').slice(0, 60).padEnd(widths[i]!))
          .join('  '),
    );
  }
}

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      'No database configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env — ' +
        'see docs/DATA-COLLECTION.md.',
    );
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const read = async (view: string, limit = 10): Promise<Record<string, unknown>[]> => {
    const { data, error } = await db.from(view).select('*').limit(limit);
    if (error) {
      console.error(`  ! ${view}: ${error.message}`);
      return [];
    }
    return (data ?? []) as Record<string, unknown>[];
  };

  heading('Knowledge gaps — questions the agent could not answer');
  table(await read('knowledge_gaps'), ['times_asked', 'gap', 'last_asked']);

  heading('Retrieval misses — nothing found, and policy was not the reason');
  table(await read('retrieval_misses'), ['question', 'knowledge_version']);

  heading('Policy rules — read the questions, not just the counts');
  table(await read('refusal_topics'), ['times', 'policy_topic', 'short_circuit_reason', 'recent_questions']);

  heading('Projects — shown versus opened');
  table(await read('project_engagement'), ['project_id', 'times_shown', 'times_opened', 'open_rate']);

  heading('Releases — did the last change help?');
  table(await read('release_health'), [
    'prompt_version', 'knowledge_version', 'sessions', 'avg_turns',
    'questions', 'refusals', 'empty_retrievals',
  ]);

  heading('Recent conversations');
  table(await read('recent_conversations'), [
    'started_at', 'modality', 'turn_count', 'visitor_company', 'opening_question',
  ]);
  console.log('');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
