import { emit, note } from '@franzenzenhofer/intent-core/protocol';
import { EXIT, fail, type ExitCode } from './protocol.js';
import { displayTarget } from './display.js';
import { classDescription } from './risk/verify-word.js';
import type { Assessed } from './risk/assess.js';
import type { Plan } from './action.js';
import type { Origin } from './risk/policy.js';

const line = (label: string, value: string): void => {
  note(`openit:   ${label.padEnd(10)} ${value}`);
};

export interface PreviewInput {
  readonly plan: Plan;
  readonly assessed: Assessed;
  readonly origin: Origin;
  readonly score: number;
}

const flags = (assessed: Assessed): string[] => {
  const found: string[] = [];
  if (assessed.quarantine !== null) {
    found.push(`quarantine: ${assessed.quarantine.agent || 'unknown'}`);
  }
  if (assessed.facts?.escapesRoots === true) found.push('outside your roots');
  if (assessed.facts?.volume === 'external') found.push('external volume');
  if (assessed.redirect !== null) found.push(`points at ${assessed.redirect.url.href}`);
  return found;
};

/**
 * stdout gets exactly one line - the quoted argv - so the preview composes. Everything a human
 * reads goes to stderr, which is why `eval "$(openit --dry-run x)"` does the same thing openit
 * would have done.
 */
export const preview = (input: PreviewInput): void => {
  const { plan, assessed } = input;
  const verb = assessed.consent === 'refuse' ? 'would refuse' : 'would open';
  note(`openit: ${verb} ${displayTarget(plan.action.target)}`);
  if (assessed.facts !== null) line('kind', classDescription(assessed.facts.klass));
  if (assessed.url !== null) line('kind', `${assessed.url.scheme} link`);
  line('handler', plan.label === '' ? 'the system default' : plan.label);
  line('origin', `${input.origin} match, score ${String(Math.round(input.score))}`);
  const found = flags(assessed);
  if (found.length > 0) line('flags', found.join(', '));
  line('consent', assessed.consent);
  if (assessed.consent === 'refuse') {
    line('instead', `openit --reveal ${plan.action.target.name} shows it without launching it`);
    return;
  }
  emit(plan.printed);
};

/**
 * One line: the thing itself, in the spelling a program can use again. A refusal prints
 * nothing at all on stdout - handing a refused path to `$(openit which -- ...)` would let a
 * script open exactly what openit just declined to open.
 */
export const previewWhich = (input: PreviewInput): ExitCode => {
  if (input.assessed.consent === 'refuse') {
    fail(`refused ${displayTarget(input.plan.action.target)}`, 'openit --dry-run says why');
    return EXIT.refused;
  }
  emit(input.plan.action.target.ref);
  return EXIT.ok;
};

/** The same decision as one JSON object, for anything that is not a person. */
export const previewJson = (input: PreviewInput): void => {
  const { plan, assessed } = input;
  emit(JSON.stringify({
    v: 1,
    target: {
      kind: plan.action.target.kind,
      ref: plan.action.target.ref,
      display: displayTarget(plan.action.target),
      source: plan.action.target.source,
    },
    class: assessed.facts?.klass ?? null,
    scheme: assessed.url?.scheme ?? null,
    handler: { kind: plan.action.handler.kind, label: plan.label },
    origin: input.origin,
    score: Math.round(input.score),
    flags: flags(assessed),
    consent: assessed.consent,
    command: plan.command,
    argv: plan.argv,
  }));
};
