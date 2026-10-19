/**
 * Provider resolution (design doc §3.7).
 *
 * The only file in the app that knows which vendor is in use. Adding a
 * provider means adding a case here; nothing else changes.
 */

import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import type { JSONValue, LanguageModel } from 'ai';
import type { ModelConfig } from '@par/agent';

export function resolveModel(config: ModelConfig): LanguageModel {
  switch (config.provider) {
    case 'anthropic':
      return anthropic(config.model);
    case 'openai':
      return openai(config.model);
    case 'google':
      return google(config.model);
  }
}

/** Whether the configured provider has credentials. Lets the UI fail helpfully. */
export function hasCredentials(config: ModelConfig): boolean {
  switch (config.provider) {
    case 'anthropic':
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case 'openai':
      return Boolean(process.env.OPENAI_API_KEY);
    case 'google':
      return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  }
}

/**
 * Per-provider request options, here for the same reason `resolveModel` is:
 * vendor-specific knobs stay in this file rather than leaking into the route.
 *
 * Anthropic runs adaptive thinking whether or not it is asked to, and those
 * tokens come out of `maxOutputTokens` alongside the answer. It cannot be
 * turned off from here -- the provider drops the field instead of forwarding
 * `disabled`, which lands back on the API default of on -- so the lever is
 * how *much* it thinks. Low effort is what this agent wants anyway: short,
 * scoped replies to a visitor's question, answered quickly.
 */
export function resolveProviderOptions(
  config: ModelConfig,
): Record<string, Record<string, JSONValue>> | undefined {
  switch (config.provider) {
    case 'anthropic':
      return { anthropic: { effort: 'low' } };
    case 'openai':
    case 'google':
      return undefined;
  }
}
