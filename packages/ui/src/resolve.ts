/**
 * Validation for UI tool calls.
 *
 * Runs between the model and the frontend. Every id a component receives must
 * have been in the evidence the model was shown for that turn — which means a
 * hallucinated or injected id cannot reach the renderer, and cannot be used to
 * probe for content the visitor was not entitled to.
 */

import { CV_SECTIONS, UI_TOOLS, isUIToolName, type UIToolName } from './registry.js';

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ResolvedToolCall {
  name: UIToolName;
  component: string;
  args: Record<string, unknown>;
}

export interface ResolutionContext {
  /** Project ids present in this turn's evidence bundle. */
  allowedProjectIds: Set<string>;
  allowedSkillIds: Set<string>;
}

export type ResolutionResult =
  | { ok: true; call: ResolvedToolCall }
  | { ok: false; reason: string };

export function resolveToolCall(call: ToolCall, context: ResolutionContext): ResolutionResult {
  if (!isUIToolName(call.name)) {
    return { ok: false, reason: `unknown component "${call.name}"` };
  }
  const definition = UI_TOOLS[call.name];
  const args: Record<string, unknown> = {};

  for (const parameter of definition.parameters) {
    const value = call.args[parameter.name];

    if (value === undefined || value === null) {
      if (parameter.required) {
        return { ok: false, reason: `${call.name}: missing required "${parameter.name}"` };
      }
      continue;
    }

    if (parameter.type === 'string[]') {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        return { ok: false, reason: `${call.name}.${parameter.name}: expected an array of strings` };
      }
    } else if (typeof value !== 'string') {
      return { ok: false, reason: `${call.name}.${parameter.name}: expected a string` };
    }

    if (parameter.type === 'enum' && !(parameter.values ?? []).includes(value as string)) {
      return {
        ok: false,
        reason: `${call.name}.${parameter.name}: expected one of ${(parameter.values ?? []).join(', ')}`,
      };
    }

    if (parameter.mustResolveTo) {
      const ids = parameter.type === 'string[]' ? (value as string[]) : [value as string];
      for (const id of ids) {
        const known =
          parameter.mustResolveTo === 'project'
            ? context.allowedProjectIds.has(id)
            : parameter.mustResolveTo === 'skill'
              ? context.allowedSkillIds.has(id)
              : (CV_SECTIONS as readonly string[]).includes(id);
        if (!known) {
          return {
            ok: false,
            reason: `${call.name}.${parameter.name}: "${id}" is not in this turn's evidence`,
          };
        }
      }
    }

    args[parameter.name] = value;
  }

  return { ok: true, call: { name: call.name, component: definition.component, args } };
}
