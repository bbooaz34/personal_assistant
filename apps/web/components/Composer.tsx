'use client';

/**
 * The message box, deliberately its own component.
 *
 * It owns the text being typed, and that is the entire point. Held in
 * `OrbConversation`, every keystroke re-rendered the whole conversation — the
 * orb stage, every message, and `renderComponent` for every piece of evidence
 * already on screen, including galleries and framed artifacts. Typing into a
 * long conversation got slower the longer the conversation ran.
 *
 * Nothing above this needs the draft. The parent is handed the text once, on
 * submit.
 */

import { memo, useState } from 'react';

/** Hebrew and Arabic ranges: a right-to-left draft should read that way. */
function directionOf(text: string): 'rtl' | 'ltr' {
  return /[֐-׿؀-ۿ]/.test(text) ? 'rtl' : 'ltr';
}

export const Composer = memo(function Composer({
  placeholder,
  status,
  voiceActive,
  onSubmit,
  onTyping,
  onFocus,
  onToggleVoice,
}: {
  placeholder: string;
  /** Transient status shown in place of the placeholder, when there is one. */
  status: string | null;
  voiceActive: boolean;
  onSubmit: (text: string) => void;
  /** Typing is an interruption: the opening script stops where it is. */
  onTyping: () => void;
  onFocus: () => void;
  onToggleVoice: () => void;
}) {
  const [value, setValue] = useState('');

  return (
    <form
      id="chatForm"
      onSubmit={(e) => {
        e.preventDefault();
        const text = value.trim();
        if (!text) return;
        // Cleared here rather than by the parent: the parent no longer holds it.
        setValue('');
        onSubmit(text);
      }}
    >
      <button
        type="button"
        id="micBtn"
        className={voiceActive ? 'listening' : undefined}
        aria-label={voiceActive ? 'End the voice conversation' : 'Start a voice conversation'}
        aria-pressed={voiceActive}
        onClick={onToggleVoice}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
          <path d="M12 18v4" />
        </svg>
      </button>
      <input
        id="chatInput"
        type="text"
        value={value}
        onChange={(e) => {
          if (e.target.value) onTyping();
          setValue(e.target.value);
        }}
        onFocus={onFocus}
        placeholder={status ?? placeholder}
        className={status ? 'status' : undefined}
        aria-label={status ?? 'Message'}
        autoComplete="off"
        dir={directionOf(value)}
      />
      <button type="submit" id="sendBtn" aria-label="Send">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
});
