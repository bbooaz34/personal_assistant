/**
 * Server-side agent singleton.
 *
 * Knowledge is loaded once per process and shared. It is immutable at runtime —
 * publishing new knowledge is a deploy, not a write — so there is nothing to
 * invalidate and no reason to reload per request.
 */

import { resolve } from 'node:path';
import { Agent } from '@par/agent';
import { loadKnowledge, type KnowledgeRepository } from '@par/knowledge';
import { agentConfig } from '@par/config';

let cached: Promise<{ agent: Agent; repository: KnowledgeRepository }> | null = null;

/** The monorepo root, which is where `/content` lives. */
export function contentRoot(): string {
  return process.env.PAR_CONTENT_ROOT ?? resolve(process.cwd(), '..', '..');
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
