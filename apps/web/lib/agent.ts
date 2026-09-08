/**
 * Server-side agent singleton.
 *
 * Knowledge is loaded once per process and shared. It is immutable at runtime —
 * publishing new knowledge is a deploy, not a write — so there is nothing to
 * invalidate and no reason to reload per request.
 */

import './env';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Agent } from '@par/agent';
import { loadKnowledge, type KnowledgeRepository } from '@par/knowledge';
import { agentConfig } from '@par/config';

let cached: Promise<{ agent: Agent; repository: KnowledgeRepository }> | null = null;

/**
 * The monorepo root, which is where `/content` lives.
 *
 * Found by walking up from the working directory rather than assumed to be
 * two levels above it: `next dev`/`next start` run from `apps/web`, but a
 * serverless deployment (Vercel) runs from the traced bundle root, where
 * `/content` sits right next to the entrypoint. `PAR_CONTENT_ROOT` remains
 * the explicit override for anything more exotic.
 */
export function contentRoot(): string {
  if (process.env.PAR_CONTENT_ROOT) return process.env.PAR_CONTENT_ROOT;
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'content'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd(), '..', '..');
}

export function getAgent(): Promise<{ agent: Agent; repository: KnowledgeRepository }> {
  cached ??= loadKnowledge({ contentRoot: contentRoot() }).then(({ repository, warnings }) => {
    for (const warning of warnings) {
      console.warn(`[knowledge] ${warning}`);
    }
    return { agent: new Agent(agentConfig, repository), repository };
  });
  return cached;
}
