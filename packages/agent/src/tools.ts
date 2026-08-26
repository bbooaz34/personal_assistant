/**
 * Bridging the UI registry to a model's tool-calling interface.
 *
 * Emits JSON Schema, which every provider the Vercel AI SDK supports accepts,
 * so the tool surface does not have to be re-authored per provider.
 */

import { UI_TOOLS, UI_TOOL_NAMES, type UIToolDefinition, type UIToolName } from '@par/ui';

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

function parameterSchema(definition: UIToolDefinition): ToolSchema['inputSchema'] {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const parameter of definition.parameters) {
    if (parameter.type === 'string[]') {
      properties[parameter.name] = {
        type: 'array',
        items: { type: 'string' },
        description: parameter.description,
      };
    } else if (parameter.type === 'enum') {
      properties[parameter.name] = {
        type: 'string',
        enum: parameter.values ?? [],
        description: parameter.description,
      };
    } else {
      properties[parameter.name] = { type: 'string', description: parameter.description };
    }
    if (parameter.required) required.push(parameter.name);
  }

  return { type: 'object', properties, required, additionalProperties: false };
}

export function toolSchemas(enabled?: string[]): ToolSchema[] {
  const names = (enabled ?? [...UI_TOOL_NAMES]).filter((n): n is UIToolName => n in UI_TOOLS);
  return names.map((name) => {
    const definition = UI_TOOLS[name];
    return {
      name: definition.name,
      description: definition.description,
      inputSchema: parameterSchema(definition),
    };
  });
}
