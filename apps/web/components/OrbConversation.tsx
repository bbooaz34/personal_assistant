'use client';

/**
 * The conversational interface, rebuilt on the orb (design doc §21, §22).
 *
 * The orb is the representative's presence: it breathes while idle, shows a
 * heartbeat while the agent retrieves, flutters while it answers, and reacts
 * to the visitor's actual voice during a realtime session. One Liquid Glass
 * element morphs from a capsule into the conversation panel, and portfolio
 * evidence renders inside the bubbles — expandable to a stage where the orb
 * docks into a porthole in the header glass.
 *
 * What the orb shell contributed is the body; the mind stayed ours. Text goes
 * through `/api/chat` (policy → retrieval → prompt), voice through the
 * realtime session whose only source of facts is the evidence endpoint. The
 * source project's placeholder brain, its keyword router, and its demo design
 * system were deliberately left behind.
 */

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VoiceFailureReason } from '@par/voice';
import { OrbStage } from './orb/OrbStage';
import type { OrbEngine } from './orb/engine';
import { renderComponent } from './PortfolioComponents';
import { RichText } from './RichText';
import { useVoiceSession } from './useVoiceSession';
import type { Portfolio } from './portfolio-types';

interface Opening {
  text: string;
  starterPrompts: string[];
  owner: { name: string; short_name: string; headline: string };
  selfReference: string;
}

interface VoiceSettings {
  voice: string;
  enabledComponents: string[];
}

interface ExpandedSpec {
  name: string;
  args: Record<string, unknown>;
  label: string;
}

const DEFAULT_PLACEHOLDER = "Ask about his work, or the role you're hiring for…";

const VOICE_FAILURE_STATUS: Record<VoiceFailureReason, string> = {
  microphone_denied: 'microphone was blocked — typing works just as well',
  microphone_unavailable: 'no microphone available — typing works just as well',
  token_unavailable: 'voice is unavailable right now — text still works',
  transport_failed: 'the voice connection dropped — try again, or keep typing',
  unsupported_browser: 'this browser does not support live voice — text works everywhere',
};

const STAGE_LABELS: Record<string, string> = {
  show_project: 'case study',
  show_artifact: 'live artifact',
  show_transformation: 'visual evolution',
  show_timeline: 'career',
  show_skill_map: 'skills',
  show_cv_section: 'cv',
  show_process: 'process',
  show_gallery: 'gallery',
  compare_projects: 'comparison',
};

/** Right-to-left when the text is predominantly Hebrew (§24). */
function directionOf(text: string): 'rtl' | 'ltr' {
  const hebrew = (text.match(/[֐-׿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return hebrew > latin ? 'rtl' : 'ltr';
}

export function OrbConversation() {
  const [opening, setOpening] = useState<Opening | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings | null>(null);
  const [input, setInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedSpec | null>(null);
  const [status_, setStatus] = useState<string | null>(null);

  const engineRef = useRef<OrbEngine | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), []);
  const { messages, sendMessage, status, error } = useChat({ transport });

  const voice = useVoiceSession({
    enabledComponents: voiceSettings?.enabledComponents ?? [],
    voice: voiceSettings?.voice ?? 'marin',
    agentName: opening?.selfReference ?? 'AI representative',
    getSessionContext: () => ({}),
  });
  const voiceActive = voice.state === 'connected';

  useEffect(() => {
    fetch('/api/opening').then((r) => r.json()).then(setOpening).catch(() => undefined);
    fetch('/api/portfolio').then((r) => r.json()).then(setPortfolio).catch(() => undefined);
    fetch('/api/realtime/settings').then((r) => r.json()).then(setVoiceSettings).catch(() => undefined);
  }, []);

  const showStatus = useCallback((text: string | null, sticky?: boolean) => {
    clearTimeout(statusTimer.current);
    setStatus(text);
    if (text && !sticky) statusTimer.current = setTimeout(() => setStatus(null), 4000);
  }, []);

  // ── presence choreography ──────────────────────────────────────────────
  // heartbeat while retrieving, speaking while answering, live while the
  // visitor's microphone is open, calm otherwise. The orb's live mode opens
  // its own analyser; the WebRTC session already holds the permission, so it
  // attaches silently and the orb breathes with the visitor's actual voice.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (voiceActive) {
      if (voice.speaking) void engine.setMode('speaking');
      else if (voice.thinking) void engine.setMode('heartbeat');
      else void engine.setMode('live');
    } else if (status === 'submitted') {
      void engine.setMode('heartbeat');
    } else if (status === 'streaming') {
      void engine.setMode('speaking');
    } else {
      void engine.setMode('calm');
    }
  }, [voiceActive, voice.speaking, voice.thinking, status]);

  useEffect(() => {
    engineRef.current?.setChatOpen(chatOpen);
  }, [chatOpen]);

  useEffect(() => {
    engineRef.current?.setExpanded(Boolean(expanded));
  }, [expanded]);

  // Voice failures surface where the eye already is: the input placeholder.
  useEffect(() => {
    if (voice.failure) showStatus(VOICE_FAILURE_STATUS[voice.failure]);
  }, [voice.failure, showStatus]);
  useEffect(() => {
    if (voiceActive) showStatus('listening — speak to it, or type', true);
    else if (voice.state === 'connecting') showStatus('connecting…', true);
    else if (voice.state === 'requesting_permission') showStatus('asking for the microphone…', true);
    else if (!voice.failure) showStatus(null);
  }, [voice.state, voiceActive, voice.failure, showStatus]);

  // Voice starts quietly; the panel opens once the conversation has content.
  useEffect(() => {
    if (voice.transcript.length > 0) setChatOpen(true);
  }, [voice.transcript.length]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status, voice.transcript]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (expanded) setExpanded(null);
      else if (chatOpen) setChatOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded, chatOpen]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setChatOpen(true);
    // Typing during a voice call stays in the same conversation (§23.4).
    if (voiceActive) {
      voice.sendText(trimmed);
      setInput('');
      return;
    }
    if (status === 'streaming' || status === 'submitted') return;
    sendMessage({ text: trimmed });
    setInput('');
  };

  const toggleVoice = () => {
    if (voiceActive || voice.state === 'connecting' || voice.state === 'requesting_permission') {
      voice.stop();
      showStatus(null);
    } else {
      void voice.start();
    }
  };

  const expandSpec = (name: string, args: Record<string, unknown>) => {
    const projectId = typeof args.project_id === 'string' ? args.project_id : undefined;
    const projectName = projectId
      ? portfolio?.projects.find((p) => p.id === projectId)?.name
      : undefined;
    setExpanded({ name, args, label: projectName ?? STAGE_LABELS[name] ?? 'evidence' });
  };

  /** A rendered piece of evidence plus its expand affordance. */
  const evidence = (key: string, name: string, args: Record<string, unknown>) => {
    if (!portfolio) return null;
    const node = renderComponent(name, args, portfolio);
    if (!node) return null;
    return (
      <div key={key} className="gen-ui">
        {node}
        <button type="button" className="gen-cta" onClick={() => expandSpec(name, args)}>
          Expand
        </button>
      </div>
    );
  };

  const hasConversation = messages.length > 0 || voice.transcript.length > 0;

  return (
    <>
      <OrbStage
        engineRef={engineRef}
        hooks={{
          onStatus: showStatus,
          getDockAnchor: () => {
            const rect = chatRef.current?.getBoundingClientRect();
            // the porthole sits 38px, 35px into the panel (see the CSS mask)
            return rect ? { x: rect.left + 38, y: rect.top + 35 } : null;
          },
        }}
      />

      <div id="wordmark">
        <h1>{opening?.owner.name ?? 'Boaz Ben Eli'}</h1>
        <p>{(opening?.selfReference ?? 'AI representative').toUpperCase()}</p>
      </div>

      <div ref={chatRef} id="chat" className={`${chatOpen ? 'open' : 'closed'}${expanded ? ' expanded' : ''}`}>
        <div id="chatHead">
          <span className="headTitle">{expanded ? expanded.label : 'conversation'}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {voiceActive ? (
              <button type="button" onClick={voice.toggleMute} aria-pressed={voice.muted}>
                {voice.muted ? 'unmute' : 'mute'}
              </button>
            ) : null}
            <button
              type="button"
              id="chatClose"
              aria-label={expanded ? 'Close the expanded view' : 'Close chat'}
              onClick={() => (expanded ? setExpanded(null) : setChatOpen(false))}
            >
              &times;
            </button>
          </span>
        </div>

        <div ref={logRef} id="chatLog" role="log" aria-live="polite">
          {opening ? (
            <div className="msg orb">
              <RichText text={opening.text} dir={directionOf(opening.text)} />
            </div>
          ) : null}

          {opening && !hasConversation ? (
            <div className="starters">
              {opening.starterPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => send(prompt)}>
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
                <div key={message.id} className="msg user" dir={directionOf(text)}>
                  {text}
                </div>
              );
            }

            const components = message.parts
              .filter((part) => part.type.startsWith('tool-'))
              .map((part, index) => {
                const name = part.type.slice('tool-'.length);
                const { input: args, output } = part as {
                  input?: Record<string, unknown>;
                  output?: { rendered?: boolean };
                };
                if (!args || output?.rendered !== true) return null;
                return evidence(`${message.id}-${index}`, name, args);
              })
              .filter(Boolean);

            if (!text && components.length === 0) return null;
            return (
              <div key={message.id} className={`msg orb${components.length ? ' has-ui' : ''}`}>
                {text ? <RichText text={text} dir={directionOf(text)} /> : null}
                {components}
              </div>
            );
          })}

          {voice.transcript.map((entry) => {
            if (entry.role === 'user') {
              return entry.text ? (
                <div key={entry.id} className="msg user" dir={directionOf(entry.text)}>
                  {entry.text}
                </div>
              ) : null;
            }
            const components = entry.components
              .map((call) => evidence(call.id, call.name, call.args))
              .filter(Boolean);
            if (!entry.text && components.length === 0) return null;
            return (
              <div key={entry.id} className={`msg orb${components.length ? ' has-ui' : ''}`}>
                {entry.text ? <RichText text={entry.text} dir={directionOf(entry.text)} /> : null}
                {components}
              </div>
            );
          })}

          {status === 'submitted' ? (
            <div className="msg orb typing" aria-label="Thinking">
              <span /><span /><span />
            </div>
          ) : null}

          {error ? (
            <div className="msg orb">
              Something went wrong reaching the model. Check that an API key is set in <code>.env</code>.
            </div>
          ) : null}
        </div>

        <div id="chatStage">
          {expanded && portfolio ? renderComponent(expanded.name, expanded.args, portfolio) : null}
        </div>

        <form
          id="chatForm"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <button
            type="button"
            id="micBtn"
            className={voiceActive ? 'listening' : undefined}
            aria-label={voiceActive ? 'End the voice conversation' : 'Start a voice conversation'}
            aria-pressed={voiceActive}
            onClick={toggleVoice}
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setChatOpen(true)}
            placeholder={status_ ?? DEFAULT_PLACEHOLDER}
            className={status_ ? 'status' : undefined}
            aria-label={status_ ?? 'Message'}
            autoComplete="off"
            dir={directionOf(input)}
          />
          <button type="submit" id="sendBtn" aria-label="Send">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );
}
