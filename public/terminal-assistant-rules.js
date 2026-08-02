// terminal-assistant-rules.js — deterministic free-form assistant routing

export const ASSISTANT_BUCKETS = {
  BUILDER: 'assistant_builder',
  SMALLTALK: 'assistant_smalltalk',
  LORE: 'assistant_lore',
  META: 'assistant_meta',
  GAME: 'assistant_game',
  UNKNOWN: 'assistant_unknown',
};

const BUILDER_KEYWORDS = [
  'builder', 'build', 'systems', 'signal', 'code', 'ship', 'design', 'product',
  'idea', 'project', 'startup', 'engineer', 'developer', 'hack', 'hacker',
  'prototype', 'launch', 'deploy', 'scale', 'mvp', 'stack', 'api', 'backend',
  'frontend', 'database', 'server', 'cloud', 'ai', 'model', 'prompt', 'agent',
  'automation', 'pipeline', 'resume', 'portfolio', 'freelance', 'client', 'brand',
];

const SMALLTALK_KEYWORDS = [
  'bored', 'lost', 'stuck', 'confused', 'cool', 'weird', 'creepy', 'scary', 'fun',
  'boring', 'test', 'testing', 'why', 'wow', 'damn', 'lol', 'haha', 'nice', 'ok',
  'okay', 'sure', 'alright', 'yo', 'sup',
];

const LORE_KEYWORDS = [
  'vault', 'orbital', 'gravity', 'static', 'reflection', 'mirror', 'glow', 'dark',
  'light', 'quiet', 'noise', 'watch', 'wait', 'patience', 'drift', 'focus', 'chaos',
  'order', 'control', 'trust', 'real', 'fake', 'truth', 'lie', 'secret', 'mystery',
  'riddle', 'puzzle', 'game', 'play', 'music', 'sound', 'track', 'beat', 'rhythm',
];

const META_PATTERNS = [
  /how (does|do) (this|it) work/,
  /(who|what) (are|is) you/,
  /(are|is) (you|this) (real|fake|ai)/,
  /what can you do/,
  /why (are|is) (you|this) so (weird|creepy|slow)/,
];

const QUESTION_PATTERN = /\?$/;

function normalize(raw) {
  return (raw || '').trim().toLowerCase();
}

function containsAny(raw, words) {
  return words.some((word) => raw.includes(word));
}

function matchesAny(raw, patterns) {
  return patterns.some((pattern) => pattern.test(raw));
}

/**
 * Classify a line into a response-pool key. This is intentionally local and
 * deterministic: no model, network request, or conversation memory involved.
 */
export function classifyAssistant(raw, ctx = {}) {
  const text = normalize(raw);
  if (!text) return ASSISTANT_BUCKETS.UNKNOWN;

  // Explicit lore comes first because it is part of the terminal's mythology.
  if (containsAny(text, LORE_KEYWORDS)) return ASSISTANT_BUCKETS.LORE;

  if (containsAny(text, BUILDER_KEYWORDS)) return ASSISTANT_BUCKETS.BUILDER;

  // A running game can offer a more useful reaction than generic smalltalk.
  const lastCommand = String(ctx.lastCommand || '').toLowerCase();
  if (lastCommand.startsWith('game_') && containsAny(text, ['hint', 'stuck', 'lost', 'confused'])) {
    return ASSISTANT_BUCKETS.GAME;
  }

  if (containsAny(text, SMALLTALK_KEYWORDS)) return ASSISTANT_BUCKETS.SMALLTALK;

  if (matchesAny(text, META_PATTERNS) || QUESTION_PATTERN.test(text)) {
    return ASSISTANT_BUCKETS.META;
  }

  return ASSISTANT_BUCKETS.UNKNOWN;
}
