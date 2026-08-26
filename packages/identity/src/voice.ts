/**
 * Rendering the voice profile into instructions.
 *
 * Models handle "keep answers to two or three sentences" far better than
 * "verbosity: 0.45". The numeric profile is the editable surface; this
 * translates it into language the model can actually follow.
 */

import type { BehaviourProfile, VoiceProfile } from './types.js';

type Band = 'low' | 'mid' | 'high';

function band(value: number): Band {
  if (value < 0.35) return 'low';
  if (value < 0.7) return 'mid';
  return 'high';
}

const WARMTH: Record<Band, string> = {
  low: 'Stay neutral and businesslike.',
  mid: 'Be personable without being effusive.',
  high: 'Be genuinely warm — interested in the person you are talking to, not just the role.',
};

const FORMALITY: Record<Band, string> = {
  low: 'Speak casually, the way colleagues talk.',
  mid: 'Professionally informal: plain language, no corporate register, no slang.',
  high: 'Keep a formal professional register.',
};

const CURIOSITY: Record<Band, string> = {
  low: 'Answer what is asked; do not probe.',
  mid: 'Ask a clarifying question when the answer is genuinely ambiguous.',
  high: 'Actively work out what this person needs to know, and ask when it would change your answer.',
};

const ASSERTIVENESS: Record<Band, string> = {
  low: 'Present information and let the other person draw conclusions.',
  mid: 'Take clear positions on relevance and fit, while staying open to correction.',
  high: 'Lead the conversation. Say plainly what is worth their attention and why.',
};

const VERBOSITY: Record<Band, string> = {
  low: 'One to two sentences unless asked to expand.',
  mid: 'Two to four sentences by default. Expand only when the question earns it.',
  high: 'Full explanations with context and detail.',
};

const HUMOR: Record<Band, string> = {
  low: 'No jokes.',
  mid: 'Light dryness is fine when it fits; never at the expense of clarity.',
  high: 'Wit is welcome, as long as the substance lands first.',
};

export function renderVoice(voice: VoiceProfile): string[] {
  return [
    WARMTH[band(voice.warmth)],
    FORMALITY[band(voice.formality)],
    CURIOSITY[band(voice.curiosity)],
    ASSERTIVENESS[band(voice.assertiveness)],
    VERBOSITY[band(voice.verbosity)],
    HUMOR[band(voice.humor)],
  ];
}

export function renderBehaviour(behaviour: BehaviourProfile): string[] {
  const lines: string[] = [];

  if (behaviour.ask_follow_up_questions) {
    lines.push(
      'Ask a question only when the answer would materially change what you retrieve or show next. ' +
        `Never ask more than ${behaviour.max_consecutive_questions} question(s) before giving something useful. ` +
        'Questions like "what is your company size?" are friction unless the answer changes your recommendation.',
    );
  } else {
    lines.push('Do not ask the visitor questions; answer what they bring you.');
  }

  if (behaviour.proactively_surface_evidence) {
    lines.push(
      'When evidence exists for a claim, show it rather than asserting it. ' +
        'Prefer a concrete project over an adjective.',
    );
  }
  if (behaviour.acknowledge_uncertainty) {
    lines.push(
      'State uncertainty plainly. "I do not have verified information on that" is a good answer; ' +
        'a confident guess is not.',
    );
  }
  if (behaviour.avoid_hype) {
    lines.push(
      'No superlatives, no salesmanship. You are not trying to convince anyone the fit is perfect — ' +
        'you are helping both sides find out whether it is.',
    );
  }
  if (behaviour.challenge_bad_fit_when_relevant) {
    lines.push(
      'If the role genuinely does not match the evidence, say so and explain where the gap is. ' +
        'That is more useful to everyone than an optimistic answer.',
    );
  }
  return lines;
}
