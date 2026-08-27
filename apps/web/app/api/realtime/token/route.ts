/**
 * Mints a short-lived Realtime client secret (PRD §23.2).
 *
 * The permanent OPENAI_API_KEY never leaves the server. The browser receives an
 * `ek_...` secret that expires in minutes and carries a session configuration
 * chosen here — model, voice, turn detection, and the agent's instructions.
 *
 * Pinning the instructions to the token matters: the identity, tone and
 * boundaries are decided server-side and travel with the credential, so a
 * client cannot mint a session for a differently-behaved agent. It is not a
 * substitute for the real control — that is the evidence endpoint, which is
 * the only route to any fact — but it removes the easy way around it.
 */

import OpenAI from 'openai';
import { PolicyEngine } from '@par/policy';
import { buildVoiceInstructions } from '@par/identity';
import { VOICE_TOOL_RETRIEVE } from '@par/voice';
import { identityConfig, privacyConfig, voiceConfig, enabledTools } from '@par/config';
import '@/lib/env';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'Voice is unavailable: OPENAI_API_KEY is not set on the server.' },
      { status: 503 },
    );
  }

  const policy = new PolicyEngine(privacyConfig);
  const instructions = buildVoiceInstructions({
    identity: identityConfig,
    closedTopics: policy.closedTopics('public_visitor').map((rule) => ({
      topic: rule.topic,
      ...(rule.refusal ? { refusal: rule.refusal } : {}),
    })),
    availableComponents: [...enabledTools],
    evidenceTool: VOICE_TOOL_RETRIEVE,
  });

  try {
    const client = new OpenAI({ apiKey });
    const secret = await client.realtime.clientSecrets.create({
      expires_after: { anchor: 'created_at', seconds: voiceConfig.tokenTtlSeconds },
      session: {
        type: 'realtime',
        model: voiceConfig.model,
        instructions,
        audio: {
          input: {
            transcription: { model: voiceConfig.transcription.model },
            turn_detection: {
              type: voiceConfig.turnDetection.type,
              ...(voiceConfig.turnDetection.eagerness
                ? { eagerness: voiceConfig.turnDetection.eagerness }
                : {}),
              create_response: voiceConfig.turnDetection.createResponse ?? true,
              interrupt_response: voiceConfig.turnDetection.interruptResponse ?? true,
            },
          },
          output: { voice: voiceConfig.voice },
        },
      },
    } as Parameters<typeof client.realtime.clientSecrets.create>[0]);

    return Response.json(
      {
        value: secret.value,
        expiresAt: secret.expires_at,
        model: voiceConfig.model,
        // Returned so the client's RealtimeAgent carries the same instructions
        // the token was minted with. The SDK sends agent instructions on
        // connect, and mismatched copies would let whichever layer wins decide
        // the agent's behaviour. They contain identity and boundaries only --
        // never knowledge -- so there is nothing here worth withholding.
        instructions,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    // Never surface the provider's raw error to the browser — it can echo
    // request details back. Log it, return something the UI can act on.
    console.error('[realtime] failed to mint client secret:', error);
    return Response.json(
      { error: 'Could not start a voice session. Text chat is still available.' },
      { status: 502 },
    );
  }
}
