'use client';

/**
 * Drives a realtime voice session from React (PRD §23).
 *
 * Owns connection lifecycle, microphone permission, presence state, the spoken
 * transcript, and components the agent renders mid-sentence. Everything
 * security-relevant lives behind the evidence endpoint — see `voice-session.ts`.
 */

import { RealtimeSession } from '@openai/agents-realtime';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceConnectionState, VoiceFailureReason, VoiceEvidenceResponse } from '@par/voice';
import { createVoiceAgent, type VoiceComponentCall } from '@/lib/voice-session';

export interface VoiceTranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Components the agent rendered during this turn. */
  components: VoiceComponentCall[];
}

export interface UseVoiceSession {
  state: VoiceConnectionState;
  failure: VoiceFailureReason | null;
  /** True while the agent is producing audio. */
  speaking: boolean;
  /** True while the agent is inside a tool call — retrieving evidence. */
  thinking: boolean;
  muted: boolean;
  transcript: VoiceTranscriptEntry[];
  start: () => Promise<void>;
  stop: () => void;
  toggleMute: () => void;
  /** Send text into a live voice session (§23.4). */
  sendText: (text: string) => void;
}

interface TokenResponse {
  value: string;
  model: string;
  instructions: string;
  error?: string;
}

/** History items carry either typed text or an audio transcript, depending on modality. */
function textOf(item: unknown): string {
  const content = (item as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      const p = part as { type?: string; text?: string; transcript?: string };
      if (p.type === 'input_text' || p.type === 'text' || p.type === 'output_text') return p.text ?? '';
      if (p.type === 'input_audio' || p.type === 'audio' || p.type === 'output_audio') return p.transcript ?? '';
      return '';
    })
    .join('')
    .trim();
}

export function useVoiceSession({
  enabledComponents,
  voice,
  agentName,
  getSessionContext,
  conversationStarted,
}: {
  enabledComponents: readonly string[];
  voice: string;
  agentName: string;
  getSessionContext: () => Record<string, unknown>;
  /** True when the visitor has already been greeted in text. */
  conversationStarted?: () => boolean;
}): UseVoiceSession {
  const [state, setState] = useState<VoiceConnectionState>('disconnected');
  const [failure, setFailure] = useState<VoiceFailureReason | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<VoiceTranscriptEntry[]>([]);

  const sessionRef = useRef<RealtimeSession | null>(null);
  const showableIds = useRef<Set<string>>(new Set());
  const componentsByTurn = useRef<Map<string, VoiceComponentCall[]>>(new Map());
  const latestAssistantId = useRef<string | null>(null);
  const contextRef = useRef(getSessionContext);
  contextRef.current = getSessionContext;

  const stop = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setState('disconnected');
    setSpeaking(false);
    setMuted(false);
  }, []);

  // A live microphone must not outlive the page.
  useEffect(() => () => sessionRef.current?.close(), []);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    setFailure(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || !('RTCPeerConnection' in window)) {
      setFailure('unsupported_browser');
      setState('failed');
      return;
    }

    // Ask for the microphone before minting a token, so a denial does not burn
    // a credential and the browser prompt arrives when the user expects it.
    setState('requesting_permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // The SDK opens its own capture; release this probe immediately.
      for (const track of stream.getTracks()) track.stop();
    } catch (error) {
      const name = (error as { name?: string }).name;
      setFailure(name === 'NotAllowedError' || name === 'SecurityError' ? 'microphone_denied' : 'microphone_unavailable');
      setState('failed');
      return;
    }

    setState('connecting');

    let token: TokenResponse;
    try {
      const response = await fetch('/api/realtime/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationStarted: conversationStarted?.() ?? false }),
      });
      token = (await response.json()) as TokenResponse;
      if (!response.ok || !token.value) throw new Error(token.error ?? 'no token');
    } catch {
      setFailure('token_unavailable');
      setState('failed');
      return;
    }

    const agent = createVoiceAgent({
      name: agentName,
      instructions: token.instructions,
      voice,
      enabledComponents,
      hooks: {
        onEvidence: (payload: VoiceEvidenceResponse) => {
          if (!payload.allowed) return;
          for (const id of payload.showableProjectIds) showableIds.current.add(id);
        },
        onComponent: (call) => {
          const turnId = latestAssistantId.current ?? 'pending';
          const existing = componentsByTurn.current.get(turnId) ?? [];
          if (!existing.some((c) => c.id === call.id)) {
            componentsByTurn.current.set(turnId, [...existing, call]);
          }
          setTranscript((entries) =>
            entries.map((entry) =>
              entry.id === turnId
                ? { ...entry, components: componentsByTurn.current.get(turnId) ?? [] }
                : entry,
            ),
          );
        },
        getShowableProjectIds: () => showableIds.current,
        getSessionContext: () => contextRef.current(),
      },
    });

    const session = new RealtimeSession(agent, { transport: 'webrtc', model: token.model });
    sessionRef.current = session;

    session.on('audio_start', () => setSpeaking(true));
    session.on('audio_stopped', () => setSpeaking(false));
    session.on('audio_interrupted', () => setSpeaking(false));
    // Tool calls are the agent's reasoning beat: the presence shows a
    // heartbeat while evidence is being retrieved (§21: thinking state).
    session.on('agent_tool_start', () => setThinking(true));
    session.on('agent_tool_end', () => setThinking(false));
    session.on('error', (event) => {
      console.error('[voice] session error', event);
    });

    session.on('history_updated', (history) => {
      const entries: VoiceTranscriptEntry[] = [];
      for (const item of history) {
        if ((item as { type?: string }).type !== 'message') continue;
        const role = (item as { role?: string }).role;
        if (role !== 'user' && role !== 'assistant') continue;
        const text = textOf(item);
        const id = (item as { itemId?: string; id?: string }).itemId ?? (item as { id?: string }).id ?? '';
        if (!id) continue;
        if (role === 'assistant') latestAssistantId.current = id;

        // Carry over any components attached before this turn had an id.
        const pending = componentsByTurn.current.get('pending');
        if (role === 'assistant' && pending?.length) {
          componentsByTurn.current.set(id, [...(componentsByTurn.current.get(id) ?? []), ...pending]);
          componentsByTurn.current.delete('pending');
        }

        const components = componentsByTurn.current.get(id) ?? [];
        if (!text && components.length === 0) continue;
        entries.push({ id, role, text, components });
      }
      setTranscript(entries);
    });

    try {
      await session.connect({ apiKey: token.value, model: token.model });
      setState('connected');
    } catch (error) {
      console.error('[voice] failed to connect', error);
      sessionRef.current = null;
      setFailure('transport_failed');
      setState('failed');
    }
  }, [agentName, enabledComponents, voice, conversationStarted]);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const next = !muted;
    session.mute(next);
    setMuted(next);
  }, [muted]);

  const sendText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !sessionRef.current) return;
    sessionRef.current.sendMessage(trimmed);
  }, []);

  return { state, failure, speaking, thinking, muted, transcript, start, stop, toggleMute, sendText };
}
