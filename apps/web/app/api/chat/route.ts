/**
 * The conversational turn.
 *
 * The route is deliberately thin. Every decision about what may be said was
 * already made by `agent.prepareTurn` before a model is involved; this file
 * only carries the result to a provider and streams the answer back.
 */

import { convertToModelMessages, jsonSchema, streamText, tool, type UIMessage } from 'ai';
import { createSession, applyUpdate, type SessionState } from '@par/analytics';
import { agentConfig } from '@par/config';
import { getAgent } from '@/lib/agent';
import { hasCredentials, resolveModel } from '@/lib/model';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ChatRequest {
  messages: UIMessage[];
  session?: Partial<SessionState>;
}

function latestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== 'user') continue;
    return message.parts
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join(' ')
      .trim();
  }
  return '';
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as ChatRequest;
  const question = latestUserText(body.messages ?? []);

  if (!question) {
    return Response.json({ error: 'No message provided.' }, { status: 400 });
  }

  const { agent } = await getAgent();

  // The client owns session state and sends it back each turn. It is treated
  // as untrusted input: it can only *narrow* what the agent asks about, never
  // widen what it may retrieve. Audience is decided here, not by the client.
  const session: SessionState = applyUpdate(
    createSession(
      typeof body.session?.id === 'string' ? body.session.id : 'anonymous',
      body.session?.startedAt ?? new Date().toISOString(),
    ),
    {
      ...(body.session?.recruiter ? { recruiter: body.session.recruiter } : {}),
      ...(body.session?.priorities ? { priorities: body.session.priorities } : {}),
      ...(body.session?.concerns ? { concerns: body.session.concerns } : {}),
      ...(body.session?.projectsShown ? { projectsShown: body.session.projectsShown } : {}),
    },
    new Date().toISOString(),
  );

  const plan = await agent.prepareTurn({ message: question, session, audience: 'public_visitor' });

  // A refusal or a detected injection never reaches a model. Answering these
  // from a fixed string is the point: there is no prompt to talk around.
  if (plan.shortCircuit) {
    console.info(
      `[policy] ${plan.shortCircuit.reason} — ${plan.audit.policyReason}` +
        (plan.injection.detected ? ` | injection signals: ${plan.injection.signals.join(', ')}` : ''),
    );
    return new Response(plan.shortCircuit.response, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-par-short-circuit': plan.shortCircuit.reason },
    });
  }

  if (!hasCredentials(agentConfig.model)) {
    return Response.json(
      {
        error:
          `No API key for provider "${agentConfig.model.provider}". ` +
          'Copy .env.example to .env and set the matching key.',
      },
      { status: 503 },
    );
  }

  const tools = Object.fromEntries(
    plan.tools.map((schema) => [
      schema.name,
      // No `execute`: these are rendered by the client. The server never
      // resolves them to content, so a hallucinated id yields an empty
      // component rather than fabricated evidence.
      tool({ description: schema.description, inputSchema: jsonSchema(schema.inputSchema) }),
    ]),
  );

  const result = streamText({
    model: resolveModel(agentConfig.model),
    system: plan.systemPrompt,
    messages: convertToModelMessages(body.messages),
    tools,
    temperature: agentConfig.model.temperature ?? 0.4,
    ...(agentConfig.model.maxOutputTokens ? { maxOutputTokens: agentConfig.model.maxOutputTokens } : {}),
  });

  return result.toUIMessageStreamResponse();
}
