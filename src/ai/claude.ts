import type { AiContract } from '@franzenzenhofer/intent-core/ai/cli-args';

/**
 * The answer is an INTEGER, not a string.
 *
 * cdai asks a model for a path and checks that the path it names is one of the offered ones.
 * openit's offered set is heterogeneous - paths and URLs, and URLs the model only ever sees as
 * {"site","route"} - so round-tripping the answer through the thing itself is meaningless. An
 * id makes a hallucinated target structurally impossible: the only thing the model can get
 * wrong is a number, and a number that is not on the list is simply no answer.
 */
export const ANSWER_SCHEMA = JSON.stringify({
  type: 'object',
  properties: { id: { type: ['integer', 'null'] }, reason: { type: 'string' } },
  required: ['id', 'reason'],
  additionalProperties: false,
});

const SYSTEM_PROMPT =
  'You pick one item from a numbered list by its number. Reply with exactly one JSON object '
  + 'and no other text, no preamble, no explanation, no code fence.';

export const ANSWER_CONTRACT: AiContract = {
  systemPrompt: SYSTEM_PROMPT,
  schema: ANSWER_SCHEMA,
};

export interface AiAnswer {
  readonly id: number | null;
  readonly reason: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a real answer looks like. Anything else keeps the envelope search going. */
export const readAiAnswer = (value: unknown): AiAnswer | null => {
  if (!isRecord(value) || !Object.hasOwn(value, 'id')) return null;
  const id = value['id'];
  if (id !== null && (typeof id !== 'number' || !Number.isSafeInteger(id))) return null;
  const reason = value['reason'];
  return { id: id as number | null, reason: typeof reason === 'string' ? reason : '' };
};
