/**
 * The assembled agent configuration.
 *
 * Model selection reads from the environment so a provider swap is a
 * deployment change rather than a code change (design doc §3.7).
 */

import type { AgentConfig, ModelProvider } from '@par/agent';
import { identityConfig } from './identity.config.js';
import { privacyConfig } from './privacy.config.js';
import { enabledTools } from './ui.config.js';

const PROVIDERS: ModelProvider[] = ['anthropic', 'openai', 'google'];

function resolveProvider(): ModelProvider {
  const raw = process.env.AGENT_MODEL_PROVIDER as ModelProvider | undefined;
  return raw && PROVIDERS.includes(raw) ? raw : 'anthropic';
}

const DEFAULT_MODELS: Record<ModelProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4.1',
  google: 'gemini-2.0-flash',
};

export function createAgentConfig(): AgentConfig {
  const provider = resolveProvider();
  return {
    identity: identityConfig,
    policy: privacyConfig,
    model: {
      provider,
      model: process.env.AGENT_MODEL ?? DEFAULT_MODELS[provider],
      // Low but not zero: the representative should sound like a person, and
      // grounding is enforced by retrieval rather than by clamping sampling.
      temperature: 0.4,
      maxOutputTokens: 1200,
    },
    retrieval: {
      limit: 8,
      relevanceFloor: 0.12,
    },
    enabledTools,
  };
}

export const agentConfig: AgentConfig = createAgentConfig();
