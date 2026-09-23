import { lstatSync, statSync } from 'node:fs';
import { askBackend, sanitizeReason } from '@franzenzenhofer/intent-core/ai/ask';
import { resolveAiBackend, type AiConfig } from '@franzenzenhofer/intent-core/ai/backend';
import { isUnderRoot, realPathOr } from '@franzenzenhofer/intent-core/paths';
import { productEnv } from '@franzenzenhofer/intent-core/product';
import { ANSWER_CONTRACT, readAiAnswer } from './claude.js';
import { buildPrompt, candidatesFor, matchAiId, type Candidate } from './prompt.js';
import type { Target } from '../target.js';

export interface AiInput {
  readonly query: string;
  readonly targets: readonly Target[];
  readonly roots: readonly string[];
  readonly ai: AiConfig;
}

export type AiOutcome =
  | { readonly kind: 'target'; readonly target: Target; readonly reason: string }
  | { readonly kind: 'none'; readonly why: string };

/**
 * Everything the policy will be asked about, checked again from scratch between the model's
 * answer and the question put to the person. The gap between ranking and deciding is small,
 * but it is a gap, and a symlink can be repointed inside it.
 */
export const revalidate = (target: Target, roots: readonly string[]): boolean => {
  if (target.kind === 'url') return true;
  try {
    lstatSync(target.ref);
    statSync(target.ref);
  } catch {
    return false;
  }
  const real = realPathOr(target.ref);
  return roots.some((root) => isUnderRoot(real, root));
};

const debugOn = (): boolean => productEnv('DEBUG') === '1';

export const askAi = async (input: AiInput): Promise<AiOutcome> => {
  if (!input.ai.enabled) return { kind: 'none', why: 'the AI tier is off' };
  const backend = resolveAiBackend(input.ai);
  if (backend === null) return { kind: 'none', why: 'no AI backend found' };
  const candidates: readonly Candidate[] = candidatesFor(input);
  if (candidates.length === 0) return { kind: 'none', why: 'nothing inside your roots to offer' };
  const asked = await askBackend(backend, buildPrompt(input.query, candidates), {
    contract: ANSWER_CONTRACT,
    timeoutMs: input.ai.timeoutMs,
    read: readAiAnswer,
    debug: debugOn(),
  });
  if (asked.kind === 'none') return { kind: 'none', why: asked.why };
  const reason = sanitizeReason(asked.answer.reason);
  const chosen = matchAiId(candidates, asked.answer.id);
  if (chosen === null) {
    return { kind: 'none', why: reason === '' ? 'nothing on the list matched' : reason };
  }
  if (!revalidate(chosen.target, input.roots)) {
    return { kind: 'none', why: 'it moved between the question and the answer' };
  }
  return { kind: 'target', target: chosen.target, reason };
};
