/**
 * Builds the browser-side realtime agent and its tools (PRD §39).
 *
 * The split here is the security boundary:
 *
 *   - `retrieve_evidence` is **privileged** and does nothing locally. It posts
 *     to a server route that runs policy and retrieval. The browser cannot
 *     widen what comes back.
 *   - The UI tools are **public actions**. They render approved components from
 *     data the server already policy-filtered, and only for ids the evidence
 *     endpoint returned in this conversation.
 */

import { RealtimeAgent, tool } from '@openai/agents-realtime';
import { z } from 'zod';
import { UI_TOOLS, isUIToolName, type UIToolName } from '@par/ui';
import { VOICE_TOOL_RETRIEVE, type VoiceEvidenceResponse } from '@par/voice';

export interface VoiceComponentCall {
  id: string;
  name: UIToolName;
  args: Record<string, unknown>;
}

export interface VoiceAgentHooks {
  /** Called when the server answers an evidence request, so the UI can track state. */
  onEvidence: (response: VoiceEvidenceResponse, question: string) => void;
  /** Called when the agent asks to render a component. */
  onComponent: (call: VoiceComponentCall) => void;
  /** Ids the agent is currently allowed to render, kept by the caller. */
  getShowableProjectIds: () => Set<string>;
  /** Session context to send with an evidence request. */
  getSessionContext: () => Record<string, unknown>;
}

function buildRetrieveTool(hooks: VoiceAgentHooks) {
  return tool({
    name: VOICE_TOOL_RETRIEVE,
    description:
      "Retrieve verified information about the person you represent. You must call this before " +
      'making any claim about their experience, projects, skills, education or work. Pass the ' +
      "visitor's question as faithfully as you can. Returns either verified evidence you may speak " +
      'from, or a refusal you must deliver.',
    parameters: z.object({
      question: z
        .string()
        .describe("The visitor's question, in their own words where possible."),
    }),
    async execute({ question }) {
      const response = await fetch('/api/realtime/evidence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, session: hooks.getSessionContext() }),
      });

      if (!response.ok) {
        // Tell the model the truth. A retrieval failure must read as "I cannot
        // check that right now", never as licence to answer from memory.
        return JSON.stringify({
          allowed: true,
          evidence: [],
          note: 'Retrieval is temporarily unavailable. Say you cannot look that up right now, and do not answer from memory.',
        });
      }

      const payload = (await response.json()) as VoiceEvidenceResponse;
      hooks.onEvidence(payload, question);

      if (!payload.allowed) {
        return JSON.stringify({
          allowed: false,
          refusal: payload.refusal,
          instruction: 'Deliver this refusal in your own speaking rhythm, then offer something useful.',
        });
      }

      return JSON.stringify({
        allowed: true,
        evidence: payload.evidence,
        showable_project_ids: payload.showableProjectIds,
        projects_with_runnable_artifacts: payload.artifactProjectIds,
        instruction:
          payload.evidence.length === 0
            ? 'Nothing matched. Say you do not have verified information on that and offer an adjacent topic.'
            : 'Speak only from this evidence. Mention when an item is unverified.',
      });
    },
  });
}

/** Turns the shared UI registry into realtime tools that render components. */
function buildComponentTools(hooks: VoiceAgentHooks, enabled: readonly string[]) {
  return enabled.filter(isUIToolName).map((name) => {
    const definition = UI_TOOLS[name];

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const parameter of definition.parameters) {
      const base =
        parameter.type === 'string[]'
          ? z.array(z.string())
          : parameter.type === 'enum'
            ? z.string()
            : z.string();
      shape[parameter.name] = parameter.required
        ? base.describe(parameter.description)
        : base.nullable().describe(`${parameter.description} Pass null if not needed.`);
    }

    return tool({
      name: definition.name,
      description: definition.description,
      parameters: z.object(shape),
      async execute(args) {
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
          if (value !== null && value !== undefined) cleaned[key] = value;
        }

        // Same containment as text: an id the evidence endpoint did not return
        // for this conversation cannot be rendered.
        const allowed = hooks.getShowableProjectIds();
        const ids = [
          ...(typeof cleaned.project_id === 'string' ? [cleaned.project_id] : []),
          ...(Array.isArray(cleaned.project_ids) ? (cleaned.project_ids as string[]) : []),
        ];
        const unknown = ids.filter((id) => !allowed.has(id));
        if (unknown.length > 0) {
          return `Not shown: ${unknown.join(', ')} is not in the evidence you retrieved. Call ${VOICE_TOOL_RETRIEVE} first, then use an id it returned.`;
        }

        hooks.onComponent({
          id: `${definition.name}-${ids.join('-') || 'default'}-${cleaned.section ?? ''}`,
          name,
          args: cleaned,
        });
        return 'Shown on screen. Keep talking — do not describe the component itself.';
      },
    });
  });
}

export function createVoiceAgent({
  name,
  instructions,
  voice,
  enabledComponents,
  hooks,
}: {
  name: string;
  instructions: string;
  voice: string;
  enabledComponents: readonly string[];
  hooks: VoiceAgentHooks;
}): RealtimeAgent {
  return new RealtimeAgent({
    name,
    instructions,
    voice,
    tools: [buildRetrieveTool(hooks), ...buildComponentTools(hooks, enabledComponents)],
  });
}
