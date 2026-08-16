// terminal.js — host for the mario0318 terminal
// Spec: TERMINAL_SPEC.md §2 dots, §3 DOM, §5 registry, §7 applet contract
//
// Owns: boot, input, parser, output log, dot state, portal/panel hosting,
// applet lifecycle. Does NOT own voice (terminal-responses.js) or command
// outcomes (terminal-dispatch.js).
//
// Hard rule: output via textContent only.

import { respond, setRegistry } from './terminal-dispatch.js';
import { configureResponses } from './terminal-responses.js';

const $ = (id) => document.getElementById(id);
const el = { term: null, out: null, cmd: null, dots: null, portal: null, panel: null };

const MAX_LINES = 500;
const LIVE_CONFIG_URL = 'https://firestore.googleapis.com/v1/projects/mario0318-terminal-live/databases/(default)/documents/terminal/config';
const LIVE_CACHE_KEY = 'mario0318-terminal-live-config-v1';
const LIVE_CACHE_TTL = 5 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 8000;

let registry = [];
let byName = new Map();
let history = [];
let histIdx = -1;
let openApplet = null;
let dotTimer = null;

// ---------------------------------------------------------------- dots (§2)

function setDots(state) {
  if (!el.dots) return;
  clearTimeout(dotTimer);
  const persistent = el.dots.classList.contains('elevated');
  el.dots.className = 'dots ' + state + (persistent ? ' elevated' : '');
  if (state === 'ok' || state === 'err') {
    dotTimer = setTimeout(() => setDots('idle'), state === 'err' ? 600 : 420);
  }
}

// ---------------------------------------------------------------- output (§3)

let stagger = 0;
function print(text = '', cls = '') {
  const line = document.createElement('div');
  line.className = 'line' + (cls ? ' ' + cls : '');
  if (stagger > 0 && stagger <= 8) line.classList.add('s' + stagger);
  line.textContent = String(text);
  el.out.appendChild(line);
  stagger++;
  while (el.out.childElementCount > MAX_LINES) el.out.firstElementChild.remove();
  el.out.scrollTop = el.out.scrollHeight;
  return line;
}

function clearLog() {
  if (openApplet?.inline) unmountApplet();
  el.out.replaceChildren();
}
function logHasContent() { return el.out.childElementCount > 0; }

// ---------------------------------------------------------------- portal (§3)

const portalContent = {
  projects: () => registry.filter((c) => c.category === 'explore' || c.category === 'toys'),
};

const raul3Links = [
  ['Raul3', 'https://raul3.com', 'the builder site'],
  ['dapp.cam', 'https://dapp.cam', 'a visual conversation camera'],
  ['sprime.io', 'https://sprime.io', 'privacy-preserving age verification'],
  ['Analemma Studio', 'https://raul3.com/analemma/', 'interactive 3D solar geometry'],
  ['Gravity Lab', 'https://raul3.com/gravity-lab', 'bodies, mass, and force in motion'],
  ['Contact', 'mailto:hi@mario0318.com', 'hi@mario0318.com'],
  ['GitHub', 'https://github.com/mario0318', 'code, releases, and public work'],
];

function openPortal(id, data) {
  el.portal.querySelector('#portal-title').textContent =
    id === 'raul3' ? 'R3 Labs / mario0318'
    : id === 'identity' ? 'mario0318'
    : id === 'projects' ? 'things that got built'
    : id === 'contact' ? 'reach out'
    : id === 'play-list' ? 'audio vault'
    : id;

  const body = el.portal.querySelector('#portal-body');
  body.replaceChildren();

  if (id === 'raul3') {
    for (const [label, href, description] of raul3Links) {
      const a = document.createElement('a');
      a.className = 'p-item p-link';
      a.href = href;
      a.textContent = label;
      const s = document.createElement('small');
      s.textContent = description;
      a.appendChild(s);
      body.appendChild(a);
    }
  } else if (id === 'identity') {
    const links = [
      ['GitHub', 'https://github.com/mario0318', 'code, releases, and public work'],
      ['Contact', 'mailto:hi@mario0318.com', 'hi@mario0318.com'],
      ['Analemma Studio', 'https://raul3.com/analemma/', 'interactive 3D solar geometry'],
      ['Gravity Lab', 'https://raul3.com/gravity-lab', 'bodies, mass, and force in motion'],
    ];
    for (const [label, href, description] of links) {
      const a = document.createElement('a');
      a.className = 'p-item p-link';
      a.href = href;
      a.textContent = label;
      const s = document.createElement('small');
      s.textContent = description;
      a.appendChild(s);
      body.appendChild(a);
    }
  } else if (id === 'contact') {
    const a = document.createElement('a');
    a.className = 'p-item p-link';
    a.href = 'mailto:hi@mario0318.com';
    a.textContent = 'hi@mario0318.com';
    body.appendChild(a);
  } else if (id === 'play-list' && data) {
    for (const t of data) {
      const b = document.createElement('button');
      b.className = 'p-item';
      b.type = 'button';
      b.textContent = t.title;
      b.addEventListener('click', async () => {
        closePortal();
        await mountApplet('audio-vault', t, false);
      });
      body.appendChild(b);
    }
  } else {
    for (const c of portalContent.projects()) {
      const b = document.createElement('button');
      b.className = 'p-item';
      b.type = 'button';
      b.textContent = c.name;
      const s = document.createElement('small');
      s.textContent = c.desc || '';
      b.appendChild(s);
      b.addEventListener('click', () => { closeAll(); run(c.name); });
      body.appendChild(b);
    }
  }

  el.portal.showModal();
}

function closePortal() {
  if (!el.portal.open) return;
  el.portal.classList.add('closing');
  const done = () => {
    el.portal.classList.remove('closing');
    el.portal.close();
    el.cmd.focus();
  };
  const ms = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--t-med')) || 0;
  ms ? setTimeout(done, ms) : done();
}

// ---------------------------------------------------------------- panel (§7)

async function mountApplet(key, data, inline) {
  await unmountApplet();
  let mod;
  try {
    mod = (await import(`./applets/${key}.js`)).default;
  } catch {
    setDots('err');
    print('that panel refused to load. not your fault.');
    return;
  }

  const ctx = {
    args: [], print, close: closeAll,
    tokens: getComputedStyle(document.documentElement),
  };

  if (inline) {
    const host = document.createElement('div');
    host.className = 'line';
    el.out.appendChild(host);
    el.out.scrollTop = el.out.scrollHeight;
    openApplet = { mod, host, inline: true };
    await mod.mount(host, { ...ctx, args: data ? [data] : [] });
    return;
  }

  el.panel.querySelector('.panel-title').textContent = mod.title || key;
  const mount = $('panel-mount');
  mount.replaceChildren();
  el.panel.hidden = false;
  document.body.classList.add('panel-open');
  setDots('panel');
  openApplet = { mod, host: mount, inline: false };
  await mod.mount(mount, { ...ctx, args: data ? [data] : [] });
}

async function unmountApplet() {
  if (!openApplet) return;
  try { await openApplet.mod.unmount?.(); } catch {}
  openApplet.host.replaceChildren();
  if (!openApplet.inline) {
    el.panel.hidden = true;
    document.body.classList.remove('panel-open');
    $('panel-mount').replaceChildren();
  }
  openApplet = null;
}

function anyUiOpen() { return el.portal.open || !!openApplet; }

function navigate(path) {
  window.setTimeout(() => window.location.assign(path), 420);
}

async function closeAll() {
  closePortal();
  await unmountApplet();
  setDots('idle');
  el.cmd.focus();
}

// ---------------------------------------------------------------- audio vault state

const audioVault = {
  tracks: null,
  async load() {
    if (this.tracks) return this.tracks;
    try {
      const r = await fetch('tracks.json', { cache: 'no-store' });
      this.tracks = r.ok ? await r.json() : [];
    } catch { this.tracks = []; }
    return this.tracks;
  },
  pickRandom() { return this.tracks[Math.floor(Math.random() * this.tracks.length)]; },
};

// ---------------------------------------------------------------- parser (§5)

function resolve(name, raw) {
  const direct = byName.get(name);
  if (direct && commandAllowed(direct, raw)) return direct;
  const input = raw.trim();
  const folded = input.toLowerCase();
  for (const command of registry) {
    if (!commandAllowed(command, input)) continue;
    for (const trigger of command.triggers || []) {
      const value = String(trigger.value || '');
      const left = trigger.caseSensitive ? input : folded;
      const right = trigger.caseSensitive ? value : value.toLowerCase();
      if (trigger.type === 'exact' && left === right) return command;
      if (trigger.type === 'prefix' && left.startsWith(right)) return command;
      if (trigger.type === 'contains' && left.includes(right)) return command;
      if (trigger.type === 'regex') {
        try { if (new RegExp(value, trigger.caseSensitive ? '' : 'i').test(input)) return command; } catch {}
      }
    }
  }
  return null;
}

function commandAllowed(command, raw) {
  if (command.enabled === false) return false;
  if (command.category === 'admin') return false;
  const folded = raw.toLowerCase();
  return !(command.blockedPhrases || []).some((phrase) => folded.includes(String(phrase).toLowerCase()));
}

function applyLiveConfig(live) {
  if (live?.version !== 1 || !Array.isArray(live.commands) || !live.commands.length) return false;
  const bundled = new Map(registry.map(command => [command.name, command]));
  for (const command of live.commands) bundled.set(command.name, { ...bundled.get(command.name), ...command });
  registry = [...bundled.values()].filter((command) => command.enabled !== false).map((command) => ({
    ...command,
    ui: command.action?.type || command.ui || 'text',
    applet: ['panel', 'inline-applet'].includes(command.action?.type) ? command.action.target : command.applet,
  }));
  configureResponses(live.responsePools, live.settings);
  return true;
}

function commandVisibleToGuests(command) {
  return command && command.enabled !== false && command.category !== 'admin';
}

function readCachedLiveConfig() {
  try {
    const cached = JSON.parse(localStorage.getItem(LIVE_CACHE_KEY));
    if (cached && Date.now() - cached.cachedAt < LIVE_CACHE_TTL) return cached.config;
  } catch {}
  return null;
}

async function run(raw) {
  const input = raw.trim();
  if (!input) return;

  stagger = 0;
  print('~ ' + input, 'echo');
  stagger = 0;
  history.unshift(input);
  histIdx = -1;

  const tokens = input.split(/\s+/);
  const name = tokens[0].toLowerCase();
  const args = tokens.slice(1);
  const command = resolve(name, input);

  setDots('working');

  if (command?.name === 'play') await audioVault.load();

  const ctx = {
    rawInput: input, print, openPortal, closeAll, clearLog, logHasContent, anyUiOpen, navigate,
    openPanel: (key, data) => mountApplet(key, data, false),
    openInlineApplet: (key) => mountApplet(key, null, true),
    audioVault,
    analemmaLive: true,
    history: history.slice(),
  };

  const before = el.out.childElementCount;
  let handled = false;
  try {
    handled = await Promise.race([
      Promise.resolve(respond(command, args, ctx)),
      new Promise((resolve) => setTimeout(() => {
        print('command timed out. nothing is still running.');
        resolve(false);
      }, COMMAND_TIMEOUT_MS)),
    ]);
  } catch {
    print('command failed cleanly. no state left hanging.');
    handled = false;
  }
  const produced = el.out.childElementCount > before;

  if (handled) {
    setDots('ok');
  } else {
    const last = el.out.lastElementChild;
    if (last && produced) last.classList.add('shiver');
    setDots('err');
  }
  stagger = 0;
}

// ---------------------------------------------------------------- completion

function complete() {
  const val = el.cmd.value.trim().toLowerCase();
  if (!val) return;
  const pool = registry.filter(commandVisibleToGuests).map((c) => c.name);
  const hits = pool.filter((n) => n.startsWith(val));
  if (hits.length === 1) el.cmd.value = hits[0] + ' ';
  else if (hits.length > 1) { stagger = 0; print(hits.join('   '), 'dim'); }
}

// ---------------------------------------------------------------- boot

async function boot() {
  el.term = $('term'); el.out = $('out'); el.cmd = $('cmd');
  el.dots = document.querySelector('.dots');
  el.portal = $('portal'); el.panel = $('panel');

  try {
    const r = await fetch('commands.public.json', { cache: 'no-store' });
    registry = (await r.json()).commands || [];
  } catch { registry = []; }

  let liveApplied = applyLiveConfig(readCachedLiveConfig());
  if (!liveApplied) {
    try {
      const r = await fetch(LIVE_CONFIG_URL, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
      if (r.ok) {
        const document = await r.json();
        const live = JSON.parse(document.fields?.configJson?.stringValue || 'null');
        liveApplied = applyLiveConfig(live);
        if (liveApplied) localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), config: live }));
      }
    } catch {}
  }
  if (!liveApplied) console.warn('[terminal] LIVE CONFIG UNAVAILABLE — SERVING BUNDLED FALLBACK');

  byName = new Map();
  for (const c of registry) {
    byName.set(c.name, c);
    for (const a of c.aliases || []) byName.set(a, c);
  }
  setRegistry(registry);

  $('fallback-nav').hidden = true;
  el.term.hidden = false;
  setDots('idle');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seq = ['mario0318 web terminal', 'session ready', 'type help and press Enter to begin.'];
  if (reduced) { seq.forEach((l, i) => print(l, i ? 'dim' : '')); }
  else {
    let i = 0;
    const tick = () => {
      if (i >= seq.length) return;
      print(seq[i], i ? 'dim' : '');
      i++;
      setTimeout(tick, 400);
    };
    tick();
  }

  el.cmd.focus();

  $('raul3-channel').addEventListener('click', () => {
    const channel = $('raul3-channel');
    channel.setAttribute('aria-expanded', 'true');
    openPortal('raul3');
  });
  el.portal.addEventListener('close', () => $('raul3-channel').setAttribute('aria-expanded', 'false'));

  $('prompt').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = el.cmd.value;
    el.cmd.value = '';
    run(v);
  });

  el.cmd.addEventListener('input', () => {
    setDots(el.cmd.value ? 'listening' : 'idle');
  });

  el.cmd.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); complete(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (histIdx < history.length - 1) el.cmd.value = history[++histIdx];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      el.cmd.value = histIdx > 0 ? history[--histIdx] : (histIdx = -1, '');
    } else if (e.key === 'Escape') {
      if (anyUiOpen()) closeAll(); else el.cmd.blur();
    }
  });

  el.portal.addEventListener('close', () => el.cmd.focus());
  el.portal.querySelector('.portal-close').addEventListener('click', closePortal);
  el.panel.querySelector('.panel-close').addEventListener('click', closeAll);

  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('panel-open')) return;
    if (el.portal.open) return;
    if (e.target.closest('button, a, input, [role="listbox"]')) return;
    el.cmd.focus();
  });

  addEventListener('pagehide', () => { unmountApplet(); });
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
