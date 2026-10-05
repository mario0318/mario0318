// game-kit.js — shared stage, input, loop, sound and scores for the game applets.
// Everything draws in the terminal's own palette (the three dots plus tints),
// so the games read as part of the instrument rather than a separate arcade.

const STYLE_ID = 'gk-style';

const CSS = `
.gk{position:relative;display:flex;flex-direction:column;height:calc(100dvh - 64px);min-height:300px;overflow:hidden;
  background:radial-gradient(ellipse at 50% 28%,#141821 0%,var(--bg) 72%);color:var(--text);
  user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;outline:none}
.gk::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:3;
  background:repeating-linear-gradient(to bottom,rgba(255,255,255,.03) 0 1px,transparent 1px 3px);mix-blend-mode:overlay}
.gk::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:3;box-shadow:inset 0 0 90px rgba(0,0,0,.65)}
.gk-top{position:relative;z-index:4;display:flex;align-items:center;gap:.8rem;padding:.55rem .9rem;border-bottom:1px solid var(--rule);
  font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-dim);background:rgba(10,11,13,.55)}
.gk-title{color:var(--text);letter-spacing:.32em}
.gk-stats{margin-left:auto;display:flex;gap:1.1rem;flex-wrap:wrap;justify-content:flex-end}
.gk-stat b{color:var(--text);font-weight:600;margin-left:.45em;letter-spacing:.04em}
.gk-stat.hot b{color:var(--dot-2)}
.gk-btn{background:none;border:1px solid var(--rule);color:var(--text-dim);font:inherit;letter-spacing:inherit;text-transform:inherit;
  padding:.22rem .55rem;border-radius:4px;cursor:pointer}
.gk-btn:hover,.gk-btn:focus-visible{color:var(--text);border-color:var(--text-ghost)}
.gk-main{position:relative;z-index:1;flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
.gk-main canvas{display:block;touch-action:none}
.gk-foot{position:relative;z-index:4;display:flex;gap:1.1rem;flex-wrap:wrap;padding:.42rem .9rem;border-top:1px solid var(--rule);
  font-size:11px;color:var(--text-ghost);background:rgba(10,11,13,.55)}
.gk-foot kbd{font:inherit;color:var(--text-dim);border:1px solid var(--rule);border-radius:3px;padding:0 .38em;margin-right:.3em}
.gk-pad{position:relative;z-index:4;display:none;justify-content:space-between;align-items:flex-end;gap:.6rem;padding:.5rem .9rem .8rem}
.gk-pad .grp{display:flex;gap:.55rem}
.gk-pad button{width:58px;height:58px;border-radius:50%;border:1px solid var(--rule);background:rgba(24,27,34,.8);color:var(--text-dim);
  font:inherit;font-size:18px;touch-action:none}
.gk-pad button:active,.gk-pad button.on{color:var(--text);border-color:var(--dot-3);box-shadow:0 0 14px color-mix(in srgb,var(--dot-3) 45%,transparent)}
@media (pointer:coarse){.gk-pad{display:flex}.gk-foot{display:none}}
@media (max-width:620px){
  .gk-top{flex-wrap:wrap;gap:.4rem;row-gap:.35rem;padding:.45rem .6rem}
  .gk-title{margin-right:auto;letter-spacing:.22em}
  .gk-stats{order:3;flex-basis:100%;margin-left:0;justify-content:space-between;gap:.5rem;flex-wrap:nowrap}
  .gk-stat{white-space:nowrap}
  .gk-btn{padding:.2rem .42rem;white-space:nowrap}
  .gk-foot{gap:.7rem;padding:.35rem .6rem}
}
.gk-toast{position:absolute;left:50%;top:13%;z-index:5;transform:translateX(-50%);pointer-events:none;white-space:nowrap;
  font-size:clamp(14px,3.4vw,22px);letter-spacing:.3em;text-transform:uppercase;color:var(--dot-2);
  text-shadow:0 0 18px color-mix(in srgb,var(--dot-2) 70%,transparent);animation:gk-toast 1.1s var(--ease) forwards}
@keyframes gk-toast{0%{opacity:0;transform:translate(-50%,10px) scale(.92)}18%{opacity:1;transform:translate(-50%,0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-14px)}}
@media (prefers-reduced-motion:reduce){.gk-toast{animation:none;opacity:1}}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function palette() {
  return {
    bg: cssVar('--bg', '#0a0b0d'),
    surface: cssVar('--surface', '#111318'),
    hi: cssVar('--surface-hi', '#181b22'),
    rule: cssVar('--rule', '#252a32'),
    text: cssVar('--text', '#e8e4dc'),
    dim: cssVar('--text-dim', '#8a8f98'),
    ghost: cssVar('--text-ghost', '#4a4f58'),
    ember: cssVar('--dot-1', '#ff5c47'),
    amber: cssVar('--dot-2', '#ffc14d'),
    teal: cssVar('--dot-3', '#4dd8c7'),
  };
}

// '#rrggbb' -> [r,g,b]
function rgb(hex) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
export function mix(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  const m = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}
export function alpha(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const motionOK = () => !reduced();

// ------------------------------------------------------------------ scores

export const scores = {
  get(key) { try { return Number(localStorage.getItem('m318-hi-' + key)) || 0; } catch { return 0; } },
  set(key, value) { try { localStorage.setItem('m318-hi-' + key, String(value)); } catch {} },
};

// ------------------------------------------------------------------- sound
// Off until the player turns it on. Tiny synth, no assets.

const SFX_KEY = 'm318-sfx';
const TONES = {
  move: [[220, 0.025, 'square', 0.03]],
  rotate: [[330, 0.04, 'square', 0.04]],
  lock: [[110, 0.07, 'triangle', 0.08]],
  drop: [[90, 0.12, 'sawtooth', 0.06], [60, 0.1, 'triangle', 0.07]],
  clear: [[440, 0.08, 'square', 0.05], [660, 0.1, 'square', 0.05], [880, 0.16, 'square', 0.05]],
  tetris: [[440, 0.07, 'square', 0.06], [554, 0.07, 'square', 0.06], [659, 0.07, 'square', 0.06], [880, 0.24, 'square', 0.06]],
  eat: [[520, 0.05, 'square', 0.05], [780, 0.08, 'square', 0.05]],
  bonus: [[660, 0.06, 'square', 0.05], [990, 0.06, 'square', 0.05], [1320, 0.1, 'square', 0.05]],
  hit: [[300, 0.05, 'square', 0.06]],
  wall: [[180, 0.04, 'square', 0.04]],
  score: [[520, 0.08, 'triangle', 0.07], [780, 0.14, 'triangle', 0.07]],
  miss: [[160, 0.18, 'sawtooth', 0.06]],
  over: [[392, 0.16, 'sawtooth', 0.06], [330, 0.16, 'sawtooth', 0.06], [262, 0.3, 'sawtooth', 0.06]],
  win: [[523, 0.1, 'triangle', 0.07], [659, 0.1, 'triangle', 0.07], [784, 0.1, 'triangle', 0.07], [1047, 0.3, 'triangle', 0.07]],
  tick: [[600, 0.02, 'square', 0.03]],
  flip: [[400, 0.04, 'triangle', 0.04]],
};

export function createSfx() {
  let ac = null;
  let muted = true;
  let music = null; // { song, bpm, voices: [{ i, t }], timer }
  try { muted = localStorage.getItem(SFX_KEY) !== 'on'; } catch {}
  const ensure = () => {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  };
  const note = (ctx, freq, t, dur, type, vol) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Look-ahead sequencer: every tick, queue whatever falls in the next 250ms.
  const pump = () => {
    if (!music || muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const beat = 60 / Math.max(60, music.bpm());
    const horizon = ctx.currentTime + 0.25;
    music.song.voices.forEach((voice, vi) => {
      const st = music.pos[vi];
      if (st.t < ctx.currentTime) st.t = ctx.currentTime + 0.05;
      while (st.t < horizon) {
        const [m, beats] = voice.notes[st.i];
        const dur = beats * beat;
        if (m !== null) note(ctx, midi(m), st.t, dur * (voice.gate || 0.92), voice.type, voice.vol);
        st.t += dur;
        st.i = (st.i + 1) % voice.notes.length;
      }
    });
  };

  return {
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(SFX_KEY, muted ? 'off' : 'on'); } catch {}
      if (!muted) { ensure(); if (music && music.on) { for (const p of music.pos) p.t = 0; pump(); } }
      return muted;
    },
    play(name) {
      if (muted) return;
      const ctx = ensure();
      const steps = TONES[name];
      if (!ctx || !steps) return;
      let t = ctx.currentTime;
      for (const [freq, dur, type, vol] of steps) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
        t += dur * 0.9;
      }
    },
    // song: { voices: [{ type, vol, gate, notes: [[midi|null, beats], ...] }] }
    startMusic(song, bpm, restart = true) {
      if (!music || music.song !== song) {
        if (music) clearInterval(music.timer);
        music = { song, bpm, pos: song.voices.map(() => ({ i: 0, t: 0 })), timer: 0, on: false };
      } else if (restart) {
        music.pos = song.voices.map(() => ({ i: 0, t: 0 }));
      }
      music.bpm = bpm;
      for (const p of music.pos) p.t = 0;
      music.on = true;
      clearInterval(music.timer);
      music.timer = setInterval(() => { if (music && music.on) pump(); }, 90);
      pump();
    },
    stopMusic() {
      if (!music) return;
      music.on = false;
      clearInterval(music.timer);
    },
    close() {
      if (music) { clearInterval(music.timer); music = null; }
      if (ac) { try { ac.close(); } catch {} ac = null; }
    },
  };
}

// Korobeiniki, the 19th-century Russian folk tune. A, A, B.
const GS4 = 68, A4 = 69, B4 = 71, C5 = 72, D5 = 74, E5 = 76, F5 = 77, G5 = 79, GS5 = 80, A5 = 81;
const KORO_A = [
  [E5, 1], [B4, 0.5], [C5, 0.5], [D5, 1], [C5, 0.5], [B4, 0.5],
  [A4, 1], [A4, 0.5], [C5, 0.5], [E5, 1], [D5, 0.5], [C5, 0.5],
  [B4, 1.5], [C5, 0.5], [D5, 1], [E5, 1],
  [C5, 1], [A4, 1], [A4, 2],
  [null, 0.5], [D5, 1], [F5, 0.5], [A5, 1], [G5, 0.5], [F5, 0.5],
  [E5, 1.5], [C5, 0.5], [E5, 1], [D5, 0.5], [C5, 0.5],
  [B4, 1], [B4, 0.5], [C5, 0.5], [D5, 1], [E5, 1],
  [C5, 1], [A4, 1], [A4, 1], [null, 1],
];
const KORO_B = [
  [E5, 2], [C5, 2], [D5, 2], [B4, 2], [C5, 2], [A4, 2], [GS4, 2], [B4, 2],
  [E5, 2], [C5, 2], [D5, 2], [B4, 2], [C5, 1], [E5, 1], [A5, 2], [GS5, 4],
];
const bar = (root) => [[root, 0.5], [root + 12, 0.5], [root, 0.5], [root + 12, 0.5], [root, 0.5], [root + 12, 0.5], [root, 0.5], [root + 12, 0.5]];
const BASS_A = [40, 45, 40, 45, 38, 36, 40, 45].flatMap(bar);
const BASS_B = [45, 40, 45, 40, 45, 40, 45, 40].flatMap(bar);
export const KOROBEINIKI = {
  voices: [
    { type: 'square', vol: 0.045, gate: 0.9, notes: [...KORO_A, ...KORO_A, ...KORO_B] },
    { type: 'triangle', vol: 0.07, gate: 0.8, notes: [...BASS_A, ...BASS_A, ...BASS_B] },
  ],
};

// ------------------------------------------------------------------- stage

export function stage(el, ctx, cfg) {
  injectStyle();
  const pal = palette();
  const prevPadding = el.style.padding;
  el.style.padding = '0';
  el.replaceChildren();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

  const root = document.createElement('div');
  root.className = 'gk';
  root.tabIndex = -1;

  const top = document.createElement('div');
  top.className = 'gk-top';
  const title = document.createElement('span');
  title.className = 'gk-title';
  title.textContent = cfg.title;
  const stats = document.createElement('div');
  stats.className = 'gk-stats';
  top.append(title, stats);

  const buttons = {};
  const addButton = (name, label, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gk-btn';
    b.textContent = label;
    b.addEventListener('click', () => { fn(); b.blur(); });
    top.appendChild(b);
    buttons[name] = b;
    return b;
  };

  const main = document.createElement('div');
  main.className = 'gk-main';
  const canvas = cfg.dom ? null : document.createElement('canvas');
  if (canvas) {
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', cfg.label || cfg.title);
    main.appendChild(canvas);
  }

  const pad = document.createElement('div');
  pad.className = 'gk-pad';

  const foot = document.createElement('div');
  foot.className = 'gk-foot';
  for (const [key, what] of cfg.help || []) {
    const span = document.createElement('span');
    const k = document.createElement('kbd');
    k.textContent = key;
    span.append(k, what);
    foot.appendChild(span);
  }

  const live = document.createElement('div');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';

  root.append(top, main, pad, foot, live);
  el.appendChild(root);

  // Take the whole panel: hide its own header (the stage has an exit button)
  // and size to the space between the panel top and the docked prompt.
  const panelEl = el.closest('.panel');
  const head = panelEl ? panelEl.querySelector('.panel-head') : null;
  const prevHead = head ? head.style.display : '';
  if (head) head.style.display = 'none';
  // offsets, not client rects: the panel slides in under a transform.
  const size = () => {
    const term = document.getElementById('term');
    const docked = document.body.classList.contains('panel-open') && term;
    const bottom = window.innerHeight - (docked ? term.offsetHeight : 0);
    root.style.height = Math.max(300, Math.floor(bottom - root.offsetTop)) + 'px';
  };
  const settle = setTimeout(() => { size(); }, 520);
  window.addEventListener('resize', size);

  const api = {
    root, main, canvas, pal, pad, live, buttons,
    g: canvas ? canvas.getContext('2d') : null,
    w: 0, h: 0, dpr: 1,
    onResize: null,
    stat(name, value, hot) {
      let node = stats.querySelector(`[data-stat="${name}"]`);
      if (!node) {
        node = document.createElement('span');
        node.className = 'gk-stat';
        node.dataset.stat = name;
        node.append(document.createTextNode(name), document.createElement('b'));
        stats.appendChild(node);
      }
      node.lastChild.textContent = String(value);
      node.classList.toggle('hot', !!hot);
    },
    announce(text) { live.textContent = text; },
    toast(text) {
      const t = document.createElement('div');
      t.className = 'gk-toast';
      t.textContent = text;
      main.appendChild(t);
      setTimeout(() => t.remove(), 1200);
    },
    button: addButton,
    fit() {
      if (!canvas) return;
      const box = main.getBoundingClientRect();
      let w = Math.max(160, box.width);
      let h = Math.max(160, box.height);
      if (cfg.aspect) {
        if (w / h > cfg.aspect) w = h * cfg.aspect; else h = w / cfg.aspect;
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      api.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      api.w = w; api.h = h; api.dpr = dpr;
      if (api.onResize) api.onResize(w, h);
    },
    destroy() {
      ro.disconnect();
      window.removeEventListener('resize', size);
      clearTimeout(settle);
      if (head) head.style.display = prevHead;
      el.style.padding = prevPadding;
      el.replaceChildren();
    },
  };

  const ro = new ResizeObserver(() => api.fit());
  ro.observe(main);
  size();
  requestAnimationFrame(() => { size(); api.fit(); });
  return api;
}

// ---------------------------------------------------------------- controls
// keymap: { 'ArrowLeft': 'left', a: 'left', ... }  (letters lowercase)
// padButtons: [{ a: 'left', label: '◀', group: 0 }, ...]
// onAction(action, isDown). Escape always leaves; M toggles sound; P pauses.

export function controls(ctx, api, { keymap, padButtons = [], onAction, swipe, tap, sfx }) {
  const held = new Set();

  const down = (a) => { if (!held.has(a)) { held.add(a); onAction(a, true); } };
  const up = (a) => { if (held.delete(a)) onAction(a, false); };

  const onKeyDown = (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); ctx.close(); return; }
    const a = keymap[e.key] || keymap[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!a) return;
    e.preventDefault();
    if (e.repeat) return;
    down(a);
  };
  const onKeyUp = (e) => {
    const a = keymap[e.key] || keymap[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (a) up(a);
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  const groups = [];
  for (const spec of padButtons) {
    const gi = spec.group || 0;
    if (!groups[gi]) { groups[gi] = document.createElement('div'); groups[gi].className = 'grp'; api.pad.appendChild(groups[gi]); }
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = spec.label;
    b.setAttribute('aria-label', spec.name || spec.a);
    const press = (e) => { e.preventDefault(); b.classList.add('on'); down(spec.a); };
    const release = (e) => { e.preventDefault(); b.classList.remove('on'); up(spec.a); };
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointerleave', release);
    b.addEventListener('pointercancel', release);
    groups[gi].appendChild(b);
  }

  let start = null;
  const canvas = api.canvas;
  const onPointerDown = (e) => { start = { x: e.clientX, y: e.clientY, t: performance.now() }; if (tap) tap(e, 'down'); };
  const onPointerUp = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (swipe && Math.max(adx, ady) > 26) swipe(adx > ady ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'), e);
    else if (tap) tap(e, 'tap');
    start = null;
  };
  if (canvas) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', () => { start = null; });
  }

  return {
    destroy() {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      if (canvas) {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointerup', onPointerUp);
      }
      held.clear();
    },
    isHeld: (a) => held.has(a),
  };
}

// -------------------------------------------------------------------- loop

export function loop(update, draw) {
  let raf = 0;
  let last = 0;
  const handle = {
    paused: false,
    stop() { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); },
  };
  const onVis = () => { if (document.hidden) handle.onHidden && handle.onHidden(); };
  document.addEventListener('visibilitychange', onVis);
  const tick = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    if (!handle.paused) update(dt);
    draw(t / 1000, dt);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return handle;
}

// --------------------------------------------------------------- particles

export class Particles {
  constructor() { this.list = []; }
  burst(x, y, color, n = 12, speed = 120, life = 0.6, size = 2.2) {
    if (!motionOK()) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.8);
      this.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size });
    }
  }
  update(dt) {
    for (const p of this.list) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt; }
    this.list = this.list.filter((p) => p.life > 0);
  }
  draw(g) {
    for (const p of this.list) {
      const k = Math.max(0, p.life / p.max);
      g.globalAlpha = k;
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size * (0.5 + k), p.size * (0.5 + k));
    }
    g.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ drawing

export function text(g, str, x, y, o = {}) {
  g.save();
  g.font = `${o.weight || 600} ${o.size || 16}px ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace`;
  g.textAlign = o.align || 'left';
  g.textBaseline = o.base || 'middle';
  if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = o.blur || 14; }
  g.fillStyle = o.color || '#fff';
  if (o.spacing) g.letterSpacing = o.spacing + 'px';
  g.fillText(str, x, y);
  g.restore();
}

export function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

// Three dots drifting on slow orbits behind a game: the site's own motif.
export function drawDots(g, pal, w, h, t, a = 0.16) {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.42;
  const cols = [pal.ember, pal.amber, pal.teal];
  for (let i = 0; i < 3; i++) {
    const ang = t * (0.07 + i * 0.025) + i * 2.09;
    const x = cx + Math.cos(ang) * R * (1.1 + i * 0.12);
    const y = cy + Math.sin(ang * 1.1) * R * (0.9 + i * 0.1);
    const grad = g.createRadialGradient(x, y, 0, x, y, R * 0.55);
    grad.addColorStop(0, alpha(cols[i], a));
    grad.addColorStop(1, alpha(cols[i], 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
}

export function overlay(g, w, h, pal, lines, o = {}) {
  g.fillStyle = 'rgba(8,9,11,.74)';
  g.fillRect(0, 0, w, h);
  const base = h / 2 - ((lines.length - 1) * (o.gap || 30)) / 2;
  lines.forEach((ln, i) => {
    text(g, ln.t, w / 2, base + i * (o.gap || 30), {
      size: ln.size || 16, align: 'center', color: ln.color || pal.text, glow: ln.glow, spacing: ln.spacing || 0, weight: ln.weight || 600,
    });
  });
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rnd = (n) => Math.floor(Math.random() * n);
export const pick = (arr) => arr[rnd(arr.length)];

// Raw key feed for the word games: every key not typed into the prompt.
// Escape always leaves. Returns a function that removes the listener.
export function rawKeys(ctx, handler) {
  const onKey = (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !t.dataset.gk) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); ctx.close(); return; }
    if (handler(e) !== false) e.preventDefault();
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}

export function addStyle(id, css) {
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}
