'use client';

/**
 * Runs the scripted opening (recruiter script v0.1).
 *
 * The agent starts the conversation rather than waiting to be addressed: a
 * short beat after load, it introduces itself, says who the owner is, and
 * offers three pieces of work. The point is that a visitor understands who
 * this is and what they can do here before deciding whether to type anything.
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

/** Roughly reading pace, so beats land as they would be spoken. */
function beatDelay(text: string): number {
  return Math.min(4200, Math.max(1400, text.length * 32));
}

export function useOpeningScript({
  beats,
  afterPeeks,
  hasPeeks,
  enabled,
  onStart,
  onPeeks,
  onFinish,
}: {
  beats: string[] | null;
  afterPeeks: string | null;
  hasPeeks: boolean;
  /** False while the opening should not run at all (e.g. voice is driving it). */
  enabled: boolean;
  onStart?: () => void;
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
  const callbacks = useRef({ onStart, onPeeks, onFinish });
  callbacks.current = { onStart, onPeeks, onFinish };

  const interrupt = useCallback(() => {
    if (phase === 'done' || phase === 'abandoned') return;
    abandoned.current = true;
    setPhase('abandoned');
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
        await wait(beatDelay(text));
      }
      if (cancelled || abandoned.current) return;

      if (hasPeeks) {
        setPhase('peeks');
        callbacks.current.onPeeks?.();
        // Let the panel finish its morph before the follow-up line lands in it.
        await wait(900);
        if (cancelled || abandoned.current) return;
        if (afterPeeks) {
          setDelivered((current) => [...current, { id: 'after-peeks', text: afterPeeks }]);
        }
      }

      if (cancelled || abandoned.current) return;
      setPhase('done');
      callbacks.current.onFinish?.();
    })();

    return () => {
      cancelled = true;
      for (const timer of timers) clearTimeout(timer);
    };
  }, [enabled, beats, afterPeeks, hasPeeks]);

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
