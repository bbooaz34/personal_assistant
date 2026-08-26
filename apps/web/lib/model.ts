/**
 * Provider resolution (design doc §3.7).
 *
 * The only file in the app that knows which vendor is in use. Adding a
 * provider means adding a case here; nothing else changes.
 */

import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
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
