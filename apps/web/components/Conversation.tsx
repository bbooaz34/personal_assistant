'use client';

/**
 * The conversational shell (design doc §1, §8, §19).
 *
 * Conversation is the navigation: there is no menu, no page hierarchy, and no
 * separate "projects" route. Work appears inside the thread, in the same turn
 * as the words about it.
 *
 * Note on the stack: the design doc names assistant-ui as the intended
 * conversational foundation. This builds directly on the Vercel AI SDK's
 * primitives instead, because the custom parts here — the presence, the
 * component resolver, the policy short-circuit path — are the product, and
 * they are what a chat framework would have to be bent around. Swapping in
 * assistant-ui later is a change to this file, not to the agent.
 */

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentPresence, type PresenceState } from './AgentPresence';
import { renderComponent } from './PortfolioComponents';
import { RichText } from './RichText';
import type { Portfolio } from './portfolio-types';

interface Opening {
  text: string;
  starterPrompts: string[];
  owner: { name: string; short_name: string; headline: string };
  selfReference: string;
}

/** Right-to-left when the text is predominantly Hebrew (§24). */
function directionOf(text: string): 'rtl' | 'ltr' {
  const hebrew = (text.match(/[֐-׿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return hebrew > latin ? 'rtl' : 'ltr';
}

export function Conversation() {
  const [opening, setOpening] = useState<Opening | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [input, setInput] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), []);
  const { messages, sendMessage, status, error } = useChat({ transport });

  useEffect(() => {
    fetch('/api/opening').then((r) => r.json()).then(setOpening).catch(() => undefined);
    fetch('/api/portfolio').then((r) => r.json()).then(setPortfolio).catch(() => undefined);
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  const presence: PresenceState =
    status === 'submitted' ? 'thinking' : status === 'streaming' ? 'speaking' : 'idle';

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || status === 'streaming' || status === 'submitted') return;
    sendMessage({ text: trimmed });
    setInput('');
  };

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-4">
      <header className="flex items-center gap-3 py-5">
        <AgentPresence state={presence} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {opening?.selfReference ?? 'AI representative'}
          </p>
          <p className="truncate text-xs text-[var(--color-ink-faint)]">
            {opening ? `${opening.owner.name} — ${opening.owner.headline}` : 'Loading…'}
          </p>
        </div>
      </header>

      <div ref={threadRef} className="flex-1 space-y-5 overflow-y-auto pb-4">
        {opening ? (
          <div className="flex gap-3">
            <AgentPresence state="idle" size={28} />
            <p className="max-w-prose text-[15px] leading-relaxed text-[var(--color-ink-muted)]">
              {opening.text}
            </p>
          </div>
        ) : null}

        {messages.length === 0 && opening ? (
          <div className="flex flex-wrap gap-2 pl-10">
            {opening.starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => send(prompt)}
                className="rounded-full border border-[var(--color-edge)] px-3 py-1.5 text-sm text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent-soft)] hover:text-[var(--color-ink)]"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((message) => {
          const text = message.parts
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map((part) => part.text)
            .join('');

          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex justify-end">
                <p
                  dir={directionOf(text)}
                  className="max-w-prose rounded-2xl bg-[var(--color-surface-raised)] px-4 py-2.5 text-[15px] leading-relaxed"
                >
                  {text}
                </p>
              </div>
            );
          }

          return (
            <div key={message.id} className="flex gap-3">
              <AgentPresence state="idle" size={28} />
              <div className="min-w-0 flex-1">
                {text ? <RichText text={text} dir={directionOf(text)} /> : null}

                {/*
                  Components render beside the words, in the same turn. The
                  model supplies a name and an id; everything shown comes from
                  the policy-filtered payload.

                  Rendering waits for the server's `rendered: true`. The server
                  checks the id against the evidence the model was actually
                  given, which is a narrower set than the whole public
                  portfolio — so trusting the client's copy alone would quietly
                  widen what a component call can reach.
                */}
                {portfolio
                  ? message.parts
                      .filter((part) => part.type.startsWith('tool-'))
                      .map((part, index) => {
                        const name = part.type.slice('tool-'.length);
                        const { input, output } = part as {
                          input?: Record<string, unknown>;
                          output?: { rendered?: boolean };
                        };
                        if (!input || output?.rendered !== true) return null;
                        return (
                          <div key={`${message.id}-${index}`}>{renderComponent(name, input, portfolio)}</div>
                        );
                      })
                  : null}
              </div>
            </div>
          );
        })}

        {status === 'submitted' ? (
          <div className="flex gap-3">
            <AgentPresence state="thinking" size={28} />
            <p className="text-sm text-[var(--color-ink-faint)]">Looking through what I know…</p>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-[var(--color-edge)] p-3 text-sm text-[var(--color-ink-faint)]">
            Something went wrong reaching the model. Check that an API key is set in <code>.env</code>.
          </p>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 bg-[var(--color-ground)] pb-5 pt-2"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-edge)] bg-[var(--color-surface)] p-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send(input);
              }
            }}
            rows={1}
            dir={directionOf(input)}
            placeholder="Ask about his work, or tell me about the role you're hiring for…"
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-[var(--color-ink-faint)]"
            aria-label="Message"
          />
          <button
            type="submit"
            disabled={!input.trim() || status === 'streaming' || status === 'submitted'}
            className="rounded-xl bg-[var(--color-accent)] px-3.5 py-2 text-sm font-medium text-[var(--color-ground)] transition disabled:opacity-35"
          >
            Send
          </button>
        </div>
        <p className="mt-2 px-2 text-[11px] text-[var(--color-ink-faint)]">
          An AI representative, not {opening?.owner.short_name ?? 'the person'} himself. Answers come from a
          verified knowledge base — it will tell you when something is not in there.
        </p>
      </form>
    </div>
  );
}
