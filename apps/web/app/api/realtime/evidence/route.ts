/**
 * The privileged tool behind a voice turn (PRD §39).
 *
 * Every factual claim the voice agent makes has to come through here. That is
 * the whole security model for voice: the browser-held session begins with no
 * professional knowledge, and this endpoint — running the same policy and
 * retrieval pipeline as text — is the only way it can obtain any.
 *
 * A closed topic returns `allowed: false` with the wording to speak and no
 * evidence at all. There is nothing for a persuasive visitor to talk the model
 * out of, because the material was never sent.
 */

import '@/lib/env';
import { createSession, type SessionState } from '@par/analytics';
import { agentConfig } from '@par/config';
import type { VoiceEvidenceResponse } from '@par/voice';
import { getAgent } from '@/lib/agent';

export const runtime = 'nodejs';

interface EvidenceRequest {
  question?: unknown;
  session?: Partial<SessionState>;
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as EvidenceRequest;
  const question = typeof body.question === 'string' ? body.question.trim() : '';

  if (!question) {
    return Response.json({ error: 'No question provided.' }, { status: 400 });
  }
  // A realtime transcript can run long; a bounded input keeps retrieval
  // predictable and avoids a pathological query built from a whole monologue.
  if (question.length > 2000) {
    return Response.json({ error: 'Question too long.' }, { status: 413 });
  }

  const { agent, repository } = await getAgent();

  // Client-supplied session state can only narrow what the agent asks about.
  // Audience is decided here and is never taken from the request.
  const session: SessionState = {
    ...createSession(
      typeof body.session?.id === 'string' ? body.session.id : 'voice',
      body.session?.startedAt ?? new Date().toISOString(),
    ),
    recruiter: {
      name: null,
      company: typeof body.session?.recruiter?.company === 'string' ? body.session.recruiter.company : null,
      role: typeof body.session?.recruiter?.role === 'string' ? body.session.recruiter.role : null,
      industry: typeof body.session?.recruiter?.industry === 'string' ? body.session.recruiter.industry : null,
    },
    priorities: Array.isArray(body.session?.priorities) ? body.session.priorities.slice(0, 10) : [],
    concerns: Array.isArray(body.session?.concerns) ? body.session.concerns.slice(0, 10) : [],
    projectsShown: Array.isArray(body.session?.projectsShown) ? body.session.projectsShown.slice(0, 20) : [],
  };

  const plan = await agent.prepareTurn({ message: question, session, audience: 'public_visitor' });

  if (plan.shortCircuit) {
    console.info(
      `[voice/policy] ${plan.shortCircuit.reason} — ${plan.audit.policyReason}` +
        (plan.injection.detected ? ` | signals: ${plan.injection.signals.join(', ')}` : ''),
    );
    const refused: VoiceEvidenceResponse = {
      allowed: false,
      refusal: plan.shortCircuit.response,
      evidence: [],
      showableProjectIds: [],
      artifactProjectIds: [],
    };
    return Response.json(refused, { headers: { 'cache-control': 'no-store' } });
  }

  const evidence: VoiceEvidenceResponse['evidence'] = plan.bundle.ranked.map((scored) => {
    const item = scored.item as { claim?: string; name?: string; summary?: string; verification_status?: string };
    const text =
      scored.kind === 'fact'
        ? (item.claim ?? '')
        : scored.kind === 'skill'
          ? (item.name ?? '')
          : `${item.name ?? ''}: ${item.summary ?? ''}`;
    return {
      id: scored.id,
      kind: scored.kind,
      text,
      verified: item.verification_status === 'verified',
      sources: repository.provenanceOf(scored.id).map((s) => s.name),
    };
  });

  const showableProjectIds = [...plan.allowedProjectIds];
  const artifactProjectIds = showableProjectIds.filter((id) =>
    (repository.projectEvidence(id)?.artifacts ?? []).some(
      (a) => (a.visibility ?? 'public') === 'public' && a.sanitized,
    ),
  );

  const response: VoiceEvidenceResponse = {
    allowed: true,
    evidence,
    showableProjectIds,
    artifactProjectIds,
  };

  console.info(
    `[voice/evidence] "${question.slice(0, 60)}" → ${evidence.length} item(s), ` +
      `${plan.audit.withheldCount} withheld by policy`,
  );

  return Response.json(response, { headers: { 'cache-control': 'no-store' } });
}
