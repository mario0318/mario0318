// terminal-assistant.js — free-form assistant fallback for the terminal

import { classifyAssistant, ASSISTANT_BUCKETS } from './terminal-assistant-rules.js';
import { pickLine } from './terminal-responses.js';

const COMMAND_PREEMPT_BUCKETS = new Set([
  ASSISTANT_BUCKETS.IDENTITY_USER,
  ASSISTANT_BUCKETS.IDENTITY_TERMINAL,
  ASSISTANT_BUCKETS.CAPABILITY,
  ASSISTANT_BUCKETS.CRITIQUE,
  ASSISTANT_BUCKETS.DIRECTIVE,
]);

/**
 * Respond to a line that did not resolve to a registered terminal command.
 * Returns true whenever the assistant has a configured response.
 */
export function respondAssistant(raw, ctx = {}, options = {}) {
  const poolKey = classifyAssistant(raw, {
    lastCommand: ctx.lastCommand || null,
  });
  if (poolKey === ASSISTANT_BUCKETS.UNKNOWN && !options.allowUnknown) return false;
  if (options.onlyConversational && (!COMMAND_PREEMPT_BUCKETS.has(poolKey) || !/\s/.test(String(raw || '').trim()))) return false;
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
