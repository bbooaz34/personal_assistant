/**
 * Voice layer contracts (design doc §23, Phase 6).
 *
 * Not yet implemented — deliberately. Voice is a first-class interaction mode
 * rather than speech-to-text bolted onto a text chat, which means it belongs
 * after the text agent's grounding and policy behaviour are proven. What lives
 * here now is the boundary: STT, LLM, and TTS stay independently replaceable so
 * Hebrew quality can be evaluated without touching the rest of the system (§24).
 *
 * The important invariant for whoever implements this: a voice turn goes
 * through the *same* `Agent.prepareTurn` pipeline as a text turn. Voice must
 * never become a second path to the knowledge base with its own policy story.
 */

export interface SpeechToTextProvider {
  readonly id: string;
  readonly languages: string[];
  transcribe(audio: ArrayBuffer, hint?: { language?: string }): Promise<{ text: string; language: string }>;
}

export interface TextToSpeechProvider {
  readonly id: string;
  readonly languages: string[];
  synthesize(text: string, options?: { language?: string; voice?: string }): Promise<ArrayBuffer>;
}

/** Conversation state the visual identity reacts to (§21). */
export type AgentPresenceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'presenting';

export interface VoiceSessionConfig {
  stt: SpeechToTextProvider;
  tts: TextToSpeechProvider;
  /** Whether the visitor may interrupt mid-answer. Turn-taking quality lives or dies here. */
  allowBargeIn: boolean;
  /** Silence in ms before the agent treats a turn as finished. */
  endOfTurnSilenceMs: number;
}

export interface VoiceTurnResult {
  transcript: string;
  language: string;
  /** Spoken response and rendered components belong to the same turn (§23). */
  spoken: ArrayBuffer;
  componentCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

export const DEFAULT_VOICE_SESSION: Omit<VoiceSessionConfig, 'stt' | 'tts'> = {
  allowBargeIn: true,
  endOfTurnSilenceMs: 700,
};
