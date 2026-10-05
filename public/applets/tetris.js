// tetris.js — real-time falling blocks.
// Seven-bag randomiser, hold, ghost, three-piece preview, soft and hard drop,
// lock delay, wall kicks, combos, back-to-back, and a level curve.

import { KOROBEINIKI, stage, controls, loop, createSfx, scores, Particles, text, roundRect, drawDots, overlay, mix, alpha, motionOK } from './game-kit.js';

const COLS = 10;
const ROWS = 20;

const SHAPES = {
  I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};
const KINDS = Object.keys(SHAPES);
const ROT = {};
for (const k of KINDS) {
  const { n, c } = SHAPES[k];
  let cells = c;
  ROT[k] = [];
  for (let r = 0; r < 4; r++) {
    ROT[k].push(cells);
    cells = cells.map(([x, y]) => [n - 1 - y, x]);
  }
}
const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];
const LINE_SCORE = [0, 100, 300, 500, 800];

let api, input, runner, sfx, state;

function newState() {
  return {
    mode: 'title',
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    bag: [], queue: [], cur: null, hold: null, canHold: true,
    score: 0, lines: 0, level: 1, combo: -1, b2b: false,
    fall: 0, lock: 0, lockMoves: 0,
    das: { dir: 0, t: 0 },
    clearing: null, // { rows, t }
    over: 0, shake: 0, flash: 0,
    hi: scores.get('tetris'),
    particles: new Particles(),
    t: 0,
  };
}

function refill(s) {
  while (s.queue.length < 5) {
    if (!s.bag.length) {
      s.bag = KINDS.slice();
      for (let i = s.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s.bag[i], s.bag[j]] = [s.bag[j], s.bag[i]]; }
    }
    s.queue.push(s.bag.pop());
  }
}

const cellsOf = (p) => ROT[p.k][p.r].map(([x, y]) => [x + p.x, y + p.y]);

function fits(s, p) {
  for (const [x, y] of cellsOf(p)) {
    if (x < 0 || x >= COLS || y >= ROWS) return false;
    if (y >= 0 && s.board[y][x]) return false;
  }
  return true;
}

function spawn(s, kind) {
  refill(s);
  const k = kind || s.queue.shift();
  refill(s);
  const n = SHAPES[k].n;
  const p = { k, r: 0, x: Math.floor((COLS - n) / 2), y: k === 'I' ? -1 : 0 };
  s.cur = p;
  s.fall = 0; s.lock = 0; s.lockMoves = 0;
  if (!fits(s, p)) { p.y -= 1; if (!fits(s, p)) return gameOver(s); }
}

function gameOver(s) {
  s.mode = 'over';
  s.over = 0;
  s.cur = null;
  if (s.score > s.hi) { s.hi = s.score; scores.set('tetris', s.score); }
  sfx.stopMusic();
  sfx.play('over');
  api.announce(`game over. score ${s.score}.`);
}

function start() {
  const hi = state ? state.hi : scores.get('tetris');
  state = newState();
  state.hi = hi;
  state.mode = 'play';
  refill(state);
  spawn(state);
  syncHud();
  sfx.startMusic(KOROBEINIKI, tempo);
}

// the theme speeds up as the level climbs
const tempo = () => 132 + (state ? state.level - 1 : 0) * 5;

function syncHud() {
  api.stat('score', state.score, state.score > 0 && state.score >= state.hi);
  api.stat('lines', state.lines);
  api.stat('level', state.level);
  api.stat('best', Math.max(state.hi, state.score));
}

function tryMove(s, dx, dy) {
  const p = { ...s.cur, x: s.cur.x + dx, y: s.cur.y + dy };
  if (!fits(s, p)) return false;
  s.cur = p;
  if (dy === 0 && grounded(s) && s.lockMoves < 15) { s.lock = 0; s.lockMoves++; }
  return true;
}

function tryRotate(s, dir) {
  if (s.cur.k === 'O') return false;
  const r = (s.cur.r + dir + 4) % 4;
  for (const [kx, ky] of KICKS) {
    const p = { ...s.cur, r, x: s.cur.x + kx, y: s.cur.y + ky };
    if (fits(s, p)) {
      s.cur = p;
      if (s.lockMoves < 15) { s.lock = 0; s.lockMoves++; }
      return true;
    }
  }
  return false;
}

const grounded = (s) => !fits(s, { ...s.cur, y: s.cur.y + 1 });

function ghostY(s) {
  const p = { ...s.cur };
  while (fits(s, { ...p, y: p.y + 1 })) p.y++;
  return p.y;
}

function lockPiece(s) {
  let above = false;
  for (const [x, y] of cellsOf(s.cur)) {
    if (y < 0) { above = true; continue; }
    s.board[y][x] = s.cur.k;
  }
  s.cur = null;
  s.canHold = true;
  sfx.play('lock');
  if (above) return gameOver(s);
  const rows = [];
  for (let y = 0; y < ROWS; y++) if (s.board[y].every(Boolean)) rows.push(y);
  if (rows.length) {
    s.clearing = { rows, t: 0 };
    s.mode = 'clear';
    const tetris = rows.length === 4;
    sfx.play(tetris ? 'tetris' : 'clear');
    s.flash = tetris ? 1 : 0.5;
    s.shake = tetris ? 10 : 4;
  } else {
    s.combo = -1;
    spawn(s);
  }
}

function finishClear(s) {
  const n = s.clearing.rows.length;
  for (const y of s.clearing.rows) { s.board.splice(y, 1); s.board.unshift(Array(COLS).fill(null)); }
  s.clearing = null;
  s.combo++;
  const tetris = n === 4;
  let gain = LINE_SCORE[n] * s.level;
  if (tetris && s.b2b) gain = Math.round(gain * 1.5);
  if (s.combo > 0) gain += 50 * s.combo * s.level;
  s.score += gain;
  s.lines += n;
  const level = Math.min(20, 1 + Math.floor(s.lines / 10));
  if (level > s.level) { s.level = level; api.toast(`level ${level}`); }
  else if (tetris) api.toast(s.b2b ? 'back to back' : 'tetris');
  else if (s.combo > 0) api.toast(`combo x${s.combo + 1}`);
  s.b2b = tetris;
  if (s.board.every((row) => row.every((c) => !c))) { s.score += 2000 * s.level; api.toast('perfect clear'); }
  s.mode = 'play';
  spawn(s);
  syncHud();
}

const gravity = (level) => Math.pow(0.8 - (level - 1) * 0.007, level - 1);

function update(dt) {
  const s = state;
  s.t += dt;
  s.particles.update(dt);
  s.shake = Math.max(0, s.shake - dt * 40);
  s.flash = Math.max(0, s.flash - dt * 2.4);
  if (s.mode === 'over') { s.over += dt; return; }
  if (s.mode === 'clear') {
    s.clearing.t += dt;
    if (s.clearing.t > (motionOK() ? 0.32 : 0.05)) finishClear(s);
    return;
  }
  if (s.mode !== 'play' || !s.cur) return;

  // auto-repeat for held left/right
  if (s.das.dir) {
    s.das.t -= dt;
    while (s.das.t <= 0) {
      if (tryMove(s, s.das.dir, 0)) sfx.play('move');
      s.das.t += 0.035;
    }
  }

  const soft = input.isHeld('down');
  const step = soft ? Math.min(0.04, gravity(s.level)) : gravity(s.level);
  s.fall += dt;
  while (s.fall >= step) {
    s.fall -= step;
    if (tryMove(s, 0, 1)) { if (soft) s.score += 1; }
    else break;
  }
  if (grounded(s)) {
    s.lock += dt;
    if (s.lock >= 0.5 || s.lockMoves >= 15) lockPiece(s);
  } else {
    s.lock = 0;
  }
  if (soft) syncHud();
}

function act(a, isDown) {
  const s = state;
  if (a === 'left' || a === 'right') {
    const dir = a === 'left' ? -1 : 1;
    if (isDown) {
      s.das = { dir, t: 0.16 };
      if (s.mode === 'play' && s.cur && tryMove(s, dir, 0)) sfx.play('move');
    } else if (s.das.dir === dir) {
      const other = dir === -1 ? 'right' : 'left';
      s.das = input.isHeld(other) ? { dir: -dir, t: 0.16 } : { dir: 0, t: 0 };
    }
    return;
  }
  if (!isDown) return;
  if (a === 'mute') { const m = sfx.toggle(); api.buttons.sound.textContent = m ? 'music off' : 'music on'; return; }
  if (a === 'start') {
    if (s.mode === 'title' || s.mode === 'over') { start(); return; }
    if (s.mode === 'pause') { s.mode = 'play'; sfx.startMusic(KOROBEINIKI, tempo, false); return; }
  }
  if (a === 'pause') {
    if (s.mode === 'play') { s.mode = 'pause'; sfx.stopMusic(); }
    else if (s.mode === 'pause') { s.mode = 'play'; sfx.startMusic(KOROBEINIKI, tempo, false); }
    return;
  }
  if (s.mode !== 'play' || !s.cur) return;
  if (a === 'rotate') { if (tryRotate(s, 1)) sfx.play('rotate'); }
  else if (a === 'rotateBack') { if (tryRotate(s, -1)) sfx.play('rotate'); }
  else if (a === 'drop') {
    const y = ghostY(s);
    s.score += (y - s.cur.y) * 2;
    s.cur.y = y;
    const cell = geom().cell;
    for (const [cx, cy] of cellsOf(s.cur)) s.particles.burst(geom().ox + (cx + 0.5) * cell, geom().oy + (cy + 1) * cell, colorOf(s.cur.k), 3, 70, 0.35);
    s.shake = Math.max(s.shake, 3);
    sfx.play('drop');
    lockPiece(s);
    syncHud();
  } else if (a === 'hold') {
    if (!s.canHold) return;
    const k = s.cur.k;
    const next = s.hold;
    s.hold = k;
    spawn(s, next || undefined);
    s.canHold = false;
    sfx.play('rotate');
  }
}

// --------------------------------------------------------------------- draw

function colorOf(k) {
  const p = api.pal;
  return {
    I: p.teal, O: p.amber, T: p.ember,
    S: mix(p.teal, p.text, 0.45), Z: mix(p.ember, p.text, 0.4),
    J: mix(p.amber, p.ember, 0.5), L: p.text,
  }[k];
}

function geom() {
  const { w, h } = api;
  // layout in cells: hold(5) gap(1) well(10) gap(1) side(5) = 22 wide, 20 tall + 1 margin each side
  const narrow = w < 430;
  const cols = narrow ? 16.5 : 22.5;
  const cell = Math.floor(Math.min(w / cols, h / 21.2));
  const wellW = cell * COLS;
  const total = narrow ? wellW + cell * 5.5 : wellW + cell * 12;
  const left = (w - total) / 2;
  const ox = narrow ? left : left + cell * 6;
  const oy = (h - cell * ROWS) / 2;
  return { cell, ox, oy, narrow, holdX: narrow ? null : left, sideX: ox + wellW + cell };
}

function block(g, x, y, s, color, a = 1, glow = true) {
  g.save();
  g.globalAlpha = a;
  if (glow) { g.shadowColor = color; g.shadowBlur = s * 0.55; }
  const pad = Math.max(1, s * 0.06);
  roundRect(g, x + pad, y + pad, s - pad * 2, s - pad * 2, s * 0.16);
  g.fillStyle = color;
  g.fill();
  g.shadowBlur = 0;
  // top-left sheen and bottom shade give the tile a pressed-key feel
  g.globalAlpha = a * 0.28;
  g.fillStyle = '#ffffff';
  roundRect(g, x + pad * 2, y + pad * 2, s - pad * 4, s * 0.28, s * 0.1);
  g.fill();
  g.globalAlpha = a * 0.22;
  g.fillStyle = '#000000';
  g.fillRect(x + pad * 2, y + s * 0.68, s - pad * 4, s * 0.2);
  g.restore();
}

function mini(g, k, x, y, cell, dim) {
  const cells = ROT[k][0];
  const n = SHAPES[k].n;
  const minY = Math.min(...cells.map((c) => c[1]));
  const maxY = Math.max(...cells.map((c) => c[1]));
  const offX = x + ((4 - n) / 2) * cell;
  const offY = y + ((2 - (maxY - minY + 1)) / 2 - minY) * cell;
  for (const [cx, cy] of cells) block(g, offX + cx * cell, offY + cy * cell, cell, colorOf(k), dim ? 0.35 : 1, !dim);
}

function panel(g, x, y, w, h, label) {
  const p = api.pal;
  g.save();
  g.fillStyle = 'rgba(10,11,13,.6)';
  g.strokeStyle = p.rule;
  g.lineWidth = 1;
  roundRect(g, x, y, w, h, 6);
  g.fill();
  g.stroke();
  g.restore();
  text(g, label, x + 8, y + 12, { size: 10, color: p.ghost, spacing: 2 });
}

function draw(t) {
  const g = api.g;
  const { w, h, pal } = api;
  const s = state;
  if (!w) return;
  g.clearRect(0, 0, w, h);
  drawDots(g, pal, w, h, t);

  const { cell, ox, oy, narrow, holdX, sideX } = geom();
  const wellW = cell * COLS;
  const wellH = cell * ROWS;
  const sx = s.shake ? (Math.random() - 0.5) * s.shake : 0;
  const sy = s.shake ? (Math.random() - 0.5) * s.shake : 0;

  g.save();
  g.translate(sx, sy);

  // well
  g.save();
  g.shadowColor = alpha(pal.teal, 0.45);
  g.shadowBlur = 22;
  g.fillStyle = 'rgba(8,9,12,.92)';
  g.fillRect(ox - 2, oy - 2, wellW + 4, wellH + 4);
  g.restore();
  g.strokeStyle = alpha(pal.teal, 0.5);
  g.lineWidth = 1.5;
  g.strokeRect(ox - 2, oy - 2, wellW + 4, wellH + 4);
  g.strokeStyle = 'rgba(255,255,255,.035)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 1; x < COLS; x++) { g.moveTo(ox + x * cell + 0.5, oy); g.lineTo(ox + x * cell + 0.5, oy + wellH); }
  for (let y = 1; y < ROWS; y++) { g.moveTo(ox, oy + y * cell + 0.5); g.lineTo(ox + wellW, oy + y * cell + 0.5); }
  g.stroke();

  g.save();
  g.beginPath();
  g.rect(ox, oy, wellW, wellH);
  g.clip();

  const clearing = s.clearing ? new Set(s.clearing.rows) : null;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const k = s.board[y][x];
      if (!k) continue;
      if (clearing && clearing.has(y)) {
        const k2 = s.clearing.t / 0.32;
        const col = mix(colorOf(k), '#ffffff', Math.min(1, k2 * 2));
        block(g, ox + x * cell, oy + y * cell, cell, col, Math.max(0, 1 - k2 * 0.9));
        if (Math.random() < 0.25) s.particles.burst(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, colorOf(k), 1, 160, 0.5);
      } else {
        const dimmed = s.mode === 'over' && y >= ROWS - Math.floor(s.over * 30);
        block(g, ox + x * cell, oy + y * cell, cell, dimmed ? pal.ghost : colorOf(k), 1, !dimmed);
      }
    }
  }

  if (s.cur && (s.mode === 'play' || s.mode === 'pause')) {
    const gy = ghostY(s);
    const color = colorOf(s.cur.k);
    g.save();
    g.strokeStyle = alpha(pal.text, 0.28);
    g.lineWidth = 1.5;
    for (const [x, y] of ROT[s.cur.k][s.cur.r]) {
      roundRect(g, ox + (x + s.cur.x) * cell + 3, oy + (y + gy) * cell + 3, cell - 6, cell - 6, cell * 0.14);
      g.stroke();
    }
    g.restore();
    const pulse = grounded(s) ? 0.7 + 0.3 * Math.sin(t * 22) : 1;
    for (const [x, y] of cellsOf(s.cur)) block(g, ox + x * cell, oy + y * cell, cell, color, pulse);
  }
  g.restore();

  s.particles.draw(g);

  // side panels
  const pw = cell * 5;
  panel(g, sideX, oy, pw, cell * 9.5, 'NEXT');
  s.queue.slice(0, 3).forEach((k, i) => mini(g, k, sideX + cell * 0.5, oy + cell * (1.2 + i * 2.8), cell * 0.95, false));
  if (!narrow) {
    panel(g, holdX, oy, pw, cell * 4, 'HOLD');
    if (s.hold) mini(g, s.hold, holdX + cell * 0.5, oy + cell * 1.2, cell * 0.95, !s.canHold);
    panel(g, holdX, oy + cell * 5, pw, cell * 8, 'STATUS');
    const rows = [['score', s.score], ['lines', s.lines], ['level', s.level], ['best', Math.max(s.hi, s.score)]];
    rows.forEach(([k, v], i) => {
      text(g, k.toUpperCase(), holdX + 10, oy + cell * 6.6 + i * cell * 1.6, { size: Math.max(9, cell * 0.42), color: pal.ghost, spacing: 1.5 });
      text(g, String(v), holdX + 10, oy + cell * 7.3 + i * cell * 1.6, { size: Math.max(12, cell * 0.66), color: pal.text });
    });
  } else {
    panel(g, sideX, oy + cell * 10.5, pw, cell * 4, 'HOLD');
    if (s.hold) mini(g, s.hold, sideX + cell * 0.5, oy + cell * 11.7, cell * 0.95, !s.canHold);
  }
  g.restore();

  if (s.flash > 0) { g.fillStyle = alpha('#ffffff', s.flash * 0.12); g.fillRect(0, 0, w, h); }

  if (s.mode === 'title') {
    overlay(g, w, h, pal, [
      { t: 'TETRIS', size: Math.min(64, w / 7), color: pal.text, glow: pal.teal, spacing: 10, weight: 700 },
      { t: s.hi ? `best ${s.hi}` : 'stack them. clear them.', size: 13, color: pal.dim, spacing: 2 },
      { t: Math.floor(t * 2) % 2 ? 'press enter or tap to start' : ' ', size: 13, color: pal.amber, spacing: 2 },
      { t: sfx.muted ? 'press m for the music' : 'music on', size: 11, color: pal.ghost, spacing: 2 },
    ], { gap: 42 });
  } else if (s.mode === 'pause') {
    overlay(g, w, h, pal, [
      { t: 'PAUSED', size: 34, color: pal.text, glow: pal.amber, spacing: 8 },
      { t: 'p to resume   esc to leave', size: 12, color: pal.dim, spacing: 2 },
    ], { gap: 40 });
  } else if (s.mode === 'over' && s.over > 0.8) {
    const best = s.score >= s.hi && s.score > 0;
    overlay(g, w, h, pal, [
      { t: 'GAME OVER', size: Math.min(44, w / 9), color: pal.text, glow: pal.ember, spacing: 8, weight: 700 },
      { t: `score ${s.score}   lines ${s.lines}   level ${s.level}`, size: 13, color: pal.dim, spacing: 1 },
      { t: best ? 'new best' : `best ${s.hi}`, size: 13, color: best ? pal.amber : pal.ghost, spacing: 3 },
      { t: 'enter to go again   esc to leave', size: 12, color: pal.dim, spacing: 2 },
    ], { gap: 38 });
  }
}

export default {
  key: 'tetris',
  title: 'tetris',
  ui: 'panel',
  async mount(el, ctx) {
    sfx = createSfx();
    api = stage(el, ctx, {
      title: 'tetris',
      label: 'tetris playfield',
      help: [['← →', 'move'], ['↑', 'rotate'], ['↓', 'soft drop'], ['space', 'hard drop'], ['c', 'hold'], ['p', 'pause'], ['m', 'music'], ['esc', 'leave']],
    });
    api.button('sound', sfx.muted ? 'music off' : 'music on', () => act('mute', true));
    api.button('pause', 'pause', () => act('pause', true));
    api.button('exit', 'exit', () => ctx.close());
    state = newState();
    refill(state);
    syncHud();
    input = controls(ctx, api, {
      keymap: {
        ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowDown: 'down', s: 'down',
        ArrowUp: 'rotate', w: 'rotate', x: 'rotate', z: 'rotateBack', ' ': 'drop', c: 'hold', Shift: 'hold',
        p: 'pause', m: 'mute', Enter: 'start',
      },
      padButtons: [
        { a: 'left', label: '◀', group: 0 }, { a: 'down', label: '▼', group: 0 }, { a: 'right', label: '▶', group: 0 },
        { a: 'hold', label: 'H', group: 1 }, { a: 'rotate', label: '⟳', group: 1 }, { a: 'drop', label: '⤓', group: 1 },
      ],
      onAction: act,
      tap: (e, kind) => { if (kind === 'tap') { if (state.mode === 'title' || state.mode === 'over') act('start', true); else act('rotate', true); } },
      swipe: (dir) => { if (dir === 'down') act('drop', true); else if (dir === 'up') act('hold', true); else { act(dir, true); act(dir, false); } },
    });
    runner = loop(update, draw);
    runner.onHidden = () => { if (state.mode === 'play') { state.mode = 'pause'; sfx.stopMusic(); } };
  },
  unmount() {
    if (runner) runner.stop();
    if (input) input.destroy();
    if (sfx) sfx.close();
    if (api) api.destroy();
    api = input = runner = sfx = state = null;
  },
};
