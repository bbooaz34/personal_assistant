/**
 * Strips em dashes from a streamed answer.
 *
 * The system prompt asks for this too, and a model will still produce them:
 * it is one of the strongest habits in the training data, and an instruction
 * that holds for four sentences and fails on the fifth is not a guarantee.
 * This is the guarantee.
 *
 * Per chunk is safe. An em dash is a single code point, so it cannot be split
 * across two deltas the way a multi-character sequence could.
 */

import type { TextStreamPart, ToolSet } from 'ai';

/** `—` and `–`: the second is the one models reach for when told to avoid the first. */
const DASHES = /[—–]/g;

export function stripEmDashes(text: string): string {
  return (
    text
      // A range first, before the clause rule can turn "2020—2024" into
      // "2020, 2024" and invent a list out of a span of years.
      .replace(/(\d)\s*[—–]\s*(\d)/g, '$1-$2')
      // Spaced, it is punctuation between clauses, and a comma is what the
      // sentence would have used instead.
      .replace(/\s*[—–]\s*(?=[a-zA-Z0-9(])/g, ', ')
      // Anything left is joining rather than separating: a range, or a
      // compound. A hyphen is the honest replacement there.
      .replace(DASHES, '-')
      // A clause break landing before existing punctuation would otherwise
      // leave ", ." behind.
      .replace(/,\s*([.,;:!?])/g, '$1')
  );
}

export function noEmDashes<TOOLS extends ToolSet>(): (options: {
  tools: TOOLS;
  stopStream: () => void;
}) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>> {
  return () =>
    new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(chunk, controller) {
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
          controller.enqueue({ ...chunk, text: stripEmDashes(chunk.text) });
          return;
        }
        controller.enqueue(chunk);
      },
    });
}
