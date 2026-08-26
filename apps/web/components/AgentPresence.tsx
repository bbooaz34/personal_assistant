'use client';

/**
 * The agent's visual identity (design doc §21, §22).
 *
 * Abstract by decision, not by omission. A photorealistic face would blur the
 * line between Boaz and the thing representing him — the exact distinction the
 * product spends its effort establishing — and buys uncanny-valley risk for
 * nothing. A responsive orb reads as a presence without pretending to be a
 * person.
 *
 * Motion is the whole vocabulary, so it respects `prefers-reduced-motion`.
 */

export type PresenceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'presenting';

const LABELS: Record<PresenceState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Answering',
  presenting: 'Showing work',
};

export function AgentPresence({
  state = 'idle',
  size = 40,
}: {
  state?: PresenceState;
  size?: number;
}) {
  const animation = state === 'presenting' ? 'presence-idle' : `presence-${state}`;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`AI representative — ${LABELS[state]}`}
    >
      <div
        className={`absolute inset-0 rounded-full blur-md ${animation}`}
        style={{
          background:
            'radial-gradient(circle at 35% 30%, var(--color-accent), var(--color-accent-soft) 55%, transparent 72%)',
          opacity: state === 'idle' ? 0.55 : 0.85,
        }}
      />
      <div
        className={`absolute inset-[18%] rounded-full ${animation}`}
        style={{
          background:
            'radial-gradient(circle at 38% 32%, oklch(0.98 0.02 200), var(--color-accent) 60%, var(--color-accent-soft))',
        }}
      />
    </div>
  );
}
