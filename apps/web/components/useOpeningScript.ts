'use client';

/**
 * Runs the scripted opening (recruiter script v0.2).
 *
 * The agent starts the conversation rather than waiting to be addressed: a
 * short beat after load, it introduces itself, says who the owner is, and
 * offers three pieces of work. The point is that a visitor understands who
 * this is and what they can do here before deciding whether to type anything.
 *
 * Then it stops. Nothing is said after the peeks appear (script §5) — the
 * cards are the invitation, and "which one would you like to see?" would only
 * be the agent asking a question the interface has already answered.
 *
 * The whole thing is abandonable. `interrupt()` stops delivery wherever it has
 * got to and never resumes — if someone starts talking during the introduction,
 * finishing the script would be the rudest thing the agent could do.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface OpeningBeat {
  id: string;
  text: string;
}

export type OpeningPhase = 'waiting' | 'delivering' | 'peeks' | 'done' | 'abandoned';

/**
 * Fallback pacing when the line is not spoken aloud.
 *
 * Only used when speech is muted or unavailable — when the agent is actually
 * speaking, a beat ends when the sentence ends, which no timer can guess.
 */
function beatDelay(text: string): number {
  return Math.min(4200, Math.max(1400, text.length * 32));
}

export function useOpeningScript({
  beats,
  hasPeeks,
  enabled,
  say,
  onStart,
  onBeat,
  onPeeks,
  onFinish,
}: {
  beats: string[] | null;
  hasPeeks: boolean;
  /** False while the opening should not run at all (e.g. voice is driving it). */
  enabled: boolean;
  /**
   * Speaks a line and resolves when it finishes. Returns false if nothing was
   * spoken, in which case the beat falls back to a reading-pace delay.
   */
  say?: (text: string) => Promise<boolean>;
  onStart?: () => void;
  /**
   * Fired as each beat begins, before it is spoken.
   *
   * The scene is staged against the script rather than against a clock: a beat
   * ends when the sentence ends, and the only place that is known is here.
   */
  onBeat?: (index: number, text: string) => void;
  /**
   * Fired when the script reaches the project peeks.
   *
   * This is where the conversation panel opens. Until then the agent is
   * introducing itself over the scene and the panel would only be a box in
   * the way; the peeks are the first thing that actually needs somewhere to
   * live.
   */
  onPeeks?: () => void;
  onFinish?: () => void;
}) {
  const [delivered, setDelivered] = useState<OpeningBeat[]>([]);
  const [phase, setPhase] = useState<OpeningPhase>('waiting');
  const abandoned = useRef(false);
  const started = useRef(false);
  const callbacks = useRef({ onStart, onBeat, onPeeks, onFinish });
  callbacks.current = { onStart, onBeat, onPeeks, onFinish };
  /**
   * Held in a ref, never in the effect's dependencies.
   *
   * `say` is rebuilt on every render, and delivering a beat sets state — so
   * listing it as a dependency made each beat cancel the sequence that was
   * delivering it. The opening died silently after its first line.
   */
  const sayRef = useRef(say);
  sayRef.current = say;

  const interrupt = useCallback(() => {
    if (phase === 'done' || phase === 'abandoned') return;
    abandoned.current = true;
    setPhase('abandoned');
    // -1 is "no beat is being spoken". Anything staged against the script has
    // to be told the script stopped, or an interrupted opening leaves the
    // scene dressed for a line nobody is going to hear.
    callbacks.current.onBeat?.(-1, '');
  }, [phase]);

  useEffect(() => {
    if (!enabled || !beats?.length || started.current) return;
    started.current = true;

    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => timers.push(setTimeout(resolve, ms)));

    (async () => {
      // A short pause before speaking: arriving and being talked at in the
      // same instant reads as an autoplay ad, not a greeting.
      await wait(1400);
      if (cancelled || abandoned.current) return;

      setPhase('delivering');
      callbacks.current.onStart?.();

      for (const [index, text] of beats.entries()) {
        if (cancelled || abandoned.current) return;
        setDelivered((current) => [...current, { id: `beat-${index}`, text }]);
        callbacks.current.onBeat?.(index, text);
        // A spoken beat ends when the sentence ends; only a silent one needs
        // a timer.
        const spoken = sayRef.current ? await sayRef.current(text) : false;
        if (cancelled || abandoned.current) return;
        if (!spoken) await wait(beatDelay(text));
        else await wait(320); // a breath between thoughts
      }
      if (cancelled || abandoned.current) return;

      if (hasPeeks) {
        setPhase('peeks');
        callbacks.current.onPeeks?.();
        // The panel morph is the last thing that happens. Nothing is said over
        // it: the agent has stopped talking, and the work is what is left.
        await wait(900);
        if (cancelled || abandoned.current) return;
      }

      if (cancelled || abandoned.current) return;
      setPhase('done');
      callbacks.current.onFinish?.();
    })();

    return () => {
      cancelled = true;
      for (const timer of timers) clearTimeout(timer);
    };
  }, [enabled, beats, hasPeeks]);

  return {
    delivered,
    phase,
    /** The line currently being said, for the caption over the scene. */
    currentBeat: phase === 'delivering' ? (delivered[delivered.length - 1] ?? null) : null,
    interrupt,
    /** The peek rail becomes visible with the third beat and stays. */
    showPeeks: hasPeeks && (phase === 'peeks' || phase === 'done' || phase === 'abandoned'),
    running: phase === 'delivering' || phase === 'peeks',
  };
}
