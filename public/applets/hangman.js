// hangman.js — a drawn gallows, a real keyboard, categories, hints and streaks.

import { stage, loop, createSfx, scores, rawKeys, addStyle, Particles, pick, alpha } from './game-kit.js';

const WORDS = {
  animals: ['elephant', 'giraffe', 'penguin', 'dolphin', 'kangaroo', 'octopus', 'cheetah', 'hedgehog', 'flamingo', 'crocodile', 'butterfly', 'squirrel', 'porcupine', 'chameleon', 'jellyfish', 'armadillo', 'woodpecker', 'salamander', 'hippopotamus', 'orangutan', 'mongoose', 'platypus', 'scorpion', 'seahorse', 'walrus'],
  places: ['argentina', 'barcelona', 'singapore', 'amsterdam', 'istanbul', 'jamaica', 'portugal', 'reykjavik', 'marrakesh', 'vancouver', 'tasmania', 'budapest', 'santiago', 'honolulu', 'copenhagen', 'kathmandu', 'zanzibar', 'edinburgh', 'patagonia', 'casablanca', 'venezuela', 'mongolia', 'antarctica', 'havana', 'kyoto'],
  food: ['spaghetti', 'avocado', 'pancake', 'croissant', 'dumpling', 'burrito', 'cinnamon', 'pineapple', 'chocolate', 'lasagna', 'empanada', 'pretzel', 'guacamole', 'marshmallow', 'blueberry', 'artichoke', 'tiramisu', 'quesadilla', 'cucumber', 'macaroni', 'zucchini', 'omelette', 'meatball', 'plantain', 'mofongo'],
  machines: ['keyboard', 'terminal', 'compiler', 'database', 'firewall', 'algorithm', 'processor', 'bluetooth', 'satellite', 'telescope', 'generator', 'microchip', 'kernel', 'protocol', 'router', 'bandwidth', 'encryption', 'transistor', 'hydraulic', 'turbine', 'gyroscope', 'thermostat', 'oscillator', 'capacitor', 'mainframe'],
  space: ['asteroid', 'galaxy', 'nebula', 'supernova', 'eclipse', 'gravity', 'jupiter', 'mercury', 'neptune', 'meteorite', 'telescope', 'astronaut', 'orbit', 'pulsar', 'quasar', 'cosmos', 'constellation', 'equinox', 'solstice', 'analemma', 'andromeda', 'spacecraft', 'atmosphere', 'singularity', 'horizon'],
  music: ['saxophone', 'trombone', 'ukulele', 'harmonica', 'accordion', 'xylophone', 'clarinet', 'mandolin', 'tambourine', 'synthesizer', 'metronome', 'orchestra', 'crescendo', 'falsetto', 'melody', 'rhythm', 'percussion', 'vibrato', 'symphony', 'reggaeton', 'bassline', 'turntable', 'acoustic', 'harmony', 'chorus'],
  nature: ['volcano', 'glacier', 'waterfall', 'hurricane', 'avalanche', 'rainforest', 'mangrove', 'lightning', 'tornado', 'earthquake', 'peninsula', 'savanna', 'stalactite', 'lagoon', 'monsoon', 'archipelago', 'wilderness', 'thunderstorm', 'coral', 'canyon', 'estuary', 'meadow', 'tundra', 'blizzard', 'driftwood'],
  work: ['architect', 'carpenter', 'detective', 'engineer', 'firefighter', 'journalist', 'librarian', 'mechanic', 'plumber', 'surgeon', 'translator', 'electrician', 'astronomer', 'bartender', 'lifeguard', 'locksmith', 'paramedic', 'programmer', 'sculptor', 'welder', 'beekeeper', 'cartographer', 'blacksmith', 'navigator', 'builder'],
};

const CSS = `
.hm{display:flex;gap:clamp(1rem,4vw,3rem);align-items:center;justify-content:center;width:100%;height:100%;padding:1rem;box-sizing:border-box}
.hm canvas{flex:none;width:min(34vw,300px);height:min(34vw,300px);max-height:100%}
.hm-side{display:flex;flex-direction:column;gap:1rem;min-width:0;max-width:640px;flex:1}
.hm-cat{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--text-dim)}
.hm-cat b{color:var(--dot-2);font-weight:600}
.hm-word{display:flex;flex-wrap:wrap;gap:.35rem}
.hm-tile{width:clamp(22px,4.2vw,40px);height:clamp(30px,5.6vw,52px);display:flex;align-items:center;justify-content:center;
  border-bottom:2px solid var(--text-ghost);font-size:clamp(18px,3.4vw,30px);font-weight:700;text-transform:uppercase;color:var(--text)}
.hm-tile.on{border-color:var(--dot-3);text-shadow:0 0 14px color-mix(in srgb,var(--dot-3) 70%,transparent);animation:hm-pop .28s var(--ease)}
.hm-tile.lost{color:var(--dot-1);border-color:var(--dot-1)}
.hm-tile.won{color:var(--dot-3)}
@keyframes hm-pop{from{transform:translateY(8px) scale(.6);opacity:0}to{transform:none;opacity:1}}
.hm-msg{min-height:1.4em;font-size:13px;color:var(--text-dim);letter-spacing:.06em}
.hm-msg b{color:var(--text)}
.hm-lives{display:flex;gap:.35rem}
.hm-life{width:10px;height:10px;border-radius:50%;background:var(--dot-3);box-shadow:0 0 8px color-mix(in srgb,var(--dot-3) 60%,transparent);transition:all .25s}
.hm-life.gone{background:var(--text-ghost);box-shadow:none;transform:scale(.7)}
.hm-keys{display:flex;flex-direction:column;gap:.35rem}
.hm-row{display:flex;gap:.3rem;justify-content:flex-start}
.hm-key{flex:1;max-width:44px;min-width:0;height:clamp(34px,5vw,44px);border:1px solid var(--rule);border-radius:6px;background:rgba(24,27,34,.7);
  color:var(--text);font:inherit;font-size:14px;font-weight:600;text-transform:uppercase;cursor:pointer;transition:all .12s}
.hm-key:hover:not(:disabled){border-color:var(--text-dim);transform:translateY(-1px)}
.hm-key:disabled{cursor:default}
.hm-key.hit{background:color-mix(in srgb,var(--dot-3) 22%,transparent);border-color:var(--dot-3);color:var(--dot-3)}
.hm-key.miss{background:transparent;border-color:var(--rule);color:var(--text-ghost);text-decoration:line-through}
.hm-wide{max-width:none;flex:none;padding:0 .9rem;letter-spacing:.14em;font-size:11px}
.hm-next{border-color:var(--dot-2);color:var(--dot-2)}
@media (max-width:680px){.hm{flex-direction:column;gap:.6rem;padding:.6rem}.hm canvas{width:min(46vw,180px);height:min(46vw,180px)}.hm-side{width:100%;gap:.6rem}.hm-row{justify-content:center}}
@media (prefers-reduced-motion:reduce){.hm-tile.on{animation:none}}
`;

const MAX = 6;
let api, runner, sfx, off, s, dom;

function newRound(keep) {
  const cat = pick(Object.keys(WORDS));
  let word = pick(WORDS[cat]);
  if (keep && keep.word === word) word = pick(WORDS[cat]);
  return {
    cat, word, guessed: new Set(), misses: 0, done: null, hinted: false,
    streak: keep ? keep.streak : 0, best: scores.get('hangman-streak'), wins: scores.get('hangman-wins'),
    anim: 0, t: 0, particles: new Particles(), swing: 0,
  };
}

function build() {
  const wrap = document.createElement('div');
  wrap.className = 'hm';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'gallows');
  const side = document.createElement('div');
  side.className = 'hm-side';
  const cat = document.createElement('div'); cat.className = 'hm-cat';
  const lives = document.createElement('div'); lives.className = 'hm-lives';
  const word = document.createElement('div'); word.className = 'hm-word';
  const msg = document.createElement('div'); msg.className = 'hm-msg';
  const keys = document.createElement('div'); keys.className = 'hm-keys';
  const keyEls = {};
  for (const row of ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']) {
    const r = document.createElement('div'); r.className = 'hm-row';
    for (const ch of row) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hm-key'; b.textContent = ch;
      b.setAttribute('aria-label', `guess ${ch}`);
      b.addEventListener('click', () => { guess(ch); b.blur(); });
      keyEls[ch] = b;
      r.appendChild(b);
    }
    keys.appendChild(r);
  }
  const actions = document.createElement('div'); actions.className = 'hm-row';
  const hint = document.createElement('button');
  hint.type = 'button'; hint.className = 'hm-key hm-wide'; hint.textContent = 'hint (costs a life)';
  hint.addEventListener('click', () => { useHint(); hint.blur(); });
  const next = document.createElement('button');
  next.type = 'button'; next.className = 'hm-key hm-wide hm-next'; next.textContent = 'next word';
  next.addEventListener('click', () => { nextRound(); next.blur(); });
  actions.append(hint, next);
  keys.appendChild(actions);
  side.append(cat, lives, word, msg, keys);
  wrap.append(canvas, side);
  api.main.appendChild(wrap);
  return { wrap, canvas, g: canvas.getContext('2d'), cat, lives, word, msg, keyEls, hint, next };
}

function render() {
  dom.cat.replaceChildren(document.createTextNode('category '), Object.assign(document.createElement('b'), { textContent: s.cat }));
  dom.lives.replaceChildren();
  for (let i = 0; i < MAX; i++) {
    const d = document.createElement('span');
    d.className = 'hm-life' + (i >= MAX - s.misses ? ' gone' : '');
    dom.lives.appendChild(d);
  }
  dom.lives.setAttribute('aria-label', `${MAX - s.misses} lives left`);
  dom.word.replaceChildren();
  for (const ch of s.word) {
    const t = document.createElement('span');
    const shown = s.guessed.has(ch);
    t.className = 'hm-tile' + (shown ? ' on' : '') + (s.done === 'lost' && !shown ? ' lost' : '') + (s.done === 'won' ? ' won' : '');
    t.textContent = shown || s.done ? ch : '';
    dom.word.appendChild(t);
  }
  for (const [ch, b] of Object.entries(dom.keyEls)) {
    const used = s.guessed.has(ch);
    b.disabled = used || !!s.done;
    b.className = 'hm-key' + (used ? (s.word.includes(ch) ? ' hit' : ' miss') : '');
  }
  dom.hint.disabled = !!s.done || s.hinted || s.misses >= MAX - 1;
  dom.hint.style.visibility = s.done ? 'hidden' : 'visible';
  dom.next.style.visibility = s.done ? 'visible' : 'hidden';
  api.stat('streak', s.streak, s.streak > 0);
  api.stat('best', Math.max(s.best, s.streak));
  api.stat('solved', s.wins);
}

function say(text, strong) {
  dom.msg.replaceChildren();
  if (strong) { dom.msg.append(Object.assign(document.createElement('b'), { textContent: strong }), ' '); }
  dom.msg.append(text);
  api.announce((strong ? strong + ' ' : '') + text);
}

function finish(won) {
  s.done = won ? 'won' : 'lost';
  if (won) {
    s.streak++;
    s.wins++;
    scores.set('hangman-wins', s.wins);
    if (s.streak > s.best) { s.best = s.streak; scores.set('hangman-streak', s.streak); }
    sfx.play('win');
    const r = dom.canvas.getBoundingClientRect();
    s.particles.burst(r.width / 2, r.height * 0.45, api.pal.teal, 40, 200, 1);
    s.particles.burst(r.width / 2, r.height * 0.45, api.pal.amber, 20, 160, 1);
    say('press enter for the next word.', s.misses === 0 ? 'flawless.' : 'saved.');
    api.toast(s.streak > 1 ? `streak ${s.streak}` : 'saved');
  } else {
    s.streak = 0;
    sfx.play('over');
    say('press enter to try another.', `it was ${s.word}.`);
  }
  render();
}

function guess(ch) {
  if (s.done || s.guessed.has(ch)) return;
  s.guessed.add(ch);
  if (s.word.includes(ch)) {
    sfx.play('eat');
    const n = [...s.word].filter((c) => c === ch).length;
    say(n > 1 ? `${n} of those.` : 'yes.', ch.toUpperCase());
    if ([...s.word].every((c) => s.guessed.has(c))) return finish(true);
  } else {
    s.misses++;
    s.anim = 0;
    s.swing = 1;
    sfx.play('miss');
    say(`${MAX - s.misses} left.`, `no ${ch.toUpperCase()}.`);
    if (s.misses >= MAX) return finish(false);
  }
  render();
}

function useHint() {
  if (s.done || s.hinted || s.misses >= MAX - 1) return;
  const hidden = [...new Set(s.word)].filter((c) => !s.guessed.has(c));
  if (!hidden.length) return;
  s.hinted = true;
  s.misses++;
  s.anim = 0;
  const ch = pick(hidden);
  s.guessed.add(ch);
  sfx.play('flip');
  say('one life spent.', `hint: ${ch.toUpperCase()}.`);
  if ([...s.word].every((c) => s.guessed.has(c))) return finish(true);
  render();
}

function nextRound() {
  if (!s.done) return;
  s = newRound(s);
  say('pick a letter.', '');
  render();
}

// gallows and figure, each stroke drawn in over a moment
function draw(t, dt) {
  const { canvas, g } = dom;
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = r.width, h = r.height, p = api.pal;
  if (!w) return;
  g.clearRect(0, 0, w, h);
  s.anim = Math.min(1, s.anim + dt * 3.2);
  s.swing = Math.max(0, s.swing - dt * 0.9);
  s.particles.update(dt);

  const u = w / 100;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const line = (pts, color, width, k = 1) => {
    g.save();
    g.strokeStyle = color; g.lineWidth = width * u; g.shadowColor = color; g.shadowBlur = 8;
    g.beginPath();
    let total = 0;
    const segs = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(d); total += d; }
    let left = total * k;
    g.moveTo(pts[0][0] * u, pts[0][1] * u);
    for (let i = 1; i < pts.length && left > 0; i++) {
      const f = Math.min(1, left / segs[i - 1]);
      g.lineTo((pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f) * u, (pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f) * u);
      left -= segs[i - 1];
    }
    g.stroke();
    g.restore();
  };

  // gallows
  line([[12, 92], [70, 92]], p.dim, 2.2);
  line([[26, 92], [26, 10], [62, 10]], p.dim, 2.2);
  line([[26, 26], [42, 10]], p.dim, 1.6);
  line([[62, 10], [62, 22]], alpha(p.amber, 0.9), 1.2);

  const lost = s.done === 'lost';
  const col = lost ? p.ember : p.text;
  const sway = Math.sin(t * (lost ? 2.2 : 5)) * (lost ? 2.4 : s.swing * 3);
  g.save();
  g.translate(62 * u, 22 * u);
  g.rotate((sway * Math.PI) / 180);
  g.translate(-62 * u, -22 * u);
  const part = (i) => (s.misses > i ? (s.misses === i + 1 ? s.anim : 1) : 0);
  if (part(0)) {
    g.save();
    g.strokeStyle = col; g.lineWidth = 2 * u; g.shadowColor = col; g.shadowBlur = 10;
    g.beginPath();
    g.arc(62 * u, 30 * u, 8 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * part(0));
    g.stroke();
    g.restore();
    if (lost) {
      for (const dx of [-3, 3]) { line([[62 + dx - 1.2, 28], [62 + dx + 1.2, 30.4]], col, 0.9); line([[62 + dx + 1.2, 28], [62 + dx - 1.2, 30.4]], col, 0.9); }
    }
  }
  if (part(1)) line([[62, 38], [62, 62]], col, 2, part(1));
  if (part(2)) line([[62, 44], [50, 54]], col, 2, part(2));
  if (part(3)) line([[62, 44], [74, 54]], col, 2, part(3));
  if (part(4)) line([[62, 62], [52, 80]], col, 2, part(4));
  if (part(5)) line([[62, 62], [72, 80]], col, 2, part(5));
  g.restore();

  s.particles.draw(g);
}

export default {
  key: 'hangman',
  title: 'hangman',
  ui: 'panel',
  async mount(el, ctx) {
    addStyle('hm-style', CSS);
    sfx = createSfx();
    api = stage(el, ctx, {
      title: 'hangman', dom: true,
      help: [['a-z', 'guess'], ['?', 'hint'], ['enter', 'next word'], ['esc', 'leave']],
    });
    api.button('sound', sfx.muted ? 'sound off' : 'sound on', () => { const m = sfx.toggle(); api.buttons.sound.textContent = m ? 'sound off' : 'sound on'; });
    api.button('exit', 'exit', () => ctx.close());
    dom = build();
    s = newRound();
    render();
    say('pick a letter.', '');
    off = rawKeys(ctx, (e) => {
      if (e.key === 'Enter') { nextRound(); return; }
      if (e.key === '?') { useHint(); return; }
      if (e.key.length === 1 && e.key >= 'A' && e.key.toLowerCase() <= 'z' && e.key.toLowerCase() >= 'a') { guess(e.key.toLowerCase()); return; }
      return false;
    });
    runner = loop(() => {}, draw);
  },
  unmount() {
    if (runner) runner.stop();
    if (off) off();
    if (sfx) sfx.close();
    if (api) api.destroy();
    api = runner = sfx = off = s = dom = null;
  },
};
