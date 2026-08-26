/**
 * Loads the monorepo-root `.env` into the server runtime.
 *
 * Next resolves `.env` relative to its own directory, so in a workspace the
 * root file is invisible to it. Two things that look like the fix and are not:
 *
 *   - Calling `loadEnvConfig` in `next.config.ts`. The config is evaluated in a
 *     different context from the one route handlers run in, so it silently
 *     fails to reach them.
 *   - Calling `loadEnvConfig` here. `@next/env` caches after Next's own call at
 *     startup, so a second call for a different directory is a no-op unless you
 *     pass `forceReload`, which then resets everything Next had already set.
 *
 * So this parses the file directly and only fills in keys that are not already
 * present. Strictly additive: a real environment variable always wins over the
 * file, which is what you want in every deployment that sets them properly.
 *
 * Import before anything that reads configuration.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `next dev` and `next start` both run with apps/web as the working directory.
const repoRoot = process.env.PAR_CONTENT_ROOT ?? resolve(process.cwd(), '..', '..');

function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (!key) continue;

    let value = line.slice(separator + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1);
    } else {
      // Unquoted values may carry a trailing comment. Require whitespace before
      // the '#' so a '#' inside a token is not treated as one.
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[key] = value;
  }
  return values;
}

try {
  const contents = readFileSync(resolve(repoRoot, '.env'), 'utf8');
  for (const [key, value] of Object.entries(parseEnvFile(contents))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // No root .env is fine — the environment may supply everything directly.
}

export {};
