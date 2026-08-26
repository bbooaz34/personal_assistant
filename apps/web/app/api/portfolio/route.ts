/**
 * Policy-filtered portfolio data for the client to render components from.
 *
 * The client never receives the full repository — this endpoint returns the
 * same `public` slice the agent itself was allowed to retrieve. A component
 * asked to render an id that is not in this payload renders nothing, which is
 * the containment property that makes model-chosen UI safe (§8).
 */

import { PolicyEngine } from '@par/policy';
import { privacyConfig, identityConfig } from '@par/config';
import { getAgent } from '@/lib/agent';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const { repository } = await getAgent();
  const policy = new PolicyEngine(privacyConfig);
  const permitted = policy.filterForAudience(repository, 'public_visitor');

  const projects = permitted.projects.map((project) => {
    const evidence = repository.projectEvidence(project.id);
    return {
      id: project.id,
      name: project.name,
      summary: project.summary,
      problem: project.problem ?? null,
      company: project.company_id ? (repository.entity(project.company_id)?.name ?? null) : null,
      industries: (project.industry_ids ?? [])
        .map((id) => repository.entity(id)?.name)
        .filter(Boolean),
      tools: (project.tool_ids ?? []).map((id) => repository.entity(id)?.name).filter(Boolean),
      skills: repository.skillsDemonstratedBy(project.id).map((s) => ({ id: s.id, name: s.name })),
      responsibilities: project.responsibilities ?? [],
      outcomes: project.outcomes ?? [],
      process:
        evidence?.process ??
        (project.process ?? []).map((step, i) => ({ step: i + 1, title: step, description: '' })),
      transformation: evidence?.transformation?.stages.map((stage) => ({
        name: stage.name,
        caption: stage.caption,
        detail: stage.detail,
      })) ?? [],
      shortPitch: evidence?.presentation?.short_pitch ?? project.summary,
      followups: evidence?.presentation?.suggested_followups ?? [],
      verified: project.verification_status === 'verified',
      // Owner-facing caveats are omitted; open questions are not, because
      // telling a visitor what is *not* documented is the honest version.
      openQuestions: evidence?.open_questions ?? [],
      media: (project.media ?? []).filter((m) => (m.visibility ?? 'public') === 'public'),
      // Strongest authority first, so a reader sees what actually backs this.
      sources: repository
        .provenanceOf(project.id)
        .sort((a, b) => a.authority_level - b.authority_level)
        .map((s) => ({ name: s.name, authority: s.authority_level })),
    };
  });

  const skills = permitted.skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    category: skill.category,
    proficiency: skill.proficiency ?? null,
    verified: skill.verification_status === 'verified',
    projects: repository.projectsDemonstrating(skill.id).map((p) => ({ id: p.id, name: p.name })),
  }));

  // Several career facts can describe the same stretch of time — a tenure and
  // the role progression inside it, for example. Rendered one per row they read
  // as duplicates, so entries covering an identical period collapse into a
  // single point on the timeline with each claim beneath it.
  const timelineByPeriod = new Map<
    string,
    { id: string; claims: string[]; from: string | null; to: string | null; ongoing: boolean; verified: boolean }
  >();

  for (const fact of permitted.facts) {
    if (fact.category !== 'career' || !fact.valid_from) continue;
    const key = `${fact.valid_from}|${fact.valid_to ?? ''}`;
    const existing = timelineByPeriod.get(key);
    if (existing) {
      existing.claims.push(fact.claim);
      existing.verified &&= fact.verification_status === 'verified';
    } else {
      timelineByPeriod.set(key, {
        id: fact.id,
        claims: [fact.claim],
        from: fact.valid_from ?? null,
        to: fact.valid_to ?? null,
        ongoing: !fact.valid_to,
        verified: fact.verification_status === 'verified',
      });
    }
  }

  const timeline = [...timelineByPeriod.values()].sort((a, b) =>
    (b.from ?? '').localeCompare(a.from ?? ''),
  );

  const cv = {
    summary: permitted.facts.filter((f) => f.category === 'identity').map((f) => f.claim),
    experience: permitted.facts
      .filter((f) => f.category === 'career' || f.category === 'responsibility')
      .map((f) => f.claim),
    education: permitted.facts.filter((f) => f.category === 'education').map((f) => f.claim),
    skills: permitted.skills.map((s) => s.name),
    languages: identityConfig.languages,
    full: [] as string[],
  };
  cv.full = [...cv.summary, ...cv.experience, ...cv.education];

  return Response.json({ projects, skills, timeline, cv });
}
