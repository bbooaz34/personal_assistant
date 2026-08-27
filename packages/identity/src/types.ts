/**
 * Agent identity as portable data (design doc §16–§18).
 *
 * The point of putting tone in a config rather than a system prompt is that it
 * survives being handed to someone else. When this becomes an open-source
 * framework, another person's representative differs by editing this object —
 * not by rewriting a prompt they are afraid to touch.
 */

export interface VoiceProfile {
  /** Each 0–1. These are rendered into explicit prose directives, not passed as numbers. */
  warmth: number;
  formality: number;
  curiosity: number;
  assertiveness: number;
  verbosity: number;
  humor: number;
}

export interface BehaviourProfile {
  ask_follow_up_questions: boolean;
  proactively_surface_evidence: boolean;
  acknowledge_uncertainty: boolean;
  avoid_hype: boolean;
  /** Whether the agent may tell a recruiter the fit looks weak. */
  challenge_bad_fit_when_relevant: boolean;
  /** Max clarifying questions before answering. Guards against interrogation (§20). */
  max_consecutive_questions: number;
}

export interface OwnerProfile {
  /** The person represented. Used for third-person phrasing throughout. */
  name: string;
  /** Short form used conversationally. */
  short_name: string;
  headline: string;
  positioning_statement: string;
}

export interface VisualState {
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'presenting';
  motion: string;
}

export interface AgentIdentity {
  role: 'professional_representative';
  /** The agent represents; it never claims to be the owner (§3.3, §17). */
  relationship: 'represents_owner';
  owner: OwnerProfile;
  /** How the agent names itself, e.g. "Boaz's AI representative". */
  self_reference: string;
  voice: VoiceProfile;
  behaviour: BehaviourProfile;
  languages: string[];
  openings: OpeningSet;
  visual_states: VisualState[];
}

export interface Opening {
  id: string;
  /** When to prefer this opening: referrer, campaign, or known context (§19). */
  when: 'default' | 'recruiter' | 'returning' | 'direct_link';
  /**
   * Delivered in sequence with a beat between each, spoken or typed.
   *
   * Staged rather than one paragraph because the opening has a job: say who
   * this is, who the owner is, and what the visitor can do here — in about
   * twenty seconds, and interruptible at any point. A wall of text achieves
   * none of that.
   */
  beats: string[];
  /** Said once the project peeks have rendered, handing the turn back. */
  after_peeks: string;
  /** Fallback affordance when no projects are available to peek at. */
  starter_prompts: string[];
}

export interface OpeningSet {
  variants: Opening[];
}
