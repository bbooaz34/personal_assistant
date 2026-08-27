/**
 * Speech for the scripted opening (recruiter script v0.1).
 *
 * The agent speaks its introduction aloud. It does this without a microphone
 * on purpose: speaking is not listening, and asking a visitor for mic access
 * before saying hello would be the wrong trade. The realtime session — which
 * does need the microphone — takes over only when they choose to talk back.
 *
 * Same voice as the realtime agent, so the representative sounds like one
 * thing whether it is introducing itself or answering a question.
 *
 * Only text the server itself authored can be synthesized. The opening is
 * config, not user input, and this endpoint refuses anything that is not one
 * of those lines — otherwise it would be an open text-to-speech proxy that
 * anyone could bill to this API key.
 */

import '@/lib/env';
import OpenAI from 'openai';
import { selectOpening } from '@par/identity';
import { identityConfig, voiceConfig } from '@par/config';

export const runtime = 'nodejs';

/** Every line the agent is allowed to say aloud, from the identity config. */
function speakableLines(): Set<string> {
  const lines = new Set<string>();
  for (const variant of identityConfig.openings.variants) {
    for (const beat of variant.beats) lines.add(beat);
    lines.add(variant.after_peeks);
  }
  return lines;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Speech is unavailable: OPENAI_API_KEY is not set.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  if (!text || !speakableLines().has(text)) {
    return Response.json({ error: 'Not a line this agent speaks.' }, { status: 400 });
  }

  try {
    const client = new OpenAI({ apiKey });
    const speech = await client.audio.speech.create({
      model: voiceConfig.speech.model,
      voice: voiceConfig.voice,
      instructions: voiceConfig.speech.instructions,
      input: text,
      response_format: 'mp3',
    });

    return new Response(speech.body, {
      headers: {
        'content-type': 'audio/mpeg',
        // The opening is fixed copy, so it caches well across visitors.
        'cache-control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('[speech] synthesis failed:', error);
    // The caller falls back to captions; a silent opening beats no opening.
    return Response.json({ error: 'Could not synthesize speech.' }, { status: 502 });
  }
}
