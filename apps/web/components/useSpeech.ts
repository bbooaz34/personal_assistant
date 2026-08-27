'use client';

/**
 * Plays the agent's synthesized speech.
 *
 * Audio is fetched per line and cached for the session, so a beat that has
 * been heard once replays instantly. Playback resolves when the line finishes,
 * which is what lets the opening advance at the pace of speech rather than on
 * a guessed timer — a beat is over when the sentence is over.
 *
 * Every failure resolves rather than rejects. If synthesis is unavailable, the
 * caller falls back to captions and the opening still happens; a silent
 * introduction is a degraded experience, not a broken one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Speech {
  /** Speak a line; resolves when it finishes, is cancelled, or fails. */
  say: (text: string) => Promise<void>;
  /** Stop immediately — used when the visitor interrupts. */
  stop: () => void;
  /** Warm the cache so the first line does not wait on the network. */
  prefetch: (texts: string[]) => void;
  /** True while audio is actually playing. */
  speaking: boolean;
  /** False once synthesis has failed: the caller should show captions. */
  available: boolean;
  muted: boolean;
  toggleMuted: () => void;
}

export function useSpeech(): Speech {
  const [speaking, setSpeaking] = useState(false);
  const [available, setAvailable] = useState(true);
  const [muted, setMuted] = useState(false);

  const cache = useRef<Map<string, string>>(new Map());
  const current = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  useEffect(
    () => () => {
      current.current?.pause();
      for (const url of cache.current.values()) URL.revokeObjectURL(url);
      cache.current.clear();
    },
    [],
  );

  const fetchLine = useCallback(async (text: string): Promise<string | null> => {
    const cached = cache.current.get(text);
    if (cached) return cached;
    try {
      const response = await fetch('/api/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      cache.current.set(text, url);
      return url;
    } catch {
      setAvailable(false);
      return null;
    }
  }, []);

  const prefetch = useCallback(
    (texts: string[]) => {
      for (const text of texts) void fetchLine(text);
    },
    [fetchLine],
  );

  const stop = useCallback(() => {
    const audio = current.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      current.current = null;
    }
    setSpeaking(false);
  }, []);

  const say = useCallback(
    async (text: string) => {
      if (mutedRef.current) return;
      const url = await fetchLine(text);
      if (!url || mutedRef.current) return;

      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        current.current = audio;
        let settled = false;
        let watchdog: ReturnType<typeof setTimeout> | undefined;

        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(watchdog);
          if (current.current === audio) current.current = null;
          setSpeaking(false);
          resolve();
        };

        /**
         * Never wait on `ended` alone.
         *
         * A stalled decode, a throttled background tab, or an element that
         * plays silently will simply never fire it — and because the opening
         * advances beat by beat, one unresolved line hangs the entire
         * introduction on a blank screen. The watchdog caps the wait at the
         * clip's own duration plus a margin, or a flat ceiling until the
         * duration is known.
         */
        const arm = (seconds?: number) => {
          clearTimeout(watchdog);
          const ms = seconds && Number.isFinite(seconds) ? seconds * 1000 + 1500 : 12000;
          watchdog = setTimeout(finish, ms);
        };
        arm();

        audio.addEventListener('loadedmetadata', () => arm(audio.duration));
        audio.addEventListener('ended', finish);
        audio.addEventListener('error', finish);
        // Autoplay should be unlocked by the entry gesture; if it is not,
        // resolve rather than hang the whole opening on a blocked sound.
        audio.play().then(() => setSpeaking(true)).catch(() => {
          setAvailable(false);
          finish();
        });
      });
    },
    [fetchLine],
  );

  const toggleMuted = useCallback(() => {
    setMuted((was) => {
      if (!was) stop();
      return !was;
    });
  }, [stop]);

  return { say, stop, prefetch, speaking, available, muted, toggleMuted };
}
