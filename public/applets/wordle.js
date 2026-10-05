// wordle.js — six tries at a five-letter word, with flipping tiles and a live keyboard.

import { stage, createSfx, scores, rawKeys, addStyle, pick } from './game-kit.js';

const ANSWERS = ('about above actor acute admit adopt adult after again agent agree ahead alarm album alert alike alive allow alone along alter among anger angle angry apart apple apply arena argue arise armor array aside asset audio avoid award aware awful bacon badge baker basic beach beard beast begin being below bench birth black blade blame blank blast blaze blend bless blind block blood bloom board boost bound brain brand brave bread break breed brick bride brief bring broad brown brush build bunch burst buyer cabin cable candy cargo carry catch cause chain chair chalk charm chart chase cheap check cheek chess chest chief child chill choir civic claim class clean clear clerk click cliff climb clock close cloth cloud coach coast color comet coral couch could count court cover crack craft crane crash crazy cream crime crisp cross crowd crown curve cycle daily dance dealt death debut delay depth diary dirty doubt dozen draft drain drama dream dress drift drink drive eager early earth eight elbow elder elite empty enemy enjoy enter entry equal error event every exact exist extra faint faith false fancy fault feast fence fever field fifty fight final flame flash fleet float flood floor flour fluid focus force forge forth forty forum found frame fresh front frost fruit funny ghost giant given glass globe glory glove grace grade grain grand grant grape graph grasp grass great green greet grief grill grind group guard guess guest guide habit happy harsh heart heavy hello honey honor horse hotel house human humor ideal image index inner input irony issue ivory jelly jewel joint judge juice knife knock known label labor large laser later laugh layer learn least leave legal lemon level light limit linen liver local logic loose lower loyal lucky lunch magic major maker march match maybe mayor medal media mercy merge metal meter might minor mixed model money month moral motor mount mouse mouth movie music naive nerve never night noble noise north novel nurse ocean offer often olive onion orbit order other ought outer owner paint panel paper party pasta patch pause peace pearl phase phone photo piano piece pilot pitch pixel pizza place plain plane plant plate point polar pound power press price pride prime print prize proof proud pulse punch pupil queen query quest quick quiet quite quote radar radio raise range rapid ratio reach react ready realm rebel refer reign relax reply rider ridge right rival river robot rough round route royal rural salad sauce scale scene scope score scout screw sense serve seven shade shake shape share sharp sheep sheet shelf shell shift shine shirt shock shore short shown sight signal silly since skill sleep slice slide slope small smart smile smoke snake solar solid solve sorry sound south space spare spark speak speed spell spend spice spine split spoon sport spray squad stack staff stage stain stair stake stamp stand stare start state steam steel steep stick still stock stone store storm story stove strap straw study stuff style sugar suite sunny super sweet swift swing table taste teach teeth thank theme there thick thing think third three throw thumb tiger tight timer title toast today token topic total touch tough tower trace track trade trail train treat trend trial tribe trick truck truly trust truth twice uncle under union unite unity until upper upset urban usage usual vague valid value vapor vault video vinyl virus visit vital vivid vocal voice voter wagon waste watch water weave wheel where which while white whole woman world worry worth would wound write wrong yield young youth zebra').split(' ').filter((w) => w.length === 5);

const CSS = `
.wd{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(.6rem,2.2vh,1.2rem);width:100%;height:100%;padding:.6rem;box-sizing:border-box}
.wd-grid{display:grid;grid-template-rows:repeat(6,1fr);gap:.32rem;height:min(52vh,360px);aspect-ratio:5/6}
.wd-row{display:grid;grid-template-columns:repeat(5,1fr);gap:.32rem}
.wd-row.shake{animation:wd-shake .4s}
.wd-tile{display:flex;align-items:center;justify-content:center;border:1.5px solid var(--rule);border-radius:6px;background:rgba(10,11,13,.6);
  font-size:clamp(16px,3.6vh,28px);font-weight:700;text-transform:uppercase;color:var(--text);transition:transform .25s,background .25s,border-color .25s}
.wd-tile.filled{border-color:var(--text-dim);animation:wd-pop .1s}
.wd-tile.flip{transform:rotateX(90deg)}
.wd-tile.c{background:var(--dot-3);border-color:var(--dot-3);color:#06100f;box-shadow:0 0 18px color-mix(in srgb,var(--dot-3) 45%,transparent)}
.wd-tile.p{background:var(--dot-2);border-color:var(--dot-2);color:#1c1300;box-shadow:0 0 14px color-mix(in srgb,var(--dot-2) 35%,transparent)}
.wd-tile.a{background:var(--surface-hi);border-color:var(--surface-hi);color:var(--text-dim)}
.wd-tile.win{animation:wd-bounce .5s}
@keyframes wd-pop{from{transform:scale(1.12)}to{transform:none}}
@keyframes wd-shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
@keyframes wd-bounce{40%{transform:translateY(-14px)}70%{transform:translateY(3px)}}
.wd-msg{min-height:1.4em;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim)}
.wd-msg b{color:var(--dot-2);font-weight:600}
.wd-keys{display:flex;flex-direction:column;gap:.3rem;width:min(100%,520px)}
.wd-kr{display:flex;gap:.26rem;justify-content:center}
.wd-key{flex:1;min-width:0;max-width:46px;height:clamp(34px,5.6vh,48px);border:1px solid var(--rule);border-radius:6px;background:rgba(24,27,34,.75);
  color:var(--text);font:inherit;font-size:13px;font-weight:600;text-transform:uppercase;cursor:pointer;transition:background .2s,border-color .2s}
.wd-key:hover{border-color:var(--text-dim)}
.wd-key.big{max-width:74px;flex:1.6;font-size:10px;letter-spacing:.1em}
.wd-key.c{background:var(--dot-3);border-color:var(--dot-3);color:#06100f}
.wd-key.p{background:var(--dot-2);border-color:var(--dot-2);color:#1c1300}
.wd-key.a{background:transparent;color:var(--text-ghost)}
@media (prefers-reduced-motion:reduce){.wd-tile,.wd-row.shake,.wd-tile.win{animation:none;transition:none}}
`;

let api, sfx, off, s, dom;
let timers = [];
const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

function fresh(keep) {
  return {
    answer: pick(ANSWERS), rows: [], cur: '', done: null, busy: false,
    keys: {}, streak: keep ? keep.streak : scores.get('wordle-streak-now'),
    best: scores.get('wordle-streak'), wins: scores.get('wordle-wins'),
  };
}

function score(guess, answer) {
  const res = Array(5).fill('a');
  const pool = answer.split('');
  for (let i = 0; i < 5; i++) if (guess[i] === answer[i]) { res[i] = 'c'; pool[i] = null; }
  for (let i = 0; i < 5; i++) {
    if (res[i] === 'c') continue;
    const j = pool.indexOf(guess[i]);
    if (j !== -1) { res[i] = 'p'; pool[j] = null; }
  }
  return res;
}

function build() {
  const wrap = document.createElement('div'); wrap.className = 'wd';
  const grid = document.createElement('div'); grid.className = 'wd-grid';
  grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', 'guesses');
  const tiles = [];
  const rowEls = [];
  for (let r = 0; r < 6; r++) {
    const row = document.createElement('div'); row.className = 'wd-row';
    const line = [];
    for (let c = 0; c < 5; c++) { const t = document.createElement('div'); t.className = 'wd-tile'; row.appendChild(t); line.push(t); }
    grid.appendChild(row); tiles.push(line); rowEls.push(row);
  }
  const msg = document.createElement('div'); msg.className = 'wd-msg';
  const keys = document.createElement('div'); keys.className = 'wd-keys';
  const keyEls = {};
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  rows.forEach((letters, ri) => {
    const kr = document.createElement('div'); kr.className = 'wd-kr';
    const add = (label, fn, big) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'wd-key' + (big ? ' big' : ''); b.textContent = label;
      b.addEventListener('click', () => { fn(); b.blur(); });
      kr.appendChild(b);
      return b;
    };
    if (ri === 2) add('enter', submit, true);
    for (const ch of letters) keyEls[ch] = add(ch, () => type(ch));
    if (ri === 2) add('del', erase, true);
    keys.appendChild(kr);
  });
  wrap.append(grid, msg, keys);
  api.main.appendChild(wrap);
  return { tiles, rowEls, msg, keyEls };
}

function say(text, strong) {
  dom.msg.replaceChildren();
  if (strong) dom.msg.append(Object.assign(document.createElement('b'), { textContent: strong }), ' ');
  dom.msg.append(text);
  api.announce((strong ? strong + ' ' : '') + text);
}

function paintCurrent() {
  const r = s.rows.length;
  if (r > 5) return;
  for (let c = 0; c < 5; c++) {
    const t = dom.tiles[r][c];
    const ch = s.cur[c] || '';
    if (t.textContent !== ch) { t.textContent = ch; t.className = 'wd-tile' + (ch ? ' filled' : ''); }
  }
}

function hud() {
  api.stat('streak', s.streak, s.streak > 0);
  api.stat('best', Math.max(s.best, s.streak));
  api.stat('solved', s.wins);
}

function type(ch) {
  if (s.done || s.busy || s.cur.length >= 5) return;
  s.cur += ch;
  sfx.play('tick');
  paintCurrent();
}

function erase() {
  if (s.done || s.busy || !s.cur) return;
  s.cur = s.cur.slice(0, -1);
  paintCurrent();
}

function submit() {
  if (s.done) { reset(); return; }
  if (s.busy) return;
  const r = s.rows.length;
  if (s.cur.length < 5) {
    dom.rowEls[r].classList.remove('shake');
    void dom.rowEls[r].offsetWidth;
    dom.rowEls[r].classList.add('shake');
    sfx.play('miss');
    say('five letters.', '');
    return;
  }
  const guess = s.cur;
  const res = score(guess, s.answer);
  s.rows.push({ guess, res });
  s.cur = '';
  s.busy = true;
  res.forEach((cls, i) => {
    const t = dom.tiles[r][i];
    later(() => { t.classList.add('flip'); sfx.play('flip'); }, i * 260);
    later(() => { t.classList.remove('flip'); t.classList.add(cls); }, i * 260 + 250);
  });
  later(() => {
    for (let i = 0; i < 5; i++) {
      const ch = guess[i];
      const rank = { a: 1, p: 2, c: 3 };
      if (!s.keys[ch] || rank[res[i]] > rank[s.keys[ch]]) s.keys[ch] = res[i];
      dom.keyEls[ch].className = 'wd-key ' + s.keys[ch];
    }
    s.busy = false;
    if (guess === s.answer) {
      s.done = 'won';
      s.streak++; s.wins++;
      scores.set('wordle-wins', s.wins);
      scores.set('wordle-streak-now', s.streak);
      if (s.streak > s.best) { s.best = s.streak; scores.set('wordle-streak', s.streak); }
      dom.tiles[r].forEach((t, i) => later(() => t.classList.add('win'), i * 90));
      sfx.play('win');
      say('enter for another.', ['genius.', 'magnificent.', 'impressive.', 'splendid.', 'great.', 'phew.'][r]);
      api.toast(`solved in ${r + 1}`);
    } else if (s.rows.length >= 6) {
      s.done = 'lost';
      s.streak = 0;
      scores.set('wordle-streak-now', 0);
      sfx.play('over');
      say('enter for another.', `it was ${s.answer}.`);
    } else {
      say(`${6 - s.rows.length} left.`, '');
    }
    hud();
  }, 5 * 260 + 300);
}

function reset() {
  timers.forEach(clearTimeout); timers = [];
  s = fresh(s);
  for (const row of dom.tiles) for (const t of row) { t.textContent = ''; t.className = 'wd-tile'; }
  for (const b of Object.values(dom.keyEls)) b.className = 'wd-key';
  say('guess the word.', '');
  hud();
}

export default {
  key: 'wordle',
  title: 'wordle',
  ui: 'panel',
  async mount(el, ctx) {
    addStyle('wd-style', CSS);
    sfx = createSfx();
    api = stage(el, ctx, {
      title: 'wordle', dom: true,
      help: [['a-z', 'type'], ['enter', 'guess'], ['backspace', 'delete'], ['esc', 'leave']],
    });
    api.button('sound', sfx.muted ? 'sound off' : 'sound on', () => { const m = sfx.toggle(); api.buttons.sound.textContent = m ? 'sound off' : 'sound on'; });
    api.button('new', 'new word', () => reset());
    api.button('exit', 'exit', () => ctx.close());
    dom = build();
    s = fresh();
    say('guess the word.', '');
    hud();
    off = rawKeys(ctx, (e) => {
      if (e.key === 'Enter') { submit(); return; }
      if (e.key === 'Backspace') { erase(); return; }
      const k = e.key.toLowerCase();
      if (k.length === 1 && k >= 'a' && k <= 'z') { type(k); return; }
      return false;
    });
  },
  unmount() {
    timers.forEach(clearTimeout); timers = [];
    if (off) off();
    if (sfx) sfx.close();
    if (api) api.destroy();
    api = sfx = off = s = dom = null;
  },
};
