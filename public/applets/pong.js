// pong.js — real-time pong against the terminal. First to 7.
// Paddle angle control, a ball that speeds up each rally, and an opponent that
// gets sharper as you pull ahead.

import { stage, controls, loop, createSfx, scores, Particles, text, drawDots, overlay, alpha, clamp } from './game-kit.js';

const W = 160;      // field units
const H = 90;
const PAD_H = 16;
const PAD_W = 2.4;
const WIN = 7;

let api, input, runner, sfx, s;

function fresh(mode = 'title') {
  return {
    mode, t: 0,
    py: H / 2, ay: H / 2, aTarget: H / 2, aThink: 0,
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 }, trail: [],
    you: 0, them: 0, rally: 0, bestRally: scores.get('pong-rally'),
    serve: 1.2, serveDir: Math.random() < 0.5 ? -1 : 1,
    pointer: null, shake: 0, flash: 0, wins: scores.get('pong-wins'),
    particles: new Particles(),
  };
}

function hud() {
  api.stat('you', s.you, s.you > s.them);
  api.stat('terminal', s.them);
  api.stat('rally', s.rally);
  api.stat('wins', s.wins);
}

function launch() {
  const ang = (Math.random() * 0.7 - 0.35);
  const speed = 78;
  s.ball = { x: W / 2, y: H / 2, vx: Math.cos(ang) * speed * s.serveDir, vy: Math.sin(ang) * speed };
  s.trail = [];
  s.rally = 0;
}

function point(youScored) {
  if (youScored) s.you++; else s.them++;
  s.serveDir = youScored ? 1 : -1;
  s.shake = 8;
  s.flash = 0.6;
  sfx.play(youScored ? 'score' : 'miss');
  if (s.rally > s.bestRally) { s.bestRally = s.rally; scores.set('pong-rally', s.rally); }
  const sc = scale();
  s.particles.burst(sc.ox + s.ball.x * sc.k, sc.oy + s.ball.y * sc.k, youScored ? api.pal.teal : api.pal.ember, 30, 220, 0.8);
  if (s.you >= WIN || s.them >= WIN) {
    s.mode = 'over';
    if (s.you > s.them) { s.wins++; scores.set('pong-wins', s.wins); sfx.play('win'); } else sfx.play('over');
    api.announce(s.you > s.them ? 'you win.' : 'the terminal wins.');
  } else {
    s.serve = 1.1;
    s.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    s.trail = [];
  }
  hud();
}

function bounce(paddleY, dir) {
  const b = s.ball;
  const off = clamp((b.y - paddleY) / (PAD_H / 2), -1, 1);
  const speed = Math.min(190, Math.hypot(b.vx, b.vy) * 1.045 + 2);
  const ang = off * 0.95;
  b.vx = Math.cos(ang) * speed * dir;
  b.vy = Math.sin(ang) * speed;
  s.rally++;
  sfx.play('hit');
  const sc = scale();
  s.particles.burst(sc.ox + b.x * sc.k, sc.oy + b.y * sc.k, api.pal.text, 8, 120, 0.35);
  api.stat('rally', s.rally);
}

function update(dt) {
  s.t += dt;
  s.particles.update(dt);
  s.shake = Math.max(0, s.shake - dt * 30);
  s.flash = Math.max(0, s.flash - dt * 2);
  if (s.mode !== 'play') return;

  // player paddle: keys, or follow the pointer
  const move = (input.isHeld('up') ? -1 : 0) + (input.isHeld('down') ? 1 : 0);
  if (move) { s.py += move * 120 * dt; s.pointer = null; }
  else if (s.pointer !== null) s.py += clamp(s.pointer - s.py, -260 * dt, 260 * dt);
  s.py = clamp(s.py, PAD_H / 2, H - PAD_H / 2);

  if (s.serve > 0) {
    s.serve -= dt;
    if (s.serve <= 0) launch();
    return;
  }

  // opponent: re-plans a few times a second, with error that shrinks as you lead
  const b = s.ball;
  s.aThink -= dt;
  if (s.aThink <= 0) {
    const lead = s.you - s.them;
    const skill = clamp(0.62 + lead * 0.06 + s.rally * 0.01, 0.45, 0.97);
    s.aThink = 0.2 - skill * 0.12;
    if (b.vx > 0) {
      const tHit = (W - 6 - b.x) / b.vx;
      let y = b.y + b.vy * tHit;
      const span = H;
      y = ((y % (2 * span)) + 2 * span) % (2 * span);
      if (y > span) y = 2 * span - y;
      s.aTarget = y + (Math.random() - 0.5) * (1 - skill) * 46;
    } else {
      s.aTarget = H / 2 + (b.y - H / 2) * 0.3;
    }
  }
  const aSpeed = 92 + (s.you - s.them) * 6;
  s.ay += clamp(s.aTarget - s.ay, -aSpeed * dt, aSpeed * dt);
  s.ay = clamp(s.ay, PAD_H / 2, H - PAD_H / 2);

  // ball
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    b.x += (b.vx * dt) / steps;
    b.y += (b.vy * dt) / steps;
    if (b.y < 1.2) { b.y = 1.2; b.vy = Math.abs(b.vy); sfx.play('wall'); }
    if (b.y > H - 1.2) { b.y = H - 1.2; b.vy = -Math.abs(b.vy); sfx.play('wall'); }
    if (b.vx < 0 && b.x < 6 + PAD_W && b.x > 4 && Math.abs(b.y - s.py) < PAD_H / 2 + 1.4) { b.x = 6 + PAD_W; bounce(s.py, 1); }
    if (b.vx > 0 && b.x > W - 6 - PAD_W && b.x < W - 4 && Math.abs(b.y - s.ay) < PAD_H / 2 + 1.4) { b.x = W - 6 - PAD_W; bounce(s.ay, -1); }
    if (b.x < -4) { point(false); return; }
    if (b.x > W + 4) { point(true); return; }
  }
  s.trail.push([b.x, b.y]);
  if (s.trail.length > 14) s.trail.shift();
}

function act(a, isDown) {
  if (!isDown) return;
  if (a === 'mute') { const m = sfx.toggle(); api.buttons.sound.textContent = m ? 'sound off' : 'sound on'; return; }
  if (a === 'start') {
    if (s.mode === 'title' || s.mode === 'over') { const keep = { wins: s.wins, bestRally: s.bestRally }; s = fresh('play'); Object.assign(s, keep); hud(); }
    else if (s.mode === 'pause') s.mode = 'play';
    return;
  }
  if (a === 'pause') { if (s.mode === 'play') s.mode = 'pause'; else if (s.mode === 'pause') s.mode = 'play'; return; }
  if ((a === 'up' || a === 'down') && s.mode === 'title') act('start', true);
}

function scale() {
  const k = Math.min((api.w - 20) / W, (api.h - 20) / H);
  return { k, ox: (api.w - W * k) / 2, oy: (api.h - H * k) / 2 };
}

function draw(t) {
  const g = api.g;
  const { w, h, pal } = api;
  if (!w) return;
  g.clearRect(0, 0, w, h);
  drawDots(g, pal, w, h, t);
  const { k, ox, oy } = scale();
  const X = (v) => ox + v * k;
  const Y = (v) => oy + v * k;
  g.save();
  if (s.shake) g.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);

  g.save();
  g.shadowColor = alpha(pal.teal, 0.4);
  g.shadowBlur = 22;
  g.fillStyle = 'rgba(8,9,12,.92)';
  g.fillRect(X(0), Y(0), W * k, H * k);
  g.restore();
  g.strokeStyle = alpha(pal.teal, 0.5);
  g.lineWidth = 1.5;
  g.strokeRect(X(0), Y(0), W * k, H * k);

  // net and ghost score
  g.fillStyle = alpha(pal.text, 0.14);
  for (let y = 2; y < H; y += 6) g.fillRect(X(W / 2) - k * 0.4, Y(y), k * 0.8, k * 3);
  text(g, String(s.you), X(W / 2 - 22), Y(20), { size: k * 22, align: 'center', color: alpha(pal.teal, 0.3), weight: 700 });
  text(g, String(s.them), X(W / 2 + 22), Y(20), { size: k * 22, align: 'center', color: alpha(pal.ember, 0.3), weight: 700 });

  // paddles
  const paddle = (x, y, color) => {
    g.save();
    g.shadowColor = color;
    g.shadowBlur = k * 5;
    g.fillStyle = color;
    g.fillRect(X(x), Y(y - PAD_H / 2), PAD_W * k, PAD_H * k);
    g.restore();
  };
  paddle(6, s.py, pal.teal);
  paddle(W - 6 - PAD_W, s.ay, pal.ember);

  // ball with a fading trail
  s.trail.forEach(([bx, by], i) => {
    const a = (i + 1) / s.trail.length;
    g.fillStyle = alpha(pal.amber, a * 0.35);
    g.beginPath();
    g.arc(X(bx), Y(by), k * 1.5 * a, 0, Math.PI * 2);
    g.fill();
  });
  if (s.mode === 'play' || s.mode === 'pause') {
    g.save();
    g.shadowColor = pal.amber;
    g.shadowBlur = k * 7;
    g.fillStyle = s.serve > 0 ? alpha(pal.amber, 0.5 + 0.5 * Math.sin(t * 14)) : pal.amber;
    g.beginPath();
    g.arc(X(s.ball.x), Y(s.ball.y), k * 1.7, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  s.particles.draw(g);
  g.restore();

  if (s.flash > 0) { g.fillStyle = alpha('#ffffff', s.flash * 0.1); g.fillRect(0, 0, w, h); }

  if (s.mode === 'title') {
    overlay(g, w, h, pal, [
      { t: 'PONG', size: Math.min(64, w / 7), color: pal.text, glow: pal.teal, spacing: 12, weight: 700 },
      { t: `first to ${WIN}. you are the left paddle.`, size: 13, color: pal.dim, spacing: 2 },
      { t: Math.floor(t * 2) % 2 ? 'press enter or tap to serve' : ' ', size: 13, color: pal.amber, spacing: 2 },
    ], { gap: 46 });
  } else if (s.mode === 'pause') {
    overlay(g, w, h, pal, [
      { t: 'PAUSED', size: 34, color: pal.text, glow: pal.amber, spacing: 8 },
      { t: 'p to resume   esc to leave', size: 12, color: pal.dim, spacing: 2 },
    ], { gap: 40 });
  } else if (s.mode === 'over') {
    const won = s.you > s.them;
    overlay(g, w, h, pal, [
      { t: won ? 'YOU WIN' : 'TERMINAL WINS', size: Math.min(44, w / 10), color: pal.text, glow: won ? pal.teal : pal.ember, spacing: 8, weight: 700 },
      { t: `${s.you} - ${s.them}   longest rally ${s.bestRally}`, size: 13, color: pal.dim, spacing: 1 },
      { t: 'enter for a rematch   esc to leave', size: 12, color: pal.dim, spacing: 2 },
    ], { gap: 40 });
  }
}

export default {
  key: 'pong',
  title: 'pong',
  ui: 'panel',
  async mount(el, ctx) {
    sfx = createSfx();
    api = stage(el, ctx, {
      title: 'pong',
      label: 'pong court',
      help: [['↑ ↓', 'move'], ['w s', 'move'], ['mouse', 'follow'], ['p', 'pause'], ['enter', 'serve'], ['esc', 'leave']],
    });
    api.button('sound', sfx.muted ? 'sound off' : 'sound on', () => act('mute', true));
    api.button('pause', 'pause', () => act('pause', true));
    api.button('exit', 'exit', () => ctx.close());
    s = fresh();
    hud();
    input = controls(ctx, api, {
      keymap: { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', p: 'pause', m: 'mute', Enter: 'start', ' ': 'start' },
      padButtons: [{ a: 'up', label: '▲', group: 0 }, { a: 'down', label: '▼', group: 0 }, { a: 'start', label: '●', group: 1 }],
      onAction: act,
      tap: (e, kind) => { if (kind === 'tap' && (s.mode === 'title' || s.mode === 'over')) act('start', true); },
    });
    const follow = (e) => {
      const r = api.canvas.getBoundingClientRect();
      const { k, oy } = scale();
      s.pointer = clamp((e.clientY - r.top - oy) / k, 0, H);
    };
    api.canvas.addEventListener('pointermove', follow);
    api.canvas.addEventListener('pointerdown', follow);
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
