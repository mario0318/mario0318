// terminal-assistant.js — free-form assistant fallback for the terminal

import { classifyAssistant, ASSISTANT_BUCKETS } from './terminal-assistant-rules.js';
import { pickLine } from './terminal-responses.js';

/**
 * Respond to a line that did not resolve to a registered terminal command.
 * Returns true whenever the assistant has a configured response.
 */
export function respondAssistant(raw, ctx = {}) {
  const poolKey = classifyAssistant(raw, {
    lastCommand: ctx.lastCommand || null,
  });
  const line = pickLine(poolKey, 'default');
  if (!line) return false;

  ctx.print?.(line);

  // terminal.js owns the normal dot state; this hook is available to hosts
  // that want the assistant to communicate status directly.
  if (ctx.setStatus) {
    switch (poolKey) {
      case ASSISTANT_BUCKETS.BUILDER:
      case ASSISTANT_BUCKETS.LORE:
        ctx.setStatus('ok');
        break;
      case ASSISTANT_BUCKETS.SMALLTALK:
      case ASSISTANT_BUCKETS.GAME:
        ctx.setStatus('neutral');
        break;
      case ASSISTANT_BUCKETS.META:
      case ASSISTANT_BUCKETS.UNKNOWN:
      default:
        ctx.setStatus('warning');
        break;
    }
  }

  return true;
}
