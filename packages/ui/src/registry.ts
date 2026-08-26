/**
 * The generative UI tool registry (design doc §8).
 *
 * The model never emits application markup. It picks from a fixed set of
 * components that the product implemented and approved, and it may only
 * reference ids that appeared in the evidence it was given. That containment
 * is what makes generative UI safe here: the worst a confused model can do is
 * ask for a component that does not resolve, which renders nothing.
 */

export const UI_TOOL_NAMES = [
  'show_project',
  'show_gallery',
  'show_video',
  'show_prototype',
  'show_timeline',
  'show_skill_map',
  'show_cv_section',
  'show_process',
  'show_transformation',
  'compare_projects',
] as const;

export type UIToolName = (typeof UI_TOOL_NAMES)[number];

export type ParameterType = 'string' | 'string[]' | 'enum';

export interface ToolParameter {
  name: string;
  type: ParameterType;
  required: boolean;
  description: string;
  /** For `enum` parameters. */
  values?: readonly string[];
  /**
   * When set, the value must be an id present in the turn's evidence bundle.
   * The agent layer enforces this before the call reaches the frontend.
   */
  mustResolveTo?: 'project' | 'skill' | 'cv_section';
}

export interface UIToolDefinition {
  name: UIToolName;
  /** Written for the model: when this component is the right answer, not what it looks like. */
  description: string;
  parameters: ToolParameter[];
  /** The React component the frontend resolver mounts. */
  component: string;
}

export const CV_SECTIONS = [
  'summary',
  'experience',
  'education',
  'skills',
  'languages',
  'full',
] as const;

export type CVSection = (typeof CV_SECTIONS)[number];

export const UI_TOOLS: Record<UIToolName, UIToolDefinition> = {
  show_project: {
    name: 'show_project',
    description:
      'Render one project as an expandable case study inside the conversation. Use when a specific ' +
      'piece of work is the answer to what was asked — not as decoration alongside every reply.',
    parameters: [
      { name: 'project_id', type: 'string', required: true, mustResolveTo: 'project',
        description: 'Id of the project, exactly as it appears in the evidence block.' },
      { name: 'focus', type: 'string', required: false,
        description: 'What the visitor should pay attention to, e.g. "the decision-making process rather than the visuals".' },
    ],
    component: 'ProjectCaseStudy',
  },
  show_gallery: {
    name: 'show_gallery',
    description:
      'Render an inline image gallery for a project. Use when the visual output itself is the evidence.',
    parameters: [
      { name: 'project_id', type: 'string', required: true, mustResolveTo: 'project',
        description: 'Id of the project whose media to show.' },
      { name: 'media_ids', type: 'string[]', required: false,
        description: 'Specific media ids to include. Omit to show the curated default set.' },
    ],
    component: 'MediaGallery',
  },
  show_video: {
    name: 'show_video',
    description: 'Play a project video inline. Use for motion work or a recorded walkthrough.',
    parameters: [
      { name: 'project_id', type: 'string', required: true, mustResolveTo: 'project',
        description: 'Id of the project the video belongs to.' },
      { name: 'media_id', type: 'string', required: false,
        description: 'Specific video to play. Omit for the project default.' },
    ],
    component: 'VideoPlayer',
  },
  show_prototype: {
    name: 'show_prototype',
    description:
      'Embed a sandboxed interactive prototype. Use only when interaction is the point — a static ' +
      'image communicates a layout perfectly well.',
    parameters: [
      { name: 'project_id', type: 'string', required: true, mustResolveTo: 'project',
        description: 'Id of the project the prototype belongs to.' },
    ],
    component: 'PrototypeEmbed',
  },
  show_timeline: {
    name: 'show_timeline',
    description:
      'Render the career timeline: roles, companies, and progression. Use for questions about ' +
      'trajectory, seniority, or how long someone did something.',
    parameters: [
      { name: 'highlight', type: 'string', required: false,
        description: 'Company or role id to emphasise.' },
    ],
    component: 'CareerTimeline',
  },
  show_skill_map: {
    name: 'show_skill_map',
    description:
      'Render skills grouped by category with the projects that evidence them. Use when someone is ' +
      'assessing breadth, or asking what a person is actually good at.',
    parameters: [
      { name: 'categories', type: 'string[]', required: false,
        description: 'Skill categories to include. Omit for all.' },
    ],
    component: 'SkillMap',
  },
  show_cv_section: {
    name: 'show_cv_section',
    description:
      'Render a section of the CV as structured content. Use when someone asks for the formal record ' +
      'rather than a conversational answer.',
    parameters: [
      { name: 'section', type: 'enum', required: true, values: CV_SECTIONS, mustResolveTo: 'cv_section',
        description: 'Which section of the CV to render.' },
    ],
    component: 'CVSection',
  },
  show_process: {
    name: 'show_process',
    description:
      'Render a project\'s process as a step-by-step view. Use when the question is about how someone ' +
      'works, not what they produced.',
    parameters: [
      { name: 'project_id', type: 'string', required: true, mustResolveTo: 'project',
        description: 'Id of the project whose process to show.' },
    ],
    component: 'ProcessView',
  },
  show_transformation: {
    name: 'show_transformation',
    description:
      "Render a project's staged visual evolution — the same product under successive design " +
      'languages. Use when someone is assessing visual craft or design-system thinking, where ' +
      'seeing the stages side by side argues better than describing them. Only some projects have one.',
    parameters: [
      { name: 'project_id', type: 'string', required: true, mustResolveTo: 'project',
        description: 'Id of the project whose transformation to show.' },
    ],
    component: 'TransformationView',
  },
  compare_projects: {
    name: 'compare_projects',
    description:
      'Show two or three projects side by side. Use when a visitor is weighing which kind of work is ' +
      'more relevant to their role.',
    parameters: [
      { name: 'project_ids', type: 'string[]', required: true, mustResolveTo: 'project',
        description: 'Two or three project ids to compare.' },
      { name: 'dimension', type: 'string', required: false,
        description: 'What to compare on, e.g. "product thinking" or "leadership scope".' },
    ],
    component: 'ProjectComparison',
  },
};

export function isUIToolName(value: string): value is UIToolName {
  return (UI_TOOL_NAMES as readonly string[]).includes(value);
}

export function toolDefinition(name: UIToolName): UIToolDefinition {
  return UI_TOOLS[name];
}
