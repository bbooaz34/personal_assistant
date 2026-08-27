'use client';

/**
 * Voice affordance and connection states (PRD §23.4).
 *
 * Every failure path lands somewhere useful. A denied microphone, a missing
 * server key, an unsupported browser — none of them are dead ends, because
 * text is always still there underneath (graceful fallback).
 */

import type { VoiceConnectionState, VoiceFailureReason } from '@par/voice';

const FAILURE_MESSAGE: Record<VoiceFailureReason, string> = {
  microphone_denied:
    'Microphone access was blocked. You can allow it in your browser settings — or just keep typing.',
  microphone_unavailable: 'No microphone available. Text works just as well.',
  token_unavailable: 'Voice is unavailable right now. Text is still working.',
  transport_failed: 'The voice connection dropped. You can try again, or keep typing.',
  unsupported_browser: 'This browser does not support live voice. Text works everywhere.',
};

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M5 11a7 7 0 0 0 14 0M12 18.5V22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {muted ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : null}
    </svg>
  );
}

export function VoiceControls({
  state,
  failure,
  muted,
  onStart,
  onStop,
  onToggleMute,
}: {
  state: VoiceConnectionState;
  failure: VoiceFailureReason | null;
  muted: boolean;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}) {
  const connected = state === 'connected';
  const busy = state === 'requesting_permission' || state === 'connecting';

  const label =
    state === 'requesting_permission'
      ? 'Waiting for microphone…'
      : state === 'connecting'
        ? 'Connecting…'
        : connected
          ? 'End voice'
          : 'Talk';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={connected ? onStop : onStart}
          disabled={busy}
          aria-label={connected ? 'End the voice conversation' : 'Start a voice conversation'}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition disabled:opacity-50 ${
            connected
              ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]'
              : 'border border-[var(--color-edge)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent-soft)] hover:text-[var(--color-ink)]'
          }`}
        >
          <MicIcon muted={false} />
          {label}
        </button>

        {connected ? (
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute your microphone' : 'Mute your microphone'}
            className={`rounded-xl px-2.5 py-2 text-sm transition ${
              muted
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-ink)]'
                : 'border border-[var(--color-edge)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            <MicIcon muted={muted} />
          </button>
        ) : null}
      </div>

      {failure ? (
        <p className="text-[11px] leading-relaxed text-[var(--color-ink-faint)]">{FAILURE_MESSAGE[failure]}</p>
      ) : null}
    </div>
  );
}
