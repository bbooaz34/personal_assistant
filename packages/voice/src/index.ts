/**
 * Voice layer contracts (PRD §23, §39).
 *
 * The browser runs a `RealtimeSession` speaking directly to the OpenAI
 * Realtime API over WebRTC. That inverts the trust model compared with text:
 * in text, `Agent.prepareTurn` runs policy *before* the model sees anything,
 * because the server is between the visitor and the model. In voice the model
 * hears the microphone directly, so there is no such choke point.
 *
 * The property is preserved a different way, and this is the central design
 * decision of the voice layer:
 *
 *   **The realtime agent starts with no professional knowledge at all.**
 *
 * Its instructions carry identity, tone and boundaries — never facts. Every
 * factual claim requires a `retrieve_evidence` tool call, which is a *server*
 * endpoint running the same policy and retrieval pipeline as text. Closed
 * topics come back as a refusal directive with no evidence attached.
 *
 * So a visitor who talks the model into ignoring its instructions still gets
 * nothing: there is no private knowledge in the context to reach, and the only
 * path to more is a server that will not serve it. This is PRD §39's rule —
 * privileged operations must not be browser-trusted functions — expressed as
 * an architecture rather than a warning.
 */

/** Conversation state the visual identity reacts to (§21). */
export type AgentPresenceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'presenting';

export type VoiceConnectionState =
  | 'disconnected'
  | 'requesting_permission'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

/**
 * Why a voice session could not start. The UI needs to distinguish these:
 * a denied microphone is a user decision to explain, a missing key is an
 * operator error, and both must fall back to text rather than dead-end (§23.4).
 */
export type VoiceFailureReason =
  | 'microphone_denied'
  | 'microphone_unavailable'
  | 'token_unavailable'
  | 'transport_failed'
  | 'unsupported_browser';

export interface VoiceConfig {
  /** Realtime model. `gpt-realtime-2.1` is the PRD's MVP choice. */
  model: string;
  /**
   * API voice. Configuration, not identity — the representative's personality
   * lives in the tone system, and the voice must not imply it is the owner
   * speaking (§23.5).
   */
  voice: string;
  /** Server-side turn detection so barge-in and turn-taking are native (§23.4). */
  turnDetection: {
    type: 'semantic_vad' | 'server_vad';
    /** How eagerly the model takes its turn. Lower interrupts less. */
    eagerness?: 'low' | 'medium' | 'high' | 'auto';
    createResponse?: boolean;
    interruptResponse?: boolean;
  };
  /** Transcription of the visitor's speech, needed for the post-session summary (§23.4). */
  transcription: {
    model: string;
    /** Omit to let the model detect the language — required for mixed Hebrew/English (§24). */
    language?: string;
  };
  /** Seconds a minted client secret stays valid. Short by design. */
  tokenTtlSeconds: number;
}

/** What the server returns for a `retrieve_evidence` call. */
export interface VoiceEvidenceResponse {
  /** False when policy closed the topic. The agent must deliver `refusal` and stop. */
  allowed: boolean;
  /** Exact wording to speak when `allowed` is false. */
  refusal?: string;
  /** Policy-filtered evidence. Empty means nothing matched — say so, do not improvise. */
  evidence: Array<{
    id: string;
    kind: 'fact' | 'skill' | 'project';
    text: string;
    verified: boolean;
    sources: string[];
  }>;
  /** Project ids the agent may pass to a UI component this turn. */
  showableProjectIds: string[];
  /** Ids of projects with embeddable running artifacts. */
  artifactProjectIds: string[];
}

/** Names of the tools the realtime agent is given. */
export const VOICE_TOOL_RETRIEVE = 'retrieve_evidence';

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  model: 'gpt-realtime-2.1',
  voice: 'marin',
  turnDetection: {
    type: 'semantic_vad',
    // The representative asks real questions and pauses to think; an eager
    // detector talks over a recruiter who is still forming their sentence.
    eagerness: 'medium',
    createResponse: true,
    interruptResponse: true,
  },
  transcription: {
    model: 'gpt-4o-mini-transcribe',
    // No `language`: pinning it breaks the mixed Hebrew/English case the
    // product explicitly supports.
  },
  tokenTtlSeconds: 600,
};
