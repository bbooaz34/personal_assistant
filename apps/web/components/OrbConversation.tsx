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
import { EntryScreen } from './EntryScreen';
import { OrbStage } from './orb/OrbStage';
import { ProjectPeeks, type PeekCard } from './ProjectPeeks';
import { useOpeningScript } from './useOpeningScript';
import { useSpeech } from './useSpeech';
import type { OrbEngine } from './orb/engine';
import { renderComponent } from './PortfolioComponents';
import { RichText } from './RichText';
import { useVoiceSession } from './useVoiceSession';
import type { Portfolio } from './portfolio-types';

interface Opening {
  beats: string[];
  afterPeeks: string;
  starterPrompts: string[];
  peeks: PeekCard[];
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
  const [peeks, setPeeks] = useState<PeekCard[]>([]);
  const [peekFocus, setPeekFocus] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const [entryLeaving, setEntryLeaving] = useState(false);
  const [entryReady, setEntryReady] = useState(true);
  // The orb has to arrive before it starts talking: beats fired during the
  // camera flight had the agent introducing itself to an empty sky.
  const [revealed, setRevealed] = useState(false);

  const engineRef = useRef<OrbEngine | null>(null);
  // Read at connect time, so hitting Talk mid-conversation does not make the
  // agent introduce itself all over again.
  const conversationStartedRef = useRef(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), []);
  const { messages, sendMessage, status, error } = useChat({ transport });

  const speech = useSpeech();

  const voice = useVoiceSession({
    enabledComponents: voiceSettings?.enabledComponents ?? [],
    voice: voiceSettings?.voice ?? 'marin',
    agentName: opening?.selfReference ?? 'AI representative',
    getSessionContext: () => ({}),
    conversationStarted: () => conversationStartedRef.current,
  });
  const voiceActive = voice.state === 'connected';

  useEffect(() => {
    fetch('/api/opening')
      .then((r) => r.json())
      .then((data: Opening) => {
        setOpening(data);
        setPeeks(data.peeks ?? []);
      })
      .catch(() => undefined);
    fetch('/api/portfolio').then((r) => r.json()).then(setPortfolio).catch(() => undefined);
    fetch('/api/realtime/settings').then((r) => r.json()).then(setVoiceSettings).catch(() => undefined);
  }, []);

  // The agent opens the conversation itself. Voice, when connected, delivers
  // its own scripted greeting through the realtime model, so the typed script
  // stands down rather than talking over it.
  const script = useOpeningScript({
    beats: opening?.beats ?? null,
    afterPeeks: opening?.afterPeeks ?? null,
    hasPeeks: peeks.length > 0,
    enabled:
      entered && revealed && Boolean(opening) && !voiceActive && voice.state === 'disconnected',
    say: async (text: string) => {
      if (speech.muted || !speech.available) return false;
      await speech.say(text);
      return !speech.muted && speech.available;
    },
    onStart: () => {
      // The panel stays closed through the introduction. The agent is speaking
      // over the scene; the orb is the thing to look at, not a chat box.
      void engineRef.current?.setMode('speaking');
    },
    onPeeks: () => {
      // The work needs somewhere to live: this is where the panel opens.
      setChatOpen(true);
    },
    onFinish: () => {
      void engineRef.current?.setMode('calm');
    },
  });

  // Safety net: the reveal is driven by the render loop, which a browser will
  // throttle in a background tab. The introduction must not be lost because
  // the visitor looked away during the flight.
  useEffect(() => {
    if (!entered || revealed) return;
    const timer = setTimeout(() => setRevealed(true), 6000);
    return () => clearTimeout(timer);
  }, [entered, revealed]);

  const enter = useCallback(() => {
    // Inside the gesture: this is what unlocks audio for the flight, the chime,
    // and the agent's own voice.
    engineRef.current?.begin();
    // Warm the first lines during the camera flight so the agent does not
    // arrive and then pause while the network answers.
    if (opening) speech.prefetch([...opening.beats, opening.afterPeeks]);
    setEntryLeaving(true);
    setEntered(true);
    // Unmount once the blur has finished lifting.
    setTimeout(() => setEntryReady(false), 1000);
  }, [opening, speech]);

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
    } else if (script.running) {
      void engine.setMode('speaking');
    } else if (status === 'submitted') {
      void engine.setMode('heartbeat');
    } else if (status === 'streaming') {
      void engine.setMode('speaking');
    } else {
      void engine.setMode('calm');
    }
  }, [voiceActive, voice.speaking, voice.thinking, status, script.running]);

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
  const lastVoiceQuestion = useRef<string>('');
  useEffect(() => {
    if (voice.transcript.length > 0) setChatOpen(true);
    // Spoken intent narrows the rail exactly as typed intent does.
    const latest = [...voice.transcript].reverse().find((entry) => entry.role === 'user');
    if (latest?.text && latest.text !== lastVoiceQuestion.current) {
      lastVoiceQuestion.current = latest.text;
      refreshPeeks(latest.text);
    }
  }, [voice.transcript]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status, voice.transcript, script.delivered, script.showPeeks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (expanded) setExpanded(null);
      else if (chatOpen) setChatOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded, chatOpen]);

  /**
   * Re-select the peek rail when the visitor names what they are hiring for.
   *
   * Debounced because a live transcript arrives as a stream of deltas, and
   * re-selecting on every partial word would be a request per keystroke-worth
   * of speech.
   */
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshPeeks = (text: string) => {
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => {
    fetch('/api/peeks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then((r) => r.json())
      .then((data: { cards: PeekCard[]; focus: { label: string } | null }) => {
        // No recognised emphasis leaves the rail alone, so it does not churn
        // on every unrelated message.
        if (!data.focus || data.cards.length === 0) return;
        setPeeks(data.cards);
        setPeekFocus(data.focus.label);
      })
      .catch(() => undefined);
    }, 600);
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    script.interrupt();
    speech.stop();
    refreshPeeks(trimmed);
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
      script.interrupt();
      speech.stop();
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
  conversationStartedRef.current = hasConversation || script.delivered.length > 0;

  return (
    <>
      <OrbStage
        engineRef={engineRef}
        hooks={{
          onStatus: showStatus,
          onReveal: () => setRevealed(true),
          getDockAnchor: () => {
            const rect = chatRef.current?.getBoundingClientRect();
            // the porthole sits 38px, 35px into the panel (see the CSS mask)
            return rect ? { x: rect.left + 38, y: rect.top + 35 } : null;
          },
        }}
      />

      {entryReady ? (
        <EntryScreen
          owner={opening?.owner.name ?? 'Boaz Ben Eli'}
          selfReference={opening?.selfReference ?? 'AI representative'}
          leaving={entryLeaving}
          onEnter={enter}
        />
      ) : null}

      {/* The agent speaks over the scene while the panel is still closed.
          The caption is the text variant: it appears when the line is not
          being spoken aloud, not alongside it. */}
      {!chatOpen && script.currentBeat && (speech.muted || !speech.available) ? (
        <div id="caption" aria-live="polite">
          <p key={script.currentBeat.id} dir={directionOf(script.currentBeat.text)}>
            {script.currentBeat.text}
          </p>
        </div>
      ) : null}

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
          {/* The introduction, then the work, then the invitation — in that
              order, because the follow-up line refers to cards the visitor
              must already be able to see. */}
          {script.delivered
            .filter((beat) => beat.id !== 'after-peeks')
            .map((beat) => (
              <div key={beat.id} className="msg orb">
                <RichText text={beat.text} dir={directionOf(beat.text)} />
              </div>
            ))}

          {script.running && script.phase === 'delivering' ? (
            <div className="msg orb typing" aria-label="Speaking">
              <span /><span /><span />
            </div>
          ) : null}

          {script.showPeeks ? (
            <ProjectPeeks
              cards={peeks}
              focusLabel={peekFocus}
              onOpen={(card) => {
                script.interrupt();
                send(`Show me ${card.name}.`);
              }}
            />
          ) : null}

          {script.delivered
            .filter((beat) => beat.id === 'after-peeks')
            .map((beat) => (
              <div key={beat.id} className="msg orb">
                <RichText text={beat.text} dir={directionOf(beat.text)} />
              </div>
            ))}

          {script.phase === 'done' && !hasConversation && peeks.length === 0 ? (
            <div className="starters">
              {opening?.starterPrompts.map((prompt) => (
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
            onChange={(e) => {
              // Typing is an interruption: the script stops where it is.
              if (e.target.value) script.interrupt();
              setInput(e.target.value);
            }}
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
