import { emit, note } from '@franzenzenhofer/intent-core/protocol';
import { EXIT, fail, type ExitCode } from './protocol.js';
import { displayTarget } from './display.js';
import { handlerLabel } from './handler.js';
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
  /** The model's own words, when a model chose this. Shown quoted and attributed. */
  readonly reason?: string;
}

const flags = (assessed: Assessed): string[] => {
  const found: string[] = [];
  if (assessed.quarantine !== null) {
    const how = assessed.quarantine.downloaded ? 'downloaded with' : 'quarantine from';
    found.push(`${how} ${assessed.quarantine.agent || 'unknown'}`);
  }
  if (assessed.assessment.curated) found.push('installed application');
  else if (assessed.facts?.escapesRoots === true) found.push('outside your roots');
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
  const revealing = plan.action.reveal || plan.action.handler.kind === 'reveal';
  const verb = assessed.consent === 'refuse' ? 'would refuse'
    : revealing ? 'would show' : 'would open';
  note(`openit: ${verb} ${displayTarget(plan.action.target)}`);
  if (assessed.facts !== null) line('kind', classDescription(assessed.facts.klass));
  if (assessed.url !== null) line('kind', `${assessed.url.scheme} link`);
  const who = handlerLabel(plan.action.handler);
  line('handler', revealing ? 'Finder, which selects it and launches nothing'
    : who === '' ? 'the system default (whatever a double click would do)' : who);
  line('origin', `${input.origin} match, score ${String(Math.round(input.score))}`);
  if (input.reason !== undefined && input.reason !== '') line('the model', `"${input.reason}"`);
  const found = flags(assessed);
  if (found.length > 0) line('flags', found.join(', '));
  line('consent', assessed.consent);
  if (assessed.consent === 'refuse') {
    // A link cannot be shown in Finder, so offering that would be an instruction that fails.
    if (plan.action.target.kind !== 'url') {
      line('instead', `openit --reveal ${plan.action.target.name} shows it without launching it`);
    }
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
    handler: { kind: plan.action.handler.kind, label: handlerLabel(plan.action.handler) },
    origin: input.origin,
    reason: input.reason ?? null,
    score: Math.round(input.score),
    flags: flags(assessed),
    consent: assessed.consent,
    command: plan.command,
    argv: plan.argv,
  }));
};
