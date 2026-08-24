// terminal-assistant-rules.js — deterministic free-form assistant routing

export const ASSISTANT_BUCKETS = {
  IDENTITY_USER: 'assistant_identity_user',
  IDENTITY_TERMINAL: 'assistant_identity_terminal',
  CAPABILITY: 'assistant_capability',
  CRITIQUE: 'assistant_critique',
  DIRECTIVE: 'assistant_directive',
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

const IDENTITY_USER_PATTERNS = [
  /^(who|what) am i\b/,
  /^tell me (who|what) i am\b/,
];

const IDENTITY_TERMINAL_PATTERNS = [
  /^(who|what) (are|is) (you|this)\b/,
  /^(are|is) (you|this) (real|alive|ai|a bot|human|sentient)\b/,
];

const CAPABILITY_PATTERNS = [
  /^(what can|can) (you|this) do\b/,
  /\b(can you|are you smart|are you an ai|without ai|how smart)\b/,
  /\bhow (does|do) (this|it) work\b/,
];

const CRITIQUE_PATTERNS = [
  /\b(this|that|you|it) (suck|sucks|failed|fails|missed)\b/,
  /\b(dumb|stupid|useless|broken|worse)\b/,
  /\bnot (smart|good|useful|working)\b/,
];

const DIRECTIVE_PATTERNS = [
  /^(say|tell|show|give|make|move|do|unmount|umount|delete|destroy|change)\b/,
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

  // Identity and critique need to beat command-shaped prefixes such as
  // `who are you` and broad keyword buckets such as `ai` or `build`.
  if (matchesAny(text, IDENTITY_USER_PATTERNS)) return ASSISTANT_BUCKETS.IDENTITY_USER;
  if (matchesAny(text, IDENTITY_TERMINAL_PATTERNS)) return ASSISTANT_BUCKETS.IDENTITY_TERMINAL;
  if (matchesAny(text, CAPABILITY_PATTERNS)) return ASSISTANT_BUCKETS.CAPABILITY;
  if (matchesAny(text, CRITIQUE_PATTERNS)) return ASSISTANT_BUCKETS.CRITIQUE;
  if (matchesAny(text, DIRECTIVE_PATTERNS)) return ASSISTANT_BUCKETS.DIRECTIVE;

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
