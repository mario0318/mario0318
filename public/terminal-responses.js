// terminal-responses.js — voice layer for the mario0318 terminal
// Spec: TERMINAL_SPEC.md §6 / §6.1
// Rules: lowercase, terse, dry. dispatcher fills placeholders; applets never format.
// All strings printed via ctx.print -> textContent. No HTML anywhere in here.

let responsePools = {
  help: {
    default: [
      'some things you can ask this thing to do. not all of them, on purpose.',
      "here's a small slice of what works. the rest you'll find the usual way: typing.",
      "minimal tour coming up. if you're the exhaustive type, you're in the wrong terminal.",
    ],
    keys: [
      'keyboard things:',
      '  enter      run the line',
      '  tab        complete, not move focus',
      '  esc        escape, then tab to move focus',
      '  esc again  close panels and portals',
      'reduced-motion and screen readers get the same commands. the dots behave differently, not the keys.',
    ],
  },

  projects: {
    default: [
      "opening projects. they took a while; this won't.",
      'projects coming up. things that escaped the notebook.',
      'loading the things that actually shipped.',
    ],
  },

  play: {
    default: [
      'dealing you: {title}',
      "today's draw from the vault: {title}",
      'the vault picked one: {title}',
    ],
    list: [
      'listing the vault instead of spinning it.',
      'switching to the catalog. pick your own noise.',
    ],
    empty: [
      "vault's quiet. soundcloud is either sulking or the list is empty.",
      "couldn't get a track list. try again later. the silence is not a feature.",
    ],
  },

  analemma: {
    default: [
      'sending you over to analemma.',
      "studio's up. panel's taking you there.",
      'opening analemma in the side channel.',
    ],
    teaser: [
      "analemma's slot is here. the studio's catching up.",
      'panel is a teaser for now. the studio moves in later.',
    ],
  },

  contact: {
    default: [
      'opening ways to reach in.',
      'bringing up contact things. you talk, the site listens.',
      'portal for reaching out, coming up.',
    ],
  },

  clear: {
    default: [
      'screen swept. the terminal remembers more than it shows.',
      "cleared. the past lines are gone; the state isn't.",
      'log wiped. dots and commands stay exactly how they were.',
    ],
    nothing: ['nothing much to clear, but it still felt right.'],
  },

  close: {
    default: [
      "closed that. terminal's back on primary duty.",
      'panel shut. prompt has the floor again.',
      "portal's gone. the shell stayed.",
    ],
    nothing: ['nothing open to close. bold move anyway.'],
  },

  unknown: {
    default: [
      'no idea what that means. respect the attempt though.',
      "that's not a thing. yet.",
      'tried it. nothing happened. suspicious.',
      'the dots looked at each other. nothing.',
      '{input}: command not found. story of its life.',
      'whatever that was, the terminal shrugged.',
      'typed it, ran it, reality declined.',
      'the command table stared at that string and stayed quiet.',
    ],
  },

  easter: {
    whoami: [
      "that's the question, isn't it.",
      "labels are cheap. behavior's more expensive.",
    ],
    sudo: [
      'absolutely not.',
      'still no. the terminal admires the attempt, not the plan.',
    ],
    exit: [
      "you can't leave. kidding. it's a website. close the tab.",
      'still a website. still exitless.',
    ],
    rmrf: ['bold. no.', 'ambitious, but the filesystem here is imaginary.'],
    hello: ['hey.', 'hey. typing already puts you in the top percentile.'],
    fortyTwo: ['yes.', 'agreed. not elaborating.'],
    dotsLabOpen: [
      "lab's open. try not to break the dots. you can, but don't.",
      'wiring the dots directly to you. sliders first, chaos later.',
      'dots-lab online. the status lights just became your problem.',
    ],
    dotsLabReset: ['dots back to default. the breathing is normal again.'],
  },
};

// ---------------------------------------------------------------------------
// rotation: per-pool sequential, random start per page load, no repeat until
// pool exhausts within a session. state is one Map; nothing persisted.
// ---------------------------------------------------------------------------

const responseIndex = new Map();
const responseRecent = new Map();
let selectionSettings = { selectionMode: 'sequential', noRepeatWindow: 0 };

export function configureResponses(pools = {}, settings = {}) {
  for (const [key, value] of Object.entries(pools)) {
    if (Array.isArray(value)) {
      responsePools[key] = { ...(responsePools[key] || {}), default: value };
    } else if (value && typeof value === 'object') {
      responsePools[key] = { ...(responsePools[key] || {}), ...value };
    }
  }
  selectionSettings = { ...selectionSettings, ...settings };
  responseIndex.clear();
  responseRecent.clear();
}

export function pickLine(poolKey, variant = 'default') {
  const group = responsePools[poolKey];
  if (!group) return null;
  const rawPool = group[variant] || group.default;
  if (!rawPool || rawPool.length === 0) return null;
  const pool = rawPool
    .map((item) => typeof item === 'string' ? { text: item, weight: 1, enabled: true } : item)
    .filter((item) => item && item.enabled !== false && typeof item.text === 'string');
  if (pool.length === 0) return null;

  const key = `${poolKey}:${variant}`;
  if (selectionSettings.selectionMode === 'random' || selectionSettings.selectionMode === 'weighted') {
    const recent = responseRecent.get(key) || [];
    const available = pool.filter((item) => !recent.includes(item.text));
    const candidates = available.length ? available : pool;
    let picked;
    if (selectionSettings.selectionMode === 'weighted') {
      const total = candidates.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
      let cursor = Math.random() * (total || candidates.length);
      picked = candidates[candidates.length - 1];
      for (const item of candidates) {
        cursor -= total ? Math.max(0, Number(item.weight) || 0) : 1;
        if (cursor <= 0) { picked = item; break; }
      }
    } else {
      picked = candidates[Math.floor(Math.random() * candidates.length)];
    }
    const windowSize = Math.max(0, Number(selectionSettings.noRepeatWindow) || 0);
    responseRecent.set(key, [...recent, picked.text].slice(-windowSize));
    return picked.text;
  }
  if (!responseIndex.has(key)) {
    responseIndex.set(key, Math.floor(Math.random() * pool.length));
  }
  const idx = responseIndex.get(key);
  responseIndex.set(key, idx + 1);
  return pool[idx % pool.length].text;
}

// function-form replacement: `$` sequences in track titles or typed input
// must never be interpreted as replacement patterns.
export function formatLine(line, ctx = {}) {
  if (!line) return null;
  return line
    .replace('{title}', () => ctx.title ?? '')
    .replace('{input}', () => ctx.input ?? '');
}

// help `keys` block is printed verbatim, in order, not rotated.
export function helpKeysLines() {
  return responsePools.help.keys.slice();
}

// ---------------------------------------------------------------------------
// easter eggs: matched on raw trimmed input BEFORE registry lookup.
// returns a line or null. exact matches except sudo prefix.
// ---------------------------------------------------------------------------

export function pickEaster(rawInput) {
  const raw = (rawInput || '').trim().toLowerCase();
  if (raw === 'whoami') return pickLine('easter', 'whoami');
  if (raw === 'sudo' || raw.startsWith('sudo ')) return pickLine('easter', 'sudo');
  if (raw === 'exit' || raw === 'quit' || raw === ':q') return pickLine('easter', 'exit');
  if (raw === 'rm -rf /' || raw === 'rm -rf /*') return pickLine('easter', 'rmrf');
  if (raw === 'hello' || raw === 'hi' || raw === 'hey') return pickLine('easter', 'hello');
  if (raw === '42') return pickLine('easter', 'fortyTwo');
  return null;
}
