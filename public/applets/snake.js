// snake.js — real-time snake with smooth gliding, a speed ramp and timed bonus food.

import { stage, controls, loop, createSfx, scores, Particles, text, roundRect, drawDots, overlay, mix, alpha, rnd } from './game-kit.js';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

let api, input, runner, sfx, s;

function fresh(mode = 'title') {
  const wide = api.w >= api.h * 1.15;
  const cols = wide ? 30 : 18;
  const rows = wide ? 18 : 26;
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  const st = {
    mode, cols, rows,
    body: [[cx, cy], [cx - 1, cy], [cx - 2, cy]],
    prev: null,
    dir: 'right', queue: [],
    acc: 0, speed: 8, grow: 0,
    food: null, bonus: null, bonusT: 0, eaten: 0,
    score: 0, hi: scores.get('snake'),
    dead: 0, t: 0, shake: 0,
    particles: new Particles(),
  };
  st.prev = st.body.map((c) => c.slice());
  st.food = place(st);
  return st;
}

function place(st) {
  for (let i = 0; i < 500; i++) {
    const p = [rnd(st.cols), rnd(st.rows)];
    const hit = st.body.some((c) => c[0] === p[0] && c[1] === p[1])
      || (st.food && st.food[0] === p[0] && st.food[1] === p[1])
      || (st.bonus && st.bonus[0] === p[0] && st.bonus[1] === p[1]);
    if (!hit) return p;
  }
  return [0, 0];
}

function hud() {
  api.stat('score', s.score, s.score > 0 && s.score >= s.hi);
  api.stat('length', s.body.length);
  api.stat('best', Math.max(s.hi, s.score));
}

function geom() {
  const cell = Math.floor(Math.min((api.w - 24) / s.cols, (api.h - 24) / s.rows));
  return { cell, ox: (api.w - cell * s.cols) / 2, oy: (api.h - cell * s.rows) / 2 };
}

function die() {
  s.mode = 'over';
  s.dead = 0;
  s.shake = 10;
  if (s.score > s.hi) { s.hi = s.score; scores.set('snake', s.score); }
  sfx.play('over');
  api.announce(`game over. score ${s.score}.`);
  const { cell, ox, oy } = geom();
  for (const [x, y] of s.body) s.particles.burst(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, api.pal.teal, 3, 140, 0.8);
}

function stepOnce() {
  if (s.queue.length) {
    const d = s.queue.shift();
    if (d !== OPP[s.dir]) s.dir = d;
  }
  const [dx, dy] = DIRS[s.dir];
  const head = [s.body[0][0] + dx, s.body[0][1] + dy];
  const tail = s.grow > 0 ? s.body : s.body.slice(0, -1);
  if (head[0] < 0 || head[1] < 0 || head[0] >= s.cols || head[1] >= s.rows || tail.some((c) => c[0] === head[0] && c[1] === head[1])) return die();

  s.prev = s.body.map((c) => c.slice());
  s.body.unshift(head);
  if (s.grow > 0) { s.grow--; s.prev.push(s.prev[s.prev.length - 1].slice()); } else s.body.pop();

  const { cell, ox, oy } = geom();
  if (head[0] === s.food[0] && head[1] === s.food[1]) {
    s.score += 10;
    s.grow += 1;
    s.eaten++;
    s.speed = Math.min(18, 8 + s.eaten * 0.3);
    s.particles.burst(ox + (head[0] + 0.5) * cell, oy + (head[1] + 0.5) * cell, api.pal.ember, 14, 150, 0.5);
    sfx.play('eat');
    s.food = place(s);
    if (!s.bonus && s.eaten % 5 === 0) { s.bonus = place(s); s.bonusT = 6; }
    hud();
  } else if (s.bonus && head[0] === s.bonus[0] && head[1] === s.bonus[1]) {
    const gain = 20 + Math.ceil(s.bonusT * 10);
    s.score += gain;
    s.grow += 2;
    s.particles.burst(ox + (head[0] + 0.5) * cell, oy + (head[1] + 0.5) * cell, api.pal.amber, 26, 190, 0.7);
    sfx.play('bonus');
    api.toast(`+${gain}`);
    s.bonus = null;
    hud();
  }
}

function update(dt) {
  s.t += dt;
  s.particles.update(dt);
  s.shake = Math.max(0, s.shake - dt * 30);
  if (s.mode === 'over') { s.dead += dt; return; }
  if (s.mode !== 'play') return;
  if (s.bonus) { s.bonusT -= dt; if (s.bonusT <= 0) s.bonus = null; }
  s.acc += dt * s.speed;
  while (s.acc >= 1 && s.mode === 'play') { s.acc -= 1; stepOnce(); }
}

function act(a, isDown) {
  if (!isDown) return;
  if (a === 'mute') { const m = sfx.toggle(); api.buttons.sound.textContent = m ? 'sound off' : 'sound on'; return; }
  if (a === 'start') {
    if (s.mode === 'title' || s.mode === 'over') { s = fresh('play'); hud(); }
    else if (s.mode === 'pause') s.mode = 'play';
    return;
  }
  if (a === 'pause') { if (s.mode === 'play') s.mode = 'pause'; else if (s.mode === 'pause') s.mode = 'play'; return; }
  if (DIRS[a]) {
    if (s.mode === 'title') { s = fresh('play'); hud(); }
    if (s.mode !== 'play') return;
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (a !== last && a !== OPP[last] && s.queue.length < 3) s.queue.push(a);
  }
}

function draw(t) {
  const g = api.g;
  const { w, h, pal } = api;
  if (!w) return;
  g.clearRect(0, 0, w, h);
  drawDots(g, pal, w, h, t);
  const { cell, ox, oy } = geom();
  const fw = cell * s.cols;
  const fh = cell * s.rows;
  const sx = s.shake ? (Math.random() - 0.5) * s.shake : 0;
  const sy = s.shake ? (Math.random() - 0.5) * s.shake : 0;
  g.save();
  g.translate(sx, sy);

  g.save();
  g.shadowColor = alpha(pal.teal, 0.4);
  g.shadowBlur = 22;
  g.fillStyle = 'rgba(8,9,12,.92)';
  g.fillRect(ox - 2, oy - 2, fw + 4, fh + 4);
  g.restore();
  g.strokeStyle = alpha(pal.teal, 0.5);
  g.lineWidth = 1.5;
  g.strokeRect(ox - 2, oy - 2, fw + 4, fh + 4);
  g.fillStyle = 'rgba(255,255,255,.045)';
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) g.fillRect(ox + x * cell + cell / 2 - 0.5, oy + y * cell + cell / 2 - 0.5, 1, 1);

  // food
  const pulse = 0.82 + 0.18 * Math.sin(t * 6);
  const drawFood = (p, color, r) => {
    g.save();
    g.shadowColor = color;
    g.shadowBlur = cell * 0.9;
    g.fillStyle = color;
    g.beginPath();
    g.arc(ox + (p[0] + 0.5) * cell, oy + (p[1] + 0.5) * cell, cell * r * pulse, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  drawFood(s.food, pal.ember, 0.3);
  if (s.bonus) {
    drawFood(s.bonus, pal.amber, 0.4);
    g.strokeStyle = alpha(pal.amber, 0.7);
    g.lineWidth = 2;
    g.beginPath();
    g.arc(ox + (s.bonus[0] + 0.5) * cell, oy + (s.bonus[1] + 0.5) * cell, cell * 0.62, -Math.PI / 2, -Math.PI / 2 + (s.bonusT / 6) * Math.PI * 2);
    g.stroke();
  }

  // snake, interpolated between the last grid step and this one
  const k = s.mode === 'play' ? Math.min(1, s.acc) : 1;
  const n = s.body.length;
  const pts = s.body.map((c, i) => {
    const p = s.prev[i] || c;
    return [ox + (p[0] + (c[0] - p[0]) * k + 0.5) * cell, oy + (p[1] + (c[1] - p[1]) * k + 0.5) * cell];
  });
  const dying = s.mode === 'over';
  for (let i = n - 1; i >= 0; i--) {
    const f = i / Math.max(1, n - 1);
    const col = dying ? pal.ghost : mix(pal.teal, '#0d3a36', f * 0.75);
    const size = cell * (0.86 - f * 0.18);
    g.save();
    if (!dying) { g.shadowColor = alpha(pal.teal, 0.8); g.shadowBlur = i === 0 ? cell * 0.9 : cell * 0.35; }
    g.fillStyle = col;
    roundRect(g, pts[i][0] - size / 2, pts[i][1] - size / 2, size, size, size * 0.3);
    g.fill();
    g.restore();
  }
  if (n) {
    const [dx, dy] = DIRS[s.dir];
    const [hx, hy] = pts[0];
    g.fillStyle = '#06100f';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.arc(hx + dx * cell * 0.16 + -dy * side * cell * 0.18, hy + dy * cell * 0.16 + dx * side * cell * 0.18, Math.max(1.2, cell * 0.075), 0, Math.PI * 2);
      g.fill();
    }
  }
  s.particles.draw(g);
  g.restore();

  if (s.mode === 'title') {
    overlay(g, w, h, pal, [
      { t: 'SNAKE', size: Math.min(64, w / 7), color: pal.text, glow: pal.teal, spacing: 10, weight: 700 },
      { t: s.hi ? `best ${s.hi}` : 'eat. grow. do not hit yourself.', size: 13, color: pal.dim, spacing: 2 },
      { t: Math.floor(t * 2) % 2 ? 'press an arrow key or swipe to start' : ' ', size: 13, color: pal.amber, spacing: 2 },
    ], { gap: 46 });
  } else if (s.mode === 'pause') {
    overlay(g, w, h, pal, [
      { t: 'PAUSED', size: 34, color: pal.text, glow: pal.amber, spacing: 8 },
      { t: 'p to resume   esc to leave', size: 12, color: pal.dim, spacing: 2 },
    ], { gap: 40 });
  } else if (s.mode === 'over' && s.dead > 0.7) {
    const best = s.score >= s.hi && s.score > 0;
    overlay(g, w, h, pal, [
      { t: 'GAME OVER', size: Math.min(44, w / 9), color: pal.text, glow: pal.ember, spacing: 8, weight: 700 },
      { t: `score ${s.score}   length ${s.body.length}`, size: 13, color: pal.dim, spacing: 1 },
      { t: best ? 'new best' : `best ${s.hi}`, size: 13, color: best ? pal.amber : pal.ghost, spacing: 3 },
      { t: 'enter to go again   esc to leave', size: 12, color: pal.dim, spacing: 2 },
    ], { gap: 38 });
  }
}

export default {
  key: 'snake',
  title: 'snake',
  ui: 'panel',
  async mount(el, ctx) {
    sfx = createSfx();
    api = stage(el, ctx, {
      title: 'snake',
      label: 'snake playfield',
      help: [['← ↑ → ↓', 'steer'], ['wasd', 'steer'], ['p', 'pause'], ['enter', 'start'], ['esc', 'leave']],
    });
    api.button('sound', sfx.muted ? 'sound off' : 'sound on', () => act('mute', true));
    api.button('pause', 'pause', () => act('pause', true));
    api.button('exit', 'exit', () => ctx.close());
    api.fit();
    s = fresh();
    hud();
    api.onResize = () => { if (s.mode === 'title') { s = fresh(); hud(); } };
    input = controls(ctx, api, {
      keymap: {
        ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right',
        p: 'pause', m: 'mute', Enter: 'start', ' ': 'start',
      },
      padButtons: [
        { a: 'left', label: '◀', group: 0 }, { a: 'right', label: '▶', group: 0 },
        { a: 'up', label: '▲', group: 1 }, { a: 'down', label: '▼', group: 1 },
      ],
      onAction: act,
      swipe: (dir) => act(dir, true),
      tap: (e, kind) => { if (kind === 'tap' && (s.mode === 'title' || s.mode === 'over')) act('start', true); },
    });
    runner = loop(update, draw);
    runner.onHidden = () => { if (s.mode === 'play') s.mode = 'pause'; };
  },
  unmount() {
    if (runner) runner.stop();
    if (input) input.destroy();
    if (sfx) sfx.close();
    if (api) api.destroy();
    api = input = runner = sfx = s = null;
  },
};
