/**
 * Agent configuration.
 *
 * Model choice is a field, not an import (design doc §3.7). The orchestrator
 * produces a provider-neutral turn plan — a system prompt, a tool list, and an
 * evidence bundle — and the transport layer hands that to whichever provider is
 * configured. Swapping providers should never reach this package.
 */

import type { AgentIdentity } from '@par/identity';
import type { PolicyConfig } from '@par/policy';
import type { RetrievalWeights } from '@par/retrieval';

export type ModelProvider = 'anthropic' | 'openai' | 'google';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AgentConfig {
  identity: AgentIdentity;
  policy: PolicyConfig;
  model: ModelConfig;
  retrieval?: {
    weights?: Partial<RetrievalWeights>;
    limit?: number;
    relevanceFloor?: number;
  };
  /** UI components enabled in this deployment. Subset of the registry. */
  enabledTools?: string[];
}
