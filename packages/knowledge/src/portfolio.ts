/**
 * Types for portfolio project packages.
 *
 * Mirrors `schemas/project-evidence-schema-v0.1.json`. A `Project` in the
 * canonical knowledge base is the retrievable *fact* about a project; a
 * `ProjectEvidence` package is the presentable *case study* — process, media,
 * and the conversation hooks that tell the agent when the work is worth
 * showing (design doc §8, §9, §29).
 */

import type { Visibility } from './types.js';

export type ProjectStatus = 'draft' | 'verified' | 'published';

export type EvidenceItemType =
  | 'source_document'
  | 'image'
  | 'video'
  | 'prototype'
  | 'workflow'
  | 'analytics'
  | 'manual_confirmation'
  | 'external_link';

export type MediaSlotType =
  | 'hero'
  | 'image'
  | 'video'
  | 'prototype'
  | 'diagram'
  | 'workflow'
  | 'before_after'
  | 'gallery';

/** The approved components the model may ask the frontend to render. */
export type PresentationComponent =
  | 'project_card'
  | 'case_study_panel'
  | 'media_gallery'
  | 'workflow_view'
  | 'prototype_embed'
  | 'video_player';

export interface ProcessStep {
  step: number;
  title: string;
  description: string;
  tools?: string[];
  media_ids?: string[];
}

export interface EvidenceItem {
  id: string;
  type: EvidenceItemType;
  label?: string;
  uri?: string | null;
  verification_status: 'verified' | 'needs_verification' | 'rejected';
  visibility?: Exclude<Visibility, 'system'>;
  notes?: string;
}

export interface MediaSlot {
  id: string;
  type: MediaSlotType;
  purpose: string;
  uri?: string | null;
  caption?: string;
  visibility?: Exclude<Visibility, 'system'>;
}

/**
 * A hook tells the agent which recruiter intent this project answers, so
 * project selection is driven by declared relevance rather than by the model
 * free-associating over a pile of case studies.
 */
export interface ConversationHook {
  recruiter_intent: string;
  trigger_topics: string[];
  agent_response_goal: string;
  recommended_media_ids?: string[];
}

/**
 * A staged visual evolution of one product.
 *
 * Distinct from `process`, which describes how the work was done. This is the
 * artefact itself at successive points — the same screens under different
 * design languages — which is the rare case where before/after carries the
 * argument better than any description of it.
 */
export interface TransformationStage {
  name: string;
  caption: string;
  detail: string;
  media_id?: string | null;
}

export interface Transformation {
  stages: TransformationStage[];
}

export interface Presentation {
  default_component?: PresentationComponent;
  short_pitch?: string;
  long_pitch?: string;
  suggested_followups?: string[];
}

export interface ProjectEvidence {
  id: string;
  name: string;
  status: ProjectStatus;
  organization?: string | null;
  context?: string;
  role?: string;
  summary: string;
  challenge?: string;
  objectives?: string[];
  responsibilities?: string[];
  process?: ProcessStep[];
  transformation?: Transformation;
  skills_demonstrated?: string[];
  tools?: string[];
  outcomes?: string[];
  metrics?: Array<Record<string, unknown>>;
  evidence: EvidenceItem[];
  media?: MediaSlot[];
  conversation_hooks?: ConversationHook[];
  presentation: Presentation;
  open_questions?: string[];
}

/**
 * Only `published` project packages may be shown to a visitor. `draft` and
 * `verified` are owner-side states: the case study exists but has not been
 * cleared for public presentation.
 */
export function isPresentable(project: ProjectEvidence): boolean {
  return project.status === 'published';
}
