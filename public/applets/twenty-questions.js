// twenty-questions.js — the screen for 20q. The guessing itself lives in
// terminal-twenty-questions.js; this drives it and reads back what it prints.

import { stage, createSfx, scores, rawKeys, addStyle } from './game-kit.js';
import * as tq from '../terminal-twenty-questions.js';

const CSS = `
.tw{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(.8rem,3vh,1.8rem);width:100%;height:100%;padding:1rem;box-sizing:border-box;text-align:center}
.tw-pips{display:grid;grid-template-columns:repeat(20,1fr);gap:.3rem;width:min(92%,560px)}
.tw-pip{height:6px;border-radius:3px;background:var(--rule);transition:background .3s,box-shadow .3s}
.tw-pip.yes{background:var(--dot-3)}
.tw-pip.no{background:var(--dot-1)}
.tw-pip.maybe{background:var(--dot-2)}
.tw-pip.idk{background:var(--text-ghost)}
.tw-pip.now{background:var(--text);box-shadow:0 0 12px rgba(232,228,220,.7)}
.tw-count{font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:var(--text-dim);min-height:1.2em}
.tw-count b{color:var(--dot-2);font-weight:600}
.tw-card{position:relative;width:min(92%,720px);min-height:clamp(120px,24vh,200px);display:flex;align-items:center;justify-content:center;
  border:1px solid var(--rule);border-radius:14px;background:rgba(10,11,13,.6);padding:1.4rem 1.6rem;
  box-shadow:0 0 0 1px rgba(255,255,255,.02),0 0 60px color-mix(in srgb,var(--dot-3) 9%,transparent);transition:border-color .35s,box-shadow .35s}
.tw-card.guess{border-color:var(--dot-2);box-shadow:0 0 70px color-mix(in srgb,var(--dot-2) 22%,transparent)}
.tw-card.won{border-color:var(--dot-3);box-shadow:0 0 80px color-mix(in srgb,var(--dot-3) 30%,transparent)}
.tw-card.lost{border-color:var(--dot-1);box-shadow:0 0 70px color-mix(in srgb,var(--dot-1) 22%,transparent)}
.tw-q{font-size:clamp(18px,3.4vw,32px);line-height:1.3;font-weight:600;color:var(--text);text-wrap:balance}
.tw-q.in{animation:tw-in .45s var(--ease)}
.tw-card.guess .tw-q{color:var(--dot-2);text-shadow:0 0 26px color-mix(in srgb,var(--dot-2) 55%,transparent)}
@keyframes tw-in{from{opacity:0;transform:translateY(10px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}
.tw-think{display:none;gap:.55rem}
.tw-card.busy .tw-think{display:flex}
.tw-card.busy .tw-q{display:none}
.tw-think i{width:11px;height:11px;border-radius:50%;animation:tw-dot 1s var(--ease) infinite}
.tw-think i:nth-child(1){background:var(--dot-1)}
.tw-think i:nth-child(2){background:var(--dot-2);animation-delay:.15s}
.tw-think i:nth-child(3){background:var(--dot-3);animation-delay:.3s}
@keyframes tw-dot{0%,70%,100%{opacity:.3;transform:scale(1)}25%{opacity:1;transform:scale(1.5)}}
.tw-note{min-height:1.3em;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim)}
.tw-btns{display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center}
.tw-b{min-width:108px;padding:.75rem 1rem;border:1px solid var(--rule);border-radius:10px;background:rgba(24,27,34,.75);color:var(--text);
  font:inherit;font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:all .14s}
.tw-b kbd{font:inherit;font-size:10px;color:var(--text-ghost);margin-left:.5em}
.tw-b:hover:not(:disabled){transform:translateY(-2px)}
.tw-b:disabled{opacity:.35;cursor:default}
.tw-b.yes:hover:not(:disabled){border-color:var(--dot-3);color:var(--dot-3);box-shadow:0 0 22px color-mix(in srgb,var(--dot-3) 30%,transparent)}
.tw-b.no:hover:not(:disabled){border-color:var(--dot-1);color:var(--dot-1);box-shadow:0 0 22px color-mix(in srgb,var(--dot-1) 30%,transparent)}
.tw-b.maybe:hover:not(:disabled){border-color:var(--dot-2);color:var(--dot-2)}
.tw-b.go{border-color:var(--dot-2);color:var(--dot-2)}
.tw-small{display:flex;gap:1rem;justify-content:center}
.tw-link{background:none;border:0;color:var(--text-dim);font:inherit;font-size:11px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;padding:.3rem}
.tw-link:hover:not(:disabled){color:var(--text)}
.tw-link:disabled{opacity:.3;cursor:default}
.tw-form{display:flex;gap:.5rem;width:min(92%,460px)}
.tw-form input{flex:1;min-width:0;background:rgba(10,11,13,.7);border:1px solid var(--rule);border-radius:10px;color:var(--text);font:inherit;font-size:16px;padding:.7rem .9rem}
.tw-form input:focus{outline:none;border-color:var(--dot-3)}
@media (max-width:560px){.tw-b{min-width:0;flex:1 1 40%}}
@media (prefers-reduced-motion:reduce){.tw-q.in,.tw-think i{animation:none}}
`;

let api, sfx, off, state, dom, alive;
let answers = [];
let view = 'intro'; // intro | ask | guess | learn | done

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function build(ctx) {
  const wrap = el('div', 'tw');
  const pips = el('div', 'tw-pips');
  const pipEls = [];
  for (let i = 0; i < 20; i++) { const p = el('span', 'tw-pip'); pips.appendChild(p); pipEls.push(p); }
  const count = el('div', 'tw-count');
  const card = el('div', 'tw-card');
  const q = el('div', 'tw-q');
  const think = el('div', 'tw-think');
  think.append(el('i'), el('i'), el('i'));
  card.append(q, think);
  const note = el('div', 'tw-note');
  const btns = el('div', 'tw-btns');
  const small = el('div', 'tw-small');
  wrap.append(pips, count, card, note, btns, small);
  api.main.appendChild(wrap);
  return { wrap, pipEls, count, card, q, note, btns, small };
}

function setQuestion(text, kind) {
  dom.q.classList.remove('in');
  void dom.q.offsetWidth;
  dom.q.textContent = text;
  dom.q.classList.add('in');
  dom.card.classList.toggle('guess', kind === 'guess');
  dom.card.classList.toggle('won', kind === 'won');
  dom.card.classList.toggle('lost', kind === 'lost');
}

function paintPips() {
  dom.pipEls.forEach((p, i) => {
    p.className = 'tw-pip' + (answers[i] ? ' ' + answers[i] : '') + (i === answers.length && view === 'ask' ? ' now' : '');
  });
}

function button(label, key, cls, fn) {
  const b = el('button', 'tw-b ' + cls);
  b.type = 'button';
  b.append(label);
  if (key) b.appendChild(el('kbd', '', key));
  b.addEventListener('click', () => { fn(); b.blur(); });
  return b;
}

function link(label, fn, disabled) {
  const b = el('button', 'tw-link', label);
  b.type = 'button';
  b.disabled = !!disabled;
  b.addEventListener('click', () => { fn(); b.blur(); });
  return b;
}

function controlsFor() {
  dom.btns.replaceChildren();
  dom.small.replaceChildren();
  if (view === 'ask') {
    dom.btns.append(
      button('yes', 'Y', 'yes', () => answer('yes')),
      button('no', 'N', 'no', () => answer('no')),
      button('maybe', 'M', 'maybe', () => answer('maybe')),
      button("don't know", 'I', '', () => answer('idk')),
    );
    dom.small.append(link('undo last answer', () => answer('undo'), !answers.length));
  } else if (view === 'guess') {
    dom.btns.append(button('yes, that is it', 'Y', 'yes', () => answer('yes')), button('no', 'N', 'no', () => answer('no')));
  } else if (view === 'learn') {
    const form = el('form', 'tw-form');
    const input = el('input');
    input.type = 'text'; input.maxLength = 40; input.autocomplete = 'off'; input.spellcheck = false;
    input.placeholder = 'what was it?';
    input.dataset.gk = '1';
    input.setAttribute('aria-label', 'what you were thinking of');
    const go = button('tell it', '', 'go', () => {});
    go.type = 'submit';
    form.append(input, go);
    form.addEventListener('submit', (e) => { e.preventDefault(); answer(input.value.trim() || 'skip'); });
    dom.btns.append(form);
    dom.small.append(link('keep it secret', () => answer('skip')));
    setTimeout(() => input.focus(), 60);
  } else if (view === 'done' || view === 'intro') {
    dom.btns.append(button(view === 'intro' ? 'i have something' : 'play again', '↵', 'go', () => begin()));
  }
}

// The engine speaks in terminal lines. Read them back into the screen.
const sink = {
  print(line) {
    if (!alive) return;
    const text = String(line);
    if (text.startsWith('20q:') || text.startsWith('(')) return;
    const q = text.match(/^q(\d+): (.*)$/);
    if (q) { view = 'ask'; setQuestion(q[2], 'ask'); dom.count.replaceChildren(el('b', '', `question ${q[1]}`), ' of 20'); dom.note.textContent = ''; return; }
    if (text.startsWith('is it ') && state.phase === 'guess') {
      view = 'guess';
      setQuestion(text, 'guess');
      dom.count.replaceChildren(el('b', '', 'a guess'));
      dom.note.textContent = '';
      sfx.play('bonus');
      return;
    }
    dom.note.textContent = text;
  },
};

async function run(input) {
  if (!state || state.busy) return;
  dom.card.classList.add('busy');
  for (const b of dom.btns.querySelectorAll('button')) b.disabled = true;
  const mine = state;
  let finished = false;
  try { finished = await tq.step(mine, input, sink); } catch { finished = true; }
  if (!alive || state !== mine) return;
  dom.card.classList.remove('busy');
  if (view === 'ask' || input === 'undo') answers.length = Math.min(answers.length, mine.n);
  if (finished) return end(input);
  if (state.phase === 'learn') {
    view = 'learn';
    setQuestion('you win this one.', 'lost');
    dom.count.replaceChildren(el('b', '', 'stumped'));
    dom.note.textContent = 'tell it what you were thinking of';
    sfx.play('over');
  }
  paintPips();
  controlsFor();
}

function answer(value) {
  if (!state || state.busy) return;
  if (view === 'ask') {
    if (value !== 'undo') { answers.push(value); sfx.play(value === 'yes' ? 'eat' : value === 'no' ? 'wall' : 'tick'); }
  }
  run(value);
}

function end(lastInput) {
  const won = view === 'guess' && lastInput === 'yes';
  const n = answers.length;
  view = 'done';
  if (won) {
    const wins = scores.get('20q-wins') + 1;
    scores.set('20q-wins', wins);
    const best = scores.get('20q-best');
    if (!best || n < best) scores.set('20q-best', n);
    setQuestion(`got it in ${n}.`, 'won');
    dom.count.replaceChildren(el('b', '', 'solved'));
    dom.note.textContent = n <= 8 ? 'that was quick.' : n <= 15 ? 'a fair fight.' : 'you made it work for that.';
    sfx.play('win');
    api.toast('got it');
  } else {
    setQuestion(dom.note.textContent || 'well played.', 'lost');
    dom.count.replaceChildren(el('b', '', 'you win'));
    dom.note.textContent = 'you stumped it.';
  }
  hud();
  paintPips();
  controlsFor();
}

function hud() {
  api.stat('it won', scores.get('20q-wins'));
  const best = scores.get('20q-best');
  api.stat('fastest', best ? best + ' q' : '-');
}

async function begin() {
  if (state) state.stopped = true;
  answers = [];
  state = tq.init();
  const mine = state;
  view = 'ask';
  dom.card.classList.remove('guess', 'won', 'lost');
  dom.card.classList.add('busy');
  dom.count.textContent = '';
  dom.note.textContent = '';
  dom.btns.replaceChildren();
  dom.small.replaceChildren();
  paintPips();
  try { await tq.start(mine, sink); } catch {}
  if (!alive || state !== mine) return;
  dom.card.classList.remove('busy');
  paintPips();
  controlsFor();
}

export default {
  key: 'twenty-questions',
  title: '20 questions',
  ui: 'panel',
  async mount(elm, ctx) {
    addStyle('tw-style', CSS);
    alive = true;
    sfx = createSfx();
    api = stage(elm, ctx, {
      title: '20 questions', dom: true,
      help: [['y', 'yes'], ['n', 'no'], ['m', 'maybe'], ['i', "don't know"], ['u', 'undo'], ['esc', 'leave']],
    });
    api.button('sound', sfx.muted ? 'sound off' : 'sound on', () => { const m = sfx.toggle(); api.buttons.sound.textContent = m ? 'sound off' : 'sound on'; });
    api.button('exit', 'exit', () => ctx.close());
    dom = build(ctx);
    view = 'intro';
    setQuestion('think of something. anything at all.', 'ask');
    dom.count.replaceChildren(el('b', '', '20 questions'));
    dom.note.textContent = "keep it to yourself. i'll work it out.";
    hud();
    paintPips();
    controlsFor();
    off = rawKeys(ctx, (e) => {
      const k = e.key.toLowerCase();
      if (view === 'intro' || view === 'done') { if (k === 'enter' || k === ' ') { begin(); return; } return false; }
      if (view === 'ask') {
        if (k === 'y') return answer('yes');
        if (k === 'n') return answer('no');
        if (k === 'm') return answer('maybe');
        if (k === 'i' || k === '?') return answer('idk');
        if (k === 'u' || k === 'backspace') { if (answers.length) answer('undo'); return; }
      } else if (view === 'guess') {
        if (k === 'y') return answer('yes');
        if (k === 'n') return answer('no');
      }
      return false;
    });
  },
  unmount() {
    alive = false;
    if (state) state.stopped = true;
    if (off) off();
    if (sfx) sfx.close();
    if (api) api.destroy();
    api = sfx = off = state = dom = null;
    answers = [];
  },
};
