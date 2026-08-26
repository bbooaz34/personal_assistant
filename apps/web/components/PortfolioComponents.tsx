'use client';

/**
 * The approved component set (design doc §8, §9).
 *
 * Every one of these renders from `/api/portfolio` data, which is already
 * policy-filtered. None of them accept content from the model — only an id.
 * If the model asks for something that is not in the payload, the component
 * renders nothing rather than inventing a placeholder, because an empty card
 * is honest and a fabricated one is not.
 */

import type { CVData, Portfolio, PortfolioProject, PortfolioSkill, TimelineEntry } from './portfolio-types';

function Panel({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section
      aria-label={label}
      className="my-3 overflow-hidden rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)]"
    >
      {children}
    </section>
  );
}

function UnverifiedNote({ openQuestions }: { openQuestions: string[] }) {
  if (openQuestions.length === 0) return null;
  return (
    <p className="mt-3 border-t border-[var(--color-edge)] pt-3 text-xs leading-relaxed text-[var(--color-ink-faint)]">
      Not yet documented for this project: {openQuestions.slice(0, 2).join(' ').toLowerCase()}
    </p>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--color-edge)] px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)]">
      {children}
    </span>
  );
}

export function ProjectCaseStudy({
  project,
  focus,
}: {
  project: PortfolioProject;
  focus?: string;
}) {
  return (
    <Panel label={`Project: ${project.name}`}>
      <div className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-medium">{project.name}</h3>
          {project.company ? (
            <span className="text-xs text-[var(--color-ink-faint)]">{project.company}</span>
          ) : null}
        </div>

        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">{project.summary}</p>

        {focus ? (
          <p className="mt-3 border-l-2 border-[var(--color-accent-soft)] pl-3 text-sm italic text-[var(--color-ink-muted)]">
            {focus}
          </p>
        ) : null}

        {project.problem ? (
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">{project.problem}</p>
        ) : null}

        {project.outcomes.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-[var(--color-ink-muted)]">
            {project.outcomes.map((outcome) => (
              <li key={outcome} className="flex gap-2">
                <span className="text-[var(--color-accent)]">—</span>
                <span>{outcome}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {(project.skills.length > 0 || project.tools.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.skills.map((s) => <Tag key={s.id}>{s.name}</Tag>)}
            {project.tools.map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
        )}

        {!project.verified ? <UnverifiedNote openQuestions={project.openQuestions} /> : null}
      </div>
    </Panel>
  );
}

export function ProcessView({ project }: { project: PortfolioProject }) {
  if (project.process.length === 0) {
    return (
      <Panel label={`Process: ${project.name}`}>
        <p className="p-4 text-sm text-[var(--color-ink-faint)]">
          The process for {project.name} has not been documented yet.
        </p>
      </Panel>
    );
  }
  return (
    <Panel label={`Process: ${project.name}`}>
      <div className="p-4">
        <h3 className="text-base font-medium">{project.name} — how it was made</h3>
        <ol className="mt-3 space-y-3">
          {project.process.map((step) => (
            <li key={step.step} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--color-accent-soft)] text-[11px] text-[var(--color-accent)]">
                {step.step}
              </span>
              <div>
                <p className="text-sm">{step.title}</p>
                {step.description ? (
                  <p className="mt-0.5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                    {step.description}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

export function TransformationView({ project }: { project: PortfolioProject }) {
  if (project.transformation.length === 0) return null;
  return (
    <Panel label={`Visual evolution: ${project.name}`}>
      <div className="p-4">
        <h3 className="text-base font-medium">{project.name} — visual evolution</h3>
        <ol className="mt-3 space-y-0">
          {project.transformation.map((stage, index) => (
            <li key={stage.name} className="relative flex gap-3 pb-4 last:pb-0">
              {index < project.transformation.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute left-[7px] top-4 h-full w-px bg-[var(--color-edge)]"
                />
              ) : null}
              <span className="relative mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-[var(--color-accent-soft)] bg-[var(--color-surface)]" />
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="text-[var(--color-accent)]">{stage.name}</span>
                  <span className="text-[var(--color-ink-muted)]"> — {stage.caption}</span>
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-[var(--color-ink-faint)]">
                  {stage.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
          Screens for each stage are not attached yet.
        </p>
      </div>
    </Panel>
  );
}

export function MediaGallery({ project }: { project: PortfolioProject }) {
  if (project.media.length === 0) {
    return (
      <Panel label={`Gallery: ${project.name}`}>
        <p className="p-4 text-sm text-[var(--color-ink-faint)]">
          No approved visuals are attached to {project.name} yet.
        </p>
      </Panel>
    );
  }
  return (
    <Panel label={`Gallery: ${project.name}`}>
      <div className="grid grid-cols-2 gap-1 p-1">
        {project.media.map((item) => (
          <figure key={item.uri} className="overflow-hidden rounded-lg bg-[var(--color-ground)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.uri} alt={item.caption ?? project.name} className="h-full w-full object-cover" />
          </figure>
        ))}
      </div>
    </Panel>
  );
}

export function CareerTimeline({ timeline, highlight }: { timeline: TimelineEntry[]; highlight?: string }) {
  return (
    <Panel label="Career timeline">
      <div className="p-4">
        <h3 className="text-base font-medium">Career</h3>
        <ol className="mt-3 space-y-3">
          {timeline.map((entry) => {
            const emphasised =
              highlight && entry.claims.some((c) => c.toLowerCase().includes(highlight.toLowerCase()));
            return (
              <li key={entry.id} className="flex gap-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    entry.ongoing ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-ink-faint)]'
                  }`}
                />
                <div className="space-y-1">
                  <p className="text-xs text-[var(--color-ink-faint)]">
                    {formatPeriod(entry.from, entry.to)}
                  </p>
                  {entry.claims.map((claim) => (
                    <p
                      key={claim}
                      className={`text-sm leading-relaxed ${emphasised ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}`}
                    >
                      {claim}
                    </p>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}

function formatPeriod(from: string | null, to: string | null): string {
  const year = (value: string | null) => (value ? value.slice(0, 4) : '');
  if (!from) return '';
  return to ? `${year(from)} – ${year(to)}` : `${year(from)} – present`;
}

export function SkillMap({ skills, categories }: { skills: PortfolioSkill[]; categories?: string[] }) {
  const filtered = categories?.length
    ? skills.filter((s) => categories.includes(s.category))
    : skills;

  const grouped = new Map<string, PortfolioSkill[]>();
  for (const skill of filtered) {
    const existing = grouped.get(skill.category);
    if (existing) existing.push(skill);
    else grouped.set(skill.category, [skill]);
  }

  return (
    <Panel label="Skills">
      <div className="p-4">
        <h3 className="text-base font-medium">Skills, with the work behind them</h3>
        <div className="mt-3 space-y-3">
          {[...grouped.entries()].map(([category, items]) => (
            <div key={category}>
              <p className="text-xs uppercase tracking-wide text-[var(--color-ink-faint)]">{category}</p>
              <ul className="mt-1 space-y-1">
                {items.map((skill) => (
                  <li key={skill.id} className="text-sm text-[var(--color-ink-muted)]">
                    <span className="text-[var(--color-ink)]">{skill.name}</span>
                    {skill.projects.length > 0 ? (
                      <span className="text-[var(--color-ink-faint)]">
                        {' '}— {skill.projects.map((p) => p.name).join(', ')}
                      </span>
                    ) : (
                      <span className="text-[var(--color-ink-faint)]"> — no project evidence attached yet</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export function CVSection({ cv, section }: { cv: CVData; section: string }) {
  const lines = (cv as unknown as Record<string, string[]>)[section] ?? [];
  if (lines.length === 0) return null;
  return (
    <Panel label={`CV — ${section}`}>
      <div className="p-4">
        <h3 className="text-base font-medium capitalize">{section}</h3>
        <ul className="mt-2 space-y-1.5">
          {lines.map((line) => (
            <li key={line} className="text-sm leading-relaxed text-[var(--color-ink-muted)]">{line}</li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

export function ProjectComparison({
  projects,
  dimension,
}: {
  projects: PortfolioProject[];
  dimension?: string;
}) {
  if (projects.length < 2) return null;
  return (
    <Panel label="Project comparison">
      <div className="p-4">
        {dimension ? (
          <h3 className="text-base font-medium">Compared on {dimension}</h3>
        ) : (
          <h3 className="text-base font-medium">Side by side</h3>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <div key={project.id} className="rounded-lg border border-[var(--color-edge)] p-3">
              <p className="text-sm font-medium">{project.name}</p>
              <p className="mt-1 text-xs text-[var(--color-ink-faint)]">{project.company}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {project.shortPitch}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/**
 * Resolves a model-issued component call against the policy-filtered payload.
 *
 * Unknown ids return `null`. That is the containment boundary: the model
 * chooses *which* approved component to show and *which* permitted id to show
 * it for, and can do nothing else.
 */
export function renderComponent(
  name: string,
  args: Record<string, unknown>,
  portfolio: Portfolio,
): React.ReactNode {
  const projectById = (id: unknown): PortfolioProject | undefined =>
    typeof id === 'string' ? portfolio.projects.find((p) => p.id === id) : undefined;

  switch (name) {
    case 'show_project': {
      const project = projectById(args.project_id);
      return project ? (
        <ProjectCaseStudy project={project} focus={typeof args.focus === 'string' ? args.focus : undefined} />
      ) : null;
    }
    case 'show_process': {
      const project = projectById(args.project_id);
      return project ? <ProcessView project={project} /> : null;
    }
    case 'show_transformation': {
      const project = projectById(args.project_id);
      return project ? <TransformationView project={project} /> : null;
    }
    case 'show_gallery': {
      const project = projectById(args.project_id);
      return project ? <MediaGallery project={project} /> : null;
    }
    case 'show_timeline':
      return (
        <CareerTimeline
          timeline={portfolio.timeline}
          highlight={typeof args.highlight === 'string' ? args.highlight : undefined}
        />
      );
    case 'show_skill_map':
      return (
        <SkillMap
          skills={portfolio.skills}
          categories={Array.isArray(args.categories) ? (args.categories as string[]) : undefined}
        />
      );
    case 'show_cv_section':
      return typeof args.section === 'string' ? <CVSection cv={portfolio.cv} section={args.section} /> : null;
    case 'compare_projects': {
      const ids = Array.isArray(args.project_ids) ? (args.project_ids as string[]) : [];
      const projects = ids.map(projectById).filter((p): p is PortfolioProject => Boolean(p));
      return (
        <ProjectComparison
          projects={projects}
          dimension={typeof args.dimension === 'string' ? args.dimension : undefined}
        />
      );
    }
    default:
      return null;
  }
}
