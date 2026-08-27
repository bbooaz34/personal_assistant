/**
 * Exercises the realtime voice agent without a microphone.
 *
 *   npm run voice:smoke -- "your question"
 *
 * Uses the websocket transport and text input against a running dev server, so
 * it drives the same instructions, the same tool, and the same evidence
 * endpoint the browser session uses — everything except audio capture.
 *
 * This exists because the interesting failures in a voice agent are not
 * audio failures. They are: does it retrieve before asserting, does it honour a
 * refusal, and does it admit when nothing is documented. None of those need a
 * microphone to test, and all of them are invisible to a typecheck.
 */

import { RealtimeAgent, RealtimeSession, tool } from '@openai/agents-realtime';
import { z } from 'zod';

const BASE = process.env.PAR_BASE_URL ?? 'http://localhost:3000';
const question = process.argv[2] ?? 'How many designers does he manage right now?';
const WAIT_MS = Number(process.env.PAR_VOICE_WAIT_MS ?? 30000);

const tokenResponse = await fetch(`${BASE}/api/realtime/token`, { method: 'POST' });
const token = await tokenResponse.json();
if (!token.value) {
  console.error('Could not mint a client secret:', token.error ?? token);
  process.exit(1);
}
console.log(`token ok — ${token.model}, ${token.instructions.length} chars of instructions`);

const toolCalls = [];
const retrieveEvidence = tool({
  name: 'retrieve_evidence',
  description:
    'Retrieve verified information about the person you represent. Must be called before any ' +
    'factual claim. Returns evidence to speak from, or a refusal to deliver.',
  parameters: z.object({ question: z.string() }),
  async execute({ question }) {
    const response = await fetch(`${BASE}/api/realtime/evidence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const payload = await response.json();
    toolCalls.push({ question, allowed: payload.allowed, evidence: payload.evidence?.length ?? 0 });
    return JSON.stringify(
      payload.allowed
        ? { allowed: true, evidence: payload.evidence, instruction: 'Speak only from this evidence.' }
        : { allowed: false, refusal: payload.refusal, instruction: 'Deliver this refusal naturally.' },
    );
  },
});

const agent = new RealtimeAgent({
  name: 'representative',
  instructions: token.instructions,
  tools: [retrieveEvidence],
});
const session = new RealtimeSession(agent, { transport: 'websocket', model: token.model });

const spoken = [];
session.on('error', (event) => console.error('session error:', JSON.stringify(event).slice(0, 300)));
session.on('agent_end', (_context, _agent, output) => spoken.push(output));
session.on('agent_tool_start', (_c, _a, t) => console.log(`  → ${t.name}`));

await session.connect({ apiKey: token.value, model: token.model });
console.log(`connected (websocket)\nasked: "${question}"\n`);
session.sendMessage(question);

// The agent typically speaks, retrieves, then speaks again. Waiting a fixed
// window captures the whole turn; exiting on the first `agent_end` would cut it
// off before the tool call and make it look as though retrieval never happened.
await new Promise((resolve) => setTimeout(resolve, WAIT_MS));

console.log('said:');
for (const line of spoken) console.log(`  ${line}`);
console.log('\ntool calls:', toolCalls.length ? JSON.stringify(toolCalls, null, 1) : 'none');

session.close();
process.exit(0);
