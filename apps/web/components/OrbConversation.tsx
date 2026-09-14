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
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VoiceFailureReason } from '@par/voice';
import { ContactMethods } from './ContactMethods';
import { EntryScreen } from './EntryScreen';
import { OrbStage } from './orb/OrbStage';
import { Composer } from './Composer';
import { ProjectPeeks, type PeekCard } from './ProjectPeeks';
import { useOpeningScript } from './useOpeningScript';
import { useSpeech } from './useSpeech';
import type { OrbEngine } from './orb/engine';
import { LIVE_ASSET_LINE } from '@/lib/lines';
import { getClientSession } from '@/lib/session-client';
import { reportEvent } from '@/lib/session-beacon';
import { renderComponent } from './PortfolioComponents';
import { RichText } from './RichText';
import { useVoiceSession } from './useVoiceSession';
import type { Portfolio } from './portfolio-types';

/**
 * The film the orb shows while the agent talks through a project over voice.
 *
 * Not configurable the way the opening projection is: that one is part of a
 * script whose beat indices have to move with the copy, whereas this is a fixed
 * behaviour with nothing to tune.
 */
const PROJECT_FILM = '/media/project-film.mp4';

interface Opening {
  beats: string[];
  starterPrompts: string[];
  /** The stretch of the script the orb spends as a crystal ball, if any. */
  projection: { video: string; from_beat: number; until_beat: number } | null;
  peeks: PeekCard[];
  owner: {
    name: string;
    short_name: string;
    headline: string;
    contact?: { linkedin?: string; email?: string; phone?: string };
  };
  agentName: string;
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

/**
 * A project opened from the peek rail (§22.3, revised).
 *
 * Opening a peek is a scripted reveal, not a chat turn: the gallery renders
 * immediately, the description is spoken over it, and only then is the model
 * asked — for a text summary alone, since the visuals are already on screen.
 * `atMessageIndex` pins the reveal where it happened in the conversation.
 */
interface ProjectReveal {
  id: string;
  projectId: string;
  /**
   * Inline the reveal always shows highlight media; expanding it opens the
   * live desktop artifact when the project ships one, else the gallery at
   * its desktop renditions.
   */
  expandComponent: 'show_artifact' | 'show_gallery';
  atMessageIndex: number;
}

const DEFAULT_PLACEHOLDER = "Ask about Boaz's work…";

const VOICE_FAILURE_STATUS: Record<VoiceFailureReason, string> = {
  microphone_denied: 'microphone was blocked — typing works just as well',
  microphone_unavailable: 'no microphone available — typing works just as well',
  token_unavailable: 'voice is unavailable right now — text still works',
  transport_failed: 'the voice connection dropped — try again, or keep typing',
  unsupported_browser: 'this browser does not support live voice — text works everywhere',
};

/**
 * Components that draw themselves differently when expanded (see
 * `renderComponent`'s `expanded` flag). Everything else renders the same node
 * at both sizes, so expanding it is only a magnification.
 */
const EXPANDS_RICHER = new Set([
  'show_artifact',
  'show_transformation',
  'show_gallery',
  'show_timeline',
  'show_cv_section',
]);

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
  const [chatOpen, setChatOpen] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedSpec | null>(null);
  const [status_, setStatus] = useState<string | null>(null);
  const [peeks, setPeeks] = useState<PeekCard[]>([]);
  const [peekFocus, setPeekFocus] = useState<string | null>(null);
  const [reveals, setReveals] = useState<ProjectReveal[]>([]);
  const [entered, setEntered] = useState(false);
  const [entryLeaving, setEntryLeaving] = useState(false);
  const [entryReady, setEntryReady] = useState(true);
  // The orb has to arrive before it starts talking: beats fired during the
  // camera flight had the agent introducing itself to an empty sky.
  const [revealed, setRevealed] = useState(false);

  const engineRef = useRef<OrbEngine | null>(null);
  const filmRef = useRef<HTMLVideoElement | null>(null);
  /**
   * A film looping inside the orb is exactly the kind of motion this setting
   * exists to stop, so the crystal ball is simply never opened. The orb keeps
   * talking through those beats as it always did.
   */
  /**
   * Narrow enough that the expanded stage is barely bigger than the message
   * it came from. Matches the width at which the panel already goes
   * full-bleed, so the two agree about what counts as a phone.
   */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = matchMedia('(max-width: 620px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  const [allowFilm, setAllowFilm] = useState(true);
  /** Set once the element reports it cannot play the file at all. */
  const [filmBroken, setFilmBroken] = useState(false);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setAllowFilm(!query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  // Read at connect time, so hitting Talk mid-conversation does not make the
  // agent introduce itself all over again.
  const conversationStartedRef = useRef(false);
  /**
   * The project being spoken about outside a voice session.
   *
   * Opening a peek speaks the project's summary through the browser's own
   * synthesis rather than the realtime model, so it never touches the voice
   * session — which is why clicking a project used to leave the orb closed.
   */
  const [spokenProject, setSpokenProject] = useState<string | null>(null);
  const projectFilmRef = useRef<HTMLVideoElement>(null);
  const [projectFilmBroken, setProjectFilmBroken] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // `body` is resolved per request, so the session travels with every turn
  // without the transport having to be rebuilt. Both paths send the same id:
  // a visitor who starts typing and then hits Talk stays one conversation.
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/chat', body: () => ({ session: getClientSession() }) }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });

  const speech = useSpeech();
  /**
   * The turn state as it is *now*.
   *
   * `status` in a handler is whatever it was when that handler was created.
   * `openProjectReveal` waits on a spoken summary for ten seconds or more
   * before it sends anything, by which point the captured value describes a
   * conversation that has moved on.
   */
  const statusRef = useRef(status);
  statusRef.current = status;

  const voice = useVoiceSession({
    enabledComponents: voiceSettings?.enabledComponents ?? [],
    voice: voiceSettings?.voice ?? 'marin',
    agentName: opening?.agentName ?? 'EBOS',
    getSessionContext: () => ({ ...getClientSession() }),
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
  // The engine holds the element, not the URL: the video decodes on the main
  // thread and is uploaded as a texture each frame, so there is exactly one
  // of it and React never re-creates it mid-script.
  /**
   * The orb becomes a crystal ball while the agent talks through a project out
   * loud — the same move the opening script makes, for the same reason: while
   * the agent is speaking there is nothing to read, so the orb is what the
   * visitor is looking at.
   *
   * Held for the whole answer rather than the sentence that names the project.
   * The film loops, so its own length has nothing to do with how long it runs.
   */
  const speakingAboutProject = voiceActive
    ? voice.speaking && voice.projectFocus !== null
    : speech.speaking && spokenProject !== null;
  const showProjectFilm = speakingAboutProject && allowFilm && !projectFilmBroken;

  // Which film the engine is holding. It takes one element at a time, and the
  // two are never wanted at once: the opening script does not run during voice.
  const projectFilmOn = useRef(false);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (showProjectFilm) {
      projectFilmOn.current = true;
      // Re-attached on every answer rather than once. The engine gives up on a
      // film it cannot sample within a moment and latches that failure, and
      // `setProjection` is the only thing that clears it — so attaching once
      // would mean a single bad start disables the film for the whole session.
      engine.setProjection(projectFilmRef.current);
      engine.setCrystal(true);
      return;
    }

    // Only close the glass on the way *out* of the project film. Calling it
    // unconditionally would fight the opening script, which drives the crystal
    // ball per beat from `onBeat`.
    const wasShowing = projectFilmOn.current;
    if (wasShowing) {
      projectFilmOn.current = false;
      engine.setCrystal(false);
    }

    // `filmBroken` belongs in here, not just in the error handler: this effect
    // re-runs on reveal, and without it a film that had already failed was
    // handed straight back to the engine on the next run.
    const usable = allowFilm && !filmBroken && opening?.projection;
    const next = usable ? filmRef.current : null;

    if (!wasShowing) {
      engine.setProjection(next);
      return;
    }

    /*
     * The glass closes over about half a second, and the shader keeps sampling
     * the texture the whole way down. Swapping the element now uploads the
     * other film's first frame into a body that is still transparent, so the
     * designer's film appears to end on a freeze-frame of the opening one.
     *
     * Hand the new element over only once the body is solid again.
     */
    const settle = setTimeout(() => engine.setProjection(next), 700);
    return () => clearTimeout(settle);
  }, [showProjectFilm, opening, allowFilm, filmBroken, revealed]);

  const script = useOpeningScript({
    beats: opening?.beats ?? null,
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
    onBeat: (index) => {
      // The orb is itself while it introduces itself, a crystal ball for the
      // beats about Boaz, and itself again to hand over to the work. An
      // interrupted script reports -1, which closes the glass like any other
      // beat outside the window.
      const film = opening?.projection;
      const showFilm =
        allowFilm &&
        Boolean(film) &&
        index >= (film?.from_beat ?? 0) &&
        index < (film?.until_beat ?? 0);
      engineRef.current?.setCrystal(showFilm);
    },
    onPeeks: () => {
      // The work needs somewhere to live: this is where the panel opens.
      setChatOpen(true);
    },
    onFinish: () => {
      void engineRef.current?.setMode('calm');
      engineRef.current?.setCrystal(false);
    },
  });

  // Warm the peek descriptions: opening a project speaks its summary, and the
  // reveal should not stall on synthesis when the visitor has just clicked.
  useEffect(() => {
    if (!portfolio || peeks.length === 0) return;
    const summaries = peeks
      .map((card) => portfolio.projects.find((p) => p.id === card.projectId)?.summary)
      .filter((s): s is string => Boolean(s));
    if (summaries.length > 0) speech.prefetch([...summaries, LIVE_ASSET_LINE]);
    // speech.prefetch is stable; peeks/portfolio are what actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, peeks]);

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
    if (opening) speech.prefetch(opening.beats);
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
    } else if (script.running || speech.speaking) {
      void engine.setMode('speaking');
    } else if (status === 'submitted') {
      void engine.setMode('heartbeat');
    } else if (status === 'streaming') {
      void engine.setMode('speaking');
    } else {
      void engine.setMode('calm');
    }
  }, [voiceActive, voice.speaking, voice.thinking, status, script.running, speech.speaking]);

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

  /**
   * Follow the conversation as it grows.
   *
   * Smooth scrolling is wrong while a reply is streaming: this effect runs on
   * every chunk, and each run restarts an animation the previous one had not
   * finished, so the log lurches instead of moving. Streaming follows the text
   * instantly, and only a settled turn gets the smooth glide.
   *
   * A visitor who has scrolled up to re-read something is not pulled back down.
   * Being yanked away mid-sentence is the same complaint as jumping text, from
   * the other direction.
   */
  /**
   * Whether the visitor is following the conversation or has scrolled back.
   *
   * Recorded from actual scrolling, not measured after new content arrives.
   * Measuring afterwards conflates the two cases: a gallery landing at the
   * bottom puts the view hundreds of pixels from the end, which reads
   * identically to someone having scrolled up, and the reveal they just asked
   * for then never scrolls into view.
   */
  const following = useRef(true);
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    /*
     * Only an upward scroll stops the follow.
     *
     * Distance-from-bottom alone is not enough: evidence growing below the
     * view increases it without the visitor touching anything, which reads as
     * "they scrolled away" and abandons them mid-reveal. `scrollTop` moving
     * back is the one signal that only a person produces.
     */
    let lastTop = log.scrollTop;
    const onScroll = () => {
      const top = log.scrollTop;
      if (top < lastTop - 4) following.current = false;
      else if (log.scrollHeight - top - log.clientHeight < 140) following.current = true;
      lastTop = top;
    };
    log.addEventListener('scroll', onScroll, { passive: true });
    return () => log.removeEventListener('scroll', onScroll);
  }, []);

  const followToBottom = useCallback((smooth: boolean) => {
    const log = logRef.current;
    if (!log || !following.current) return;
    log.scrollTo({ top: log.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  /**
   * Go to the end of the conversation because the visitor just asked for
   * something, and resume following it.
   *
   * Scrolling back to read is the one case the follow deliberately does not
   * override. Clicking a suggestion or sending a message is not that case: it
   * is a request for something new, and leaving them looking at the old thing
   * is the whole complaint.
   *
   * Repeated across a few frames on purpose. The panel may be opening in the
   * same commit, and the evidence that lands has images and iframes that
   * settle a beat later; one scroll on click arrives before the thing it is
   * meant to reveal.
   */
  const jumpToEnd = useCallback(() => {
    following.current = true;
    const log = logRef.current;
    if (!log) return;
    const jump = () => log.scrollTo({ top: log.scrollHeight, behavior: 'auto' });
    jump();
    requestAnimationFrame(jump);
    setTimeout(jump, 160);
  }, []);

  useEffect(() => {
    // Instant while streaming: this runs on every chunk, and a smooth scroll
    // restarted before the last one finished is what made the log lurch.
    followToBottom(!(status === 'streaming' || status === 'submitted'));
  }, [messages, status, voice.transcript, script.delivered, script.showPeeks, reveals, followToBottom]);

  /**
   * Evidence grows after it is inserted: images decode, iframes lay out, a
   * gallery gets taller a beat after it appears. Scrolling once when it mounts
   * leaves the visitor above the thing they opened, so follow the growth too.
   */
  useEffect(() => {
    const log = logRef.current;
    if (!log || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => followToBottom(false));
    for (const child of Array.from(log.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [messages.length, reveals.length, voice.transcript.length, followToBottom]);

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
    jumpToEnd();
    // Typing during a voice call stays in the same conversation (§23.4).
    if (voiceActive) {
      voice.sendText(trimmed);
      return;
    }
    if (status === 'streaming' || status === 'submitted') return;
    sendMessage({ text: trimmed });
  };

  /**
   * The peek-click reveal (§22.3, revised): visuals first, voice over them,
   * text last. No case-study card, no tag cloud — the gallery renders at once,
   * the agent speaks the project description, and only after the line has been
   * said is the model asked, for a text-only summary of the strongest points.
   */
  const openProjectReveal = async (card: PeekCard) => {
    script.interrupt();
    speech.stop();
    setChatOpen(true);
    jumpToEnd();
    // A live voice session narrates its own reveals; hand it the intent.
    if (voiceActive) {
      voice.sendText(`Show me ${card.name}.`);
      return;
    }
    const project = portfolio?.projects.find((p) => p.id === card.projectId);
    if (!project) {
      send(`Show me ${card.name}.`);
      return;
    }
    if (status === 'streaming' || status === 'submitted') return;
    setReveals((prior) => [
      ...prior,
      {
        id: `reveal-${card.projectId}-${Date.now()}`,
        projectId: card.projectId,
        expandComponent: project.artifacts.length > 0 ? 'show_artifact' : 'show_gallery',
        atMessageIndex: messages.length,
      },
    ]);
    // The description is spoken, not printed — the gallery is what the visitor
    // reads. Muted or unavailable synthesis skips straight to the summary.
    if (!speech.muted && speech.available) {
      setSpokenProject(card.projectId);
      try {
        await speech.say(project.summary);
      } finally {
        // In a finally because an interrupted line still has to close the
        // glass; left set, the orb would stay glass for the next thing spoken.
        setSpokenProject(null);
      }
    }
    // Checked again here, not just before the speech. A visitor who asked
    // their own question while this was talking has said something more
    // relevant than the summary, and firing a second request into a turn
    // already in flight is what produced duplicate messages in the log.
    if (statusRef.current === 'streaming' || statusRef.current === 'submitted') return;

    const owner = opening?.owner.short_name ?? 'Boaz';
    sendMessage({
      text: `Give me a short summary of ${card.name}, the three strongest points of ${owner}'s work on it.`,
      // The visitor clicked a card; they did not type this. It has to reach
      // the model, but showing it back to them as their own message is a lie
      // about what just happened.
      metadata: { hidden: true },
    });
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

    // The strongest interest signal there is. Being shown a project is
    // something the agent decided; opening one is something the visitor did,
    // and only the second says anything about what they came for.
    reportEvent(projectId ? 'project_opened' : 'component_expanded', {
      component: name,
      ...(projectId ? { project_id: projectId } : {}),
    });

    // The one thing a visitor cannot tell by looking, and the thing the whole
    // portfolio rests on. Skipped during a voice call: the realtime agent is
    // already narrating, and two voices at once is worse than not saying it.
    if (!voiceActive && !speech.muted && speech.available) {
      // Stop whatever is mid-sentence first. `say` does not: it starts a second
      // Audio and forgets the first, so the summary and this line talked over
      // each other and neither was audible.
      speech.stop();
      void speech.say(LIVE_ASSET_LINE);
    }

    setExpanded({ name, args, label: projectName ?? STAGE_LABELS[name] ?? 'evidence' });
  };

  /** The reveals that happened after message `index` was the latest turn. */
  const revealsAt = (index: number) =>
    reveals
      .filter((r) => r.atMessageIndex === index)
      .map((r) => {
        const node = evidence(r.id, 'show_gallery', { project_id: r.projectId }, r.expandComponent);
        return node ? (
          <div key={r.id} className="msg orb has-ui">
            {node}
          </div>
        ) : null;
      });

  /**
   * What "Expand view" opens for a piece of inline evidence.
   *
   * A case study is prose about the work; the live view is the work. Every
   * other component either has an expanded mode of its own or has nothing
   * richer to show, so only `show_project` is remapped, to the best evidence
   * the project actually carries: the staged transformation, else the running
   * artifact, else its media. A project with none of those expands to itself,
   * because there is genuinely nothing to run.
   *
   * Without this the button expanded the case study into the same case study,
   * one size larger — offering to bring the work to life and enlarging the
   * text instead.
   */
  const expandTargetFor = (name: string, args: Record<string, unknown>): string => {
    if (name !== 'show_project') return name;
    const id = typeof args.project_id === 'string' ? args.project_id : undefined;
    const project = id ? portfolio?.projects.find((p) => p.id === id) : undefined;
    if (!project) return name;
    if (project.transformation.length > 0) return 'show_transformation';
    if (project.artifacts.length > 0) return 'show_artifact';
    if (project.media.length > 0) return 'show_gallery';
    return name;
  };

  /**
   * A rendered piece of evidence plus its expand affordance. `expandName`
   * lets the stage open a different component than the inline one — a reveal
   * shows highlight media inline but expands to the live desktop artifact.
   *
   * The affordance is only offered when there is something to open: either
   * the stage shows a different component than the inline one, or the
   * component draws itself differently when expanded. Four of the portfolio
   * projects carry no artifacts, no stages and no media, and on those the
   * button used to promise a live view and enlarge the same prose.
   */
  const evidence = (
    key: string,
    name: string,
    args: Record<string, unknown>,
    expandName?: string,
  ) => {
    if (!portfolio) return null;
    const target = expandName ?? expandTargetFor(name, args);
    const offersLiveView = target !== name || EXPANDS_RICHER.has(target);
    /*
     * Always render the visual, never the card about it.
     *
     * `show_project` draws a ProjectCard: a name, a company, a paragraph, some
     * tags. It carries no image even when the project owns four artifacts, so
     * the agent asking to "show" a project produced a block of prose that
     * reads as evidence and shows nothing. `expandTargetFor` already knows
     * which component actually has the pixels; use it for the inline render
     * too, not only behind the expand button.
     *
     * A project with nothing to show cannot reach this point: the resolver
     * refuses a show_* call on one.
     */
    const inline = offersLiveView ? target : name;
    const node = renderComponent(inline, args, portfolio) ?? renderComponent(name, args, portfolio);
    if (!node) return null;

    /*
     * The name and one line, above the work.
     *
     * The visual components carry their title in an aria-label and nothing
     * visible, so with the ProjectCard gone a shown artifact arrived unlabelled
     * and the visitor had to infer what they were looking at from the pixels.
     * This is the card's one useful part kept, and the paragraph of prose that
     * made it read as evidence dropped.
     */
    const headedProject = (() => {
      const id = typeof args.project_id === 'string' ? args.project_id : undefined;
      return id ? portfolio.projects.find((p) => p.id === id) : undefined;
    })();

    return (
      <div key={key} className="gen-ui">
        {headedProject ? (
          <header className="gen-head">
            <h3>{headedProject.name}</h3>
            <p>{headedProject.shortPitch}</p>
          </header>
        ) : null}
        {node}
        {offersLiveView && !narrow ? (
          <button type="button" className="gen-cta" onClick={() => expandSpec(target, args)}>
            <span className="spark" aria-hidden>✦</span>
            Expand view
          </button>
        ) : null}
      </div>
    );
  };

  const hasConversation = messages.length > 0 || voice.transcript.length > 0;
  conversationStartedRef.current = hasConversation || script.delivered.length > 0;

  return (
    <>
      {/*
        Never displayed directly — the orb samples it as a texture. It still has
        to be a real, playing element in the document for the browser to decode
        it, so it is parked at zero opacity rather than `display: none`, which
        some browsers treat as permission to stop decoding altogether.
      */}
      {/*
        The project film. Mounted on the same terms as the opening one — a real
        playing element the orb samples, parked at zero size rather than
        `display: none` — but kept as its own node rather than swapping `src` on
        one: a source change tears down the decoder, and the crystal ball would
        open onto a blank frame every time the agent started an answer.
      */}
      {allowFilm && !projectFilmBroken ? (
        <video
          ref={projectFilmRef}
          crossOrigin="anonymous"
          src={PROJECT_FILM}
          onError={() => setProjectFilmBroken(true)}
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: 'fixed',
            width: 2,
            height: 2,
            opacity: 0,
            pointerEvents: 'none',
            left: 0,
            bottom: 0,
          }}
        />
      ) : null}

      {opening?.projection && allowFilm && !filmBroken ? (
        <video
          ref={filmRef}
          // Before `src`, which is the only order in which it takes effect.
          // Without it a browser can decide the frames are cross-origin — a
          // redirect, a proxy, a CDN in front of the app — and sampling one
          // into WebGL then throws a SecurityError on every frame. Same-origin
          // requests ignore this entirely, so it costs nothing in the normal
          // case and is the whole fix in the abnormal one.
          crossOrigin="anonymous"
          src={opening.projection.video}
          // A film that will not load is not worth degrading the orb for: drop
          // it and let the script play over the orb exactly as it used to.
          onError={() => setFilmBroken(true)}
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: 'fixed',
            width: 2,
            height: 2,
            opacity: 0,
            pointerEvents: 'none',
            top: 0,
            left: 0,
          }}
        />
      ) : null}
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
          agentName={opening?.agentName ?? 'EBOS'}
          selfReference={opening?.selfReference ?? "Boaz's AI agent"}
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
        <p>{opening?.agentName ?? 'EBOS'}</p>
      </div>

      <ContactMethods
        owner={opening?.owner.short_name ?? 'Boaz'}
        contact={opening?.owner.contact}
      />

      <div ref={chatRef} id="chat" className={`${chatOpen ? 'open' : 'closed'}${expanded ? ' expanded' : ''}`}>
        <div id="chatHead">
          {/*
            The owner's name, shown only where the wordmark on the scene has
            had to give way to this panel — the expanded view at any width, and
            the whole open panel on a phone. The identity moves into the header
            rather than disappearing with the mark that used to carry it; which
            of those two cases applies is a question about the viewport, so CSS
            decides it and this always renders.
          */}
          <span className="headLeft">
            <span id="chatOwner">{opening?.owner.name ?? 'Boaz Ben Eli'}</span>
            <span className="headTitle">{expanded ? expanded.label : 'conversation'}</span>
          </span>
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
          {/* The introduction, then the work — and then nothing. The agent
              stops talking once the peeks are on screen (script §5). */}
          {script.delivered.map((beat) => (
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
              sandbox={portfolio?.embedSandbox ?? 'allow-scripts'}
              onOpen={(card) => void openProjectReveal(card)}
            />
          ) : null}

          {script.phase === 'done' && !hasConversation && peeks.length === 0 ? (
            <div className="starters">
              {opening?.starterPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => send(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          {messages.map((message, messageIndex) => {
            /*
             * The position is part of the key, not just the id.
             *
             * The log only ever grows, so this is as stable as the id alone,
             * and it means a repeated id cannot make React duplicate or drop a
             * turn. The cause of repeats is fixed above; this is so the log
             * stays readable if another one ever appears.
             */
            const key = `${message.id}:${messageIndex}`;
            const text = message.parts
              .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
              .map((part) => part.text)
              .join('');

            // A peek opened at this point in the conversation renders its
            // gallery here, before the turn that followed it.
            const priorReveals = revealsAt(messageIndex);

            if (message.role === 'user') {
              // A request the app made on the visitor's behalf still has to
              // carry its reveals; only the bubble is withheld.
              const hidden = (message.metadata as { hidden?: boolean } | undefined)?.hidden;
              return (
                <Fragment key={key}>
                  {priorReveals}
                  {hidden ? null : (
                    <div className="msg user" dir={directionOf(text)}>
                      {text}
                    </div>
                  )}
                </Fragment>
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

            if (!text && components.length === 0)
              return <Fragment key={key}>{priorReveals}</Fragment>;
            return (
              <Fragment key={key}>
                {priorReveals}
                <div className={`msg orb${components.length ? ' has-ui' : ''}`}>
                  {text ? <RichText text={text} dir={directionOf(text)} /> : null}
                  {components}
                </div>
              </Fragment>
            );
          })}

          {revealsAt(messages.length)}

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
          {expanded && portfolio
            ? renderComponent(expanded.name, expanded.args, portfolio, true, expandSpec)
            : null}
        </div>

        <Composer
          placeholder={DEFAULT_PLACEHOLDER}
          status={status_}
          voiceActive={voiceActive}
          onSubmit={send}
          onTyping={script.interrupt}
          onFocus={() => setChatOpen(true)}
          onToggleVoice={toggleVoice}
        />
      </div>
    </>
  );
}
