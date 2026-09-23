import { confirm, confirmTyped } from '@franzenzenhofer/intent-core/picker';
import { note } from '@franzenzenhofer/intent-core/protocol';
import { classDescription } from './risk/verify-word.js';
import { verifyWord } from './risk/verify-word.js';
import type { Assessed } from './risk/assess.js';
import { displayTarget } from './display.js';
import type { Plan } from './action.js';

const line = (text: string): void => note(`openit:   ${text}`);

/** What openit knows about this thing, before it asks anything about it. */
const describe = (assessed: Assessed, plan: Plan): void => {
  note(`openit: ${displayTarget(plan.action.target)}`);
  if (assessed.facts !== null) line(classDescription(assessed.facts.klass));
  if (assessed.redirect !== null) line(`it points at ${assessed.redirect.url.href}`);
  if (assessed.quarantine !== null) {
    const when = assessed.quarantine.at === null
      ? '' : ` on ${new Date(assessed.quarantine.at * 1000).toISOString().slice(0, 10)}`;
    line(`downloaded with ${assessed.quarantine.agent || 'an unknown app'}${when}`);
  }
  if (assessed.facts?.escapesRoots === true && assessed.facts.isSymlink) {
    line(`it is a link to ${assessed.facts.realPath}`);
  }
  if (plan.action.handler.kind !== 'default') line(`handler ${plan.label}`);
};

/**
 * The answer that lets this open, asked at the level the policy demanded. Consent fails closed
 * in every direction: no terminal is a decline, and a terminal that closes before answering is
 * a decline too.
 */
export const granted = (assessed: Assessed, plan: Plan): boolean => {
  if (assessed.consent === 'allow') return true;
  describe(assessed, plan);
  if (assessed.consent === 'confirm') return confirm('openit: open it?');
  const word = verifyWord(
    assessed.facts?.klass ?? 'unknown',
    assessed.url?.scheme ?? assessed.redirect?.scheme ?? '',
  );
  line('opening it runs code as you');
  return confirmTyped(`openit: type  ${word}  to open it, anything else aborts:`, word);
};
