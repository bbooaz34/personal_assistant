/**
 * Voice configuration (PRD §23.5).
 *
 * Voice selection is configuration; the representative's personality, wording,
 * curiosity and boundaries stay in `identity.config.ts` and the policy layer.
 * Changing the voice must not change what the agent will or will not say.
 */

import { DEFAULT_VOICE_CONFIG, type VoiceConfig } from '@par/voice';

export const voiceConfig: VoiceConfig = {
  ...DEFAULT_VOICE_CONFIG,
  model: process.env.REALTIME_MODEL ?? DEFAULT_VOICE_CONFIG.model,
  /**
   * Warm, calm, contemporary, natural at conversational pacing — and audibly
   * an assistant rather than an impersonation of the owner.
   */
  voice: process.env.REALTIME_VOICE ?? 'marin',
};
