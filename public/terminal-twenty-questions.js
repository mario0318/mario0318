// terminal-twenty-questions.js — the terminal asks, you think of something.
// Local only: an entity/attribute table, weighted elimination, and a best-split
// question picker. No model, no network. Learned entries live for this tab only.
//
// Contract with terminal-games.js:
//   init()              -> state object
//   start(state, ctx)   -> async, prints intro and the first question
//   step(state, raw, ctx) -> async, true when the round is finished
//
// Sources, tried in order and never mentioned to the player: the site guesser,
// Wikidata, then the local table below. Any failure just moves to the next.
//
// Output only via ctx.print(text).

import { askGuesser, wikiInit, wikiNext, wikiAnswer, wikiGuessWrong } from './terminal-twenty-questions-remote.js';

const QUESTIONS = {
  living: 'is it alive, or was it ever alive?',
  animal: 'is it an animal?',
  mammal: 'is it a mammal?',
  plant: 'is it a plant, or part of one?',
  fur: 'does it have fur or feathers?',
  pet: 'is it commonly kept as a pet?',
  legs: 'does it have legs?',
  water: 'does it live in, on, or travel across water?',
  sky: 'is it found in the sky, or does it fly?',
  space: 'is it found in outer space?',
  edible: 'can you eat or drink it?',
  sweet: 'is it sweet?',
  kitchen: 'would you find it in a kitchen?',
  made: 'was it made by people?',
  big: 'is it bigger than a person?',
  hand: 'could you hold it in one hand?',
  home: 'would you normally find it inside a house?',
  outdoors: 'is it usually found outdoors?',
  electric: 'does it use electricity or a battery?',
  screen: 'does it have a screen?',
  sound: 'does it make sound or music?',
  wheels: 'does it have wheels?',
  vehicle: 'do people travel in or on it?',
  metal: 'is it mostly metal?',
  soft: 'is it soft to the touch?',
  pricey: 'would it cost more than a hundred dollars?',
  daily: 'do most people use or see it every day?',
  danger: 'can it hurt you?',
  sharp: 'is it sharp?',
  round: 'is it round, or close to it?',
  fragile: 'does it break easily?',
  wear: 'do you wear it?',
  sport: 'is it used in games or sports?',
  read: 'is it used for reading, writing, or learning?',
  place: 'is it a place?',
  hot: 'is it hot, or does it give off heat?',
  cold: 'is it cold?',
};

// name: attributes. a bare attribute means yes, ~attribute means sometimes,
// anything unlisted means no. a leading * means no article ("is it water?").
const TABLE = `
dog: living animal mammal fur pet legs home ~outdoors ~danger sound
cat: living animal mammal fur pet legs home ~outdoors
horse: living animal mammal fur legs big outdoors ~pet pricey ~sport
cow: living animal mammal fur legs big outdoors ~edible
pig: living animal mammal legs outdoors ~big ~edible ~pet
sheep: living animal mammal fur legs outdoors ~big soft
elephant: living animal mammal legs big outdoors ~danger
lion: living animal mammal fur legs big outdoors danger
tiger: living animal mammal fur legs big outdoors danger
bear: living animal mammal fur legs big outdoors danger
wolf: living animal mammal fur legs outdoors danger
monkey: living animal mammal fur legs outdoors ~pet ~sound
rabbit: living animal mammal fur pet legs hand ~home outdoors soft
mouse: living animal mammal fur legs hand ~home ~pet
squirrel: living animal mammal fur legs hand outdoors
bat: living animal mammal fur sky legs hand outdoors
giraffe: living animal mammal fur legs big outdoors
kangaroo: living animal mammal fur legs ~big outdoors
whale: living animal mammal water big
dolphin: living animal mammal water ~big sound
bird: living animal fur sky legs hand outdoors ~sound ~pet
eagle: living animal fur sky legs outdoors danger ~big
owl: living animal fur sky legs outdoors
penguin: living animal fur legs water outdoors cold
chicken: living animal fur legs outdoors edible ~pet
duck: living animal fur water sky legs outdoors ~edible
parrot: living animal fur sky legs hand pet sound ~home
fish: living animal water edible ~hand ~pet
goldfish: living animal water pet hand home
shark: living animal water big danger
octopus: living animal water ~legs ~danger ~edible
crab: living animal water legs hand ~edible ~danger
snake: living animal outdoors danger
frog: living animal ~water legs hand outdoors ~sound ~pet
turtle: living animal ~water legs ~hand outdoors ~pet
lizard: living animal legs hand outdoors ~pet
spider: living animal legs hand ~home outdoors ~danger
bee: living animal sky legs hand outdoors ~danger sound
butterfly: living animal sky legs hand outdoors
ant: living animal legs hand outdoors
dinosaur: living animal legs big danger outdoors
tree: living plant big outdoors
flower: living plant hand outdoors ~home soft
grass: living plant outdoors soft
cactus: living plant outdoors ~hand ~danger ~home
apple: living plant edible sweet hand round ~kitchen
banana: living plant edible sweet hand ~kitchen
orange: living plant edible sweet hand round
*grapes: living plant edible sweet hand round
strawberry: living plant edible sweet hand
watermelon: living plant edible sweet round ~hand
carrot: living plant edible hand kitchen
potato: living plant edible hand round kitchen
tomato: living plant edible hand round kitchen
*corn: living plant edible hand kitchen ~sweet
lemon: living plant edible hand round
*rice: living plant edible kitchen home daily
*bread: edible made kitchen home soft daily
*cheese: edible made kitchen home ~soft ~cold
pizza: edible made kitchen home round ~hot ~daily
*ice cream: edible sweet made cold ~hand
*chocolate: edible sweet made hand
cake: edible sweet made kitchen soft ~round
cookie: edible sweet made kitchen hand round
*coffee: edible made hot kitchen home daily
*milk: edible made kitchen home cold daily
*water: edible home kitchen daily ~outdoors ~cold
egg: ~living edible round hand kitchen home fragile
*soup: edible made hot kitchen home
hamburger: edible made hot hand ~kitchen
sandwich: edible made hand kitchen home
*popcorn: edible made hand
candy: edible sweet made hand
*honey: edible sweet kitchen home
*pasta: edible made kitchen home ~hot
chair: made home legs daily
table: made home legs daily ~big
bed: made home soft daily ~big
couch: made home soft daily ~big ~legs
lamp: made home electric daily ~hand
television: made home electric screen sound pricey daily ~big
phone: made hand electric screen sound daily pricey ~fragile
computer: made home electric screen pricey daily ~metal
laptop: made home electric screen pricey daily ~metal
tablet: made hand electric screen pricey ~daily fragile
clock: made home ~hand ~electric daily round ~metal
watch: made hand wear daily ~electric ~metal ~pricey round
key: made hand metal daily home ~sharp
book: made hand home read ~daily
pen: made hand read ~daily
pencil: made hand read ~sharp ~daily
notebook: made hand home read
*scissors: made hand metal sharp home ~danger
knife: made hand metal sharp kitchen home danger
fork: made hand metal kitchen home daily ~sharp
spoon: made hand metal kitchen home daily
plate: made hand kitchen home fragile round daily
cup: made hand kitchen home fragile round daily
bottle: made hand kitchen home ~fragile daily
umbrella: made hand outdoors ~daily
toothbrush: made hand home daily soft
soap: made hand home daily
mirror: made home fragile ~hand
window: made home fragile ~big
door: made home daily ~big
hammer: made hand metal ~home ~danger
ball: made hand round sport outdoors ~soft
bicycle: made vehicle wheels outdoors metal ~sport ~pricey ~daily
guitar: made sound home pricey
piano: made sound home big pricey
drum: made sound ~home
violin: made sound ~pricey
*headphones: made hand electric sound wear daily
camera: made hand electric ~screen pricey
*glasses: made hand wear daily fragile
hat: made wear soft hand ~daily
*shoes: made wear daily soft
shirt: made wear soft daily
jacket: made wear soft ~daily
backpack: made wear soft ~daily
wallet: made hand soft daily
*money: made hand daily ~metal
teddy bear: made hand soft home
balloon: made hand round fragile ~sky
candle: made hand home hot ~fragile
light bulb: made home electric hand fragile round daily ~hot
battery: made hand electric metal daily
remote control: made hand electric home daily
microwave: made home kitchen electric hot daily
refrigerator: made home kitchen electric cold ~big daily
washing machine: made home electric ~big daily
video game: made home electric screen sound sport ~daily
robot: made electric metal ~screen sound ~big ~legs
satellite: made electric space sky metal pricey
*fire: hot danger ~outdoors ~home
*ice: cold hand ~outdoors fragile
*snow: cold outdoors soft
*rain: sky outdoors ~cold
rainbow: sky outdoors
cloud: sky outdoors soft big
sun: sky space hot round big outdoors
moon: sky space round big outdoors
star: sky space hot round big outdoors
earth: space round big place ~living ~outdoors
mountain: big outdoors place
ocean: water big outdoors place
river: water outdoors place big
beach: water outdoors place
volcano: big outdoors hot danger place
desert: outdoors hot place big
forest: living plant big outdoors place
rock: outdoors hand ~big
*sand: outdoors soft ~hot
*lightning: sky outdoors danger hot
car: made vehicle wheels big metal pricey daily outdoors
bus: made vehicle wheels big metal outdoors daily
train: made vehicle wheels big metal outdoors
airplane: made vehicle sky big metal pricey outdoors
helicopter: made vehicle sky big metal pricey outdoors
boat: made vehicle water ~big outdoors
ship: made vehicle water big metal pricey outdoors
rocket: made vehicle sky space big metal pricey danger outdoors
motorcycle: made vehicle wheels metal pricey outdoors ~danger
skateboard: made vehicle wheels sport outdoors
house: made home big place daily pricey
school: made big place read daily
hospital: made big place
castle: made big place pricey
bridge: made big outdoors ~metal
library: made big place read
park: outdoors place big ~plant
kitchen: made home place kitchen daily
bathroom: made home place daily
pyramid: made big outdoors place
statue: made outdoors ~big ~metal
eiffel tower: made big outdoors metal place
`;

function parseTable(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const at = line.indexOf(': ');
    if (at < 0) continue;
    let name = line.slice(0, at).trim();
    const bare = name.startsWith('*');
    if (bare) name = name.slice(1);
    const v = {};
    for (const token of line.slice(at + 2).trim().split(/\s+/)) {
      if (!token) continue;
      if (token.startsWith('~')) v[token.slice(1)] = 0.5;
      else v[token] = 1;
    }
    out.push({ name, bare, v });
  }
  return out;
}

const KB = parseTable(TABLE);
const learned = [];

export const _internals = { QUESTIONS, KB };

const YES = new Set(['y', 'yes', 'yeah', 'yep', 'yup', 'ya', 'true', 'correct', 'sure', 'right', 'ye']);
const NO = new Set(['n', 'no', 'nope', 'nah', 'false', 'wrong', 'never']);
const MAYBE = new Set(['maybe', 'sometimes', 'kinda', 'kind of', 'sort of', 'depends', 'partly', 'm', 'somewhat']);
const SKIP = new Set(['idk', 'dunno', 'unsure', 'skip', 'unknown', '?', 'not sure', "don't know", 'dont know', 'pass', 'i dont know', "i don't know"]);

function parseAnswer(t) {
  if (YES.has(t)) return 'yes';
  if (NO.has(t)) return 'no';
  if (MAYBE.has(t)) return 'maybe';
  if (SKIP.has(t)) return 'idk';
  return null;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function label(item) {
  if (item.bare) return item.name;
  return (/^[aeiou]/i.test(item.name) ? 'an ' : 'a ') + item.name;
}

export function init() {
  const items = [...KB, ...learned].map((e) => ({ ...e }));
  return {
    items,
    w: items.map(() => 1),
    asked: new Set(),
    rejected: new Set(),
    log: [],
    n: 0,
    wrong: 0,
    phase: 'ask',
    key: null,
    guess: -1,
    mode: null,
    hist: [],
    wk: null,
    pending: '',
    guessText: '',
    busy: false,
    stopped: false,
  };
}

export async function start(s, ctx) {
  ctx.print('20q: think of something. anything at all. keep it to yourself.');
  ctx.print('20q: answer yes, no, maybe, or idk. `undo` steps back. `exit` leaves.');
  await turn(s, ctx);
}

function present(s, ctx, kind, text) {
  if (kind === 'guess') {
    s.phase = 'guess';
    s.guessText = text;
    ctx.print(`is it ${text}?`);
  } else {
    s.phase = 'ask';
    s.pending = text;
    ctx.print(`q${s.n + 1}: ${/[?]$/.test(text) ? text : text + "?"}`);
  }
  return false;
}

// One move from whichever source is up, falling through without comment.
async function turn(s, ctx) {
  s.busy = true;
  try {
    if (s.mode === null || s.mode === 'guesser') {
      const r = await askGuesser(s.hist, s.n >= 20);
      if (s.stopped) return false;
      if (r) { s.mode = 'guesser'; return present(s, ctx, r.type, r.text); }
      s.mode = 'wiki';
      s.wk = wikiInit();
    }
    if (s.mode === 'wiki') {
      const r = await wikiNext(s.wk, 20 - s.n);
      if (s.stopped) return false;
      if (r) return r.kind === 'giveup' ? giveUp(s, ctx) : present(s, ctx, r.kind, r.text);
      s.mode = 'local';
    }
    return ask(s, ctx);
  } finally {
    s.busy = false;
  }
}

async function stepRemote(s, raw, ctx) {
  const t = raw.trim().toLowerCase();
  if (s.phase === 'learn') {
    ctx.print(!t || t === 'skip' ? 'fine. keep your secrets.' : pick(['noted. good one.', 'huh. fair enough.', 'okay. that is a good one.']));
    return true;
  }
  if (t === 'undo' || t === 'back') {
    if (s.mode !== 'guesser' || !s.hist.length) { ctx.print('nothing to undo.'); return false; }
    s.hist.pop();
    s.n = s.hist.filter((h) => h.kind === 'q').length;
    s.wrong = s.hist.filter((h) => h.kind === 'guess').length;
    return turn(s, ctx);
  }
  const ans = parseAnswer(t);
  if (!ans) { ctx.print('yes, no, maybe, or idk. `exit` leaves.'); return false; }

  if (s.phase === 'guess') {
    if (ans === 'yes') {
      const n = s.n;
      ctx.print(n <= 10
        ? pick([`got it in ${n}. you were easy to read.`, `${n} questions. not close to 20.`, `solved in ${n}. clean.`])
        : pick([`took ${n}, but it landed.`, `${n} questions. you made me work.`]));
      return true;
    }
    if (ans !== 'no') { ctx.print('yes or no.'); return false; }
    if (s.mode === 'guesser') s.hist.push({ kind: 'guess', text: s.guessText, answer: 'no' });
    else wikiGuessWrong(s.wk);
    s.wrong++;
    if (s.wrong >= (s.mode === 'guesser' ? 3 : 9) || s.n >= 20) return giveUp(s, ctx);
    ctx.print(pick(['hm. not that.', 'noted. not that.', 'wrong. recalculating.']));
    return turn(s, ctx);
  }

  if (s.mode === 'guesser') s.hist.push({ kind: 'q', text: s.pending, answer: ans });
  else wikiAnswer(s.wk, ans);
  s.n++;
  return turn(s, ctx);
}

function leader(s) {
  let total = 0;
  let best = -1;
  for (let i = 0; i < s.w.length; i++) {
    total += s.w[i];
    if (best < 0 || s.w[i] > s.w[best]) best = i;
  }
  if (total <= 0 || best < 0 || s.w[best] <= 0) return { i: -1, p: 0, total: 0 };
  return { i: best, p: s.w[best] / total, total };
}

function shouldGuess(s, top) {
  if (top.i < 0) return false;
  if (s.n >= 20) return true;
  if (s.n >= 5 && top.p >= 0.6) return true;
  if (s.n >= 8 && top.p >= 0.4) return true;
  if (s.n >= 12 && top.p >= 0.25) return true;
  return false;
}

function pickQuestion(s, total) {
  const scored = [];
  for (const key of Object.keys(QUESTIONS)) {
    if (s.asked.has(key)) continue;
    let yes = 0;
    for (let i = 0; i < s.items.length; i++) {
      if (s.w[i] > 0) yes += s.w[i] * (s.items[i].v[key] || 0);
    }
    const p = yes / total;
    if (p < 0.03 || p > 0.97) continue;
    scored.push({ key, score: Math.abs(p - 0.5) });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => a.score - b.score);
  const near = scored.filter((x) => x.score <= scored[0].score + 0.06).slice(0, 3);
  return pick(near).key;
}

function ask(s, ctx) {
  const top = leader(s);
  if (top.i < 0) return giveUp(s, ctx);
  if (shouldGuess(s, top)) return makeGuess(s, ctx, top.i);
  const key = pickQuestion(s, top.total);
  if (!key) return makeGuess(s, ctx, top.i);
  s.key = key;
  s.phase = 'ask';
  ctx.print(`q${s.n + 1}: ${QUESTIONS[key]}`);
  return false;
}

function makeGuess(s, ctx, i) {
  s.guess = i;
  s.phase = 'guess';
  ctx.print(`is it ${label(s.items[i])}?`);
  return false;
}

function giveUp(s, ctx) {
  s.phase = 'learn';
  ctx.print(pick(['you win. what was it?', 'nothing left on the table. what were you thinking of?', 'out of guesses. what was it?']));
  ctx.print('(type the answer, or `skip`)');
  return false;
}

function applyAnswer(s, key, ans) {
  for (let i = 0; i < s.items.length; i++) {
    const v = s.items[i].v[key] || 0;
    let f = 1;
    if (ans === 'yes') f = v === 1 ? 1 : v === 0.5 ? 0.5 : 0.06;
    else if (ans === 'no') f = v === 0 ? 1 : v === 0.5 ? 0.5 : 0.06;
    else if (ans === 'maybe') f = v === 0.5 ? 1 : 0.6;
    s.w[i] *= f;
  }
}

function learn(s, raw, ctx) {
  const name = raw.trim().slice(0, 40);
  const t = name.toLowerCase();
  if (!name || t === 'skip' || t === 'idk') {
    ctx.print('fine. keep your secrets.');
    return true;
  }
  if (s.items.some((e) => e.name.toLowerCase() === t)) {
    ctx.print('i had that one on the table. the answers pulled me off it.');
    return true;
  }
  const v = {};
  for (const entry of s.log) {
    if (entry.ans === 'yes') v[entry.key] = 1;
    else if (entry.ans === 'maybe') v[entry.key] = 0.5;
  }
  if (learned.length < 50) learned.push({ name, bare: false, v });
  ctx.print(`noted. ${name} stays on the table until this tab closes.`);
  return true;
}

export async function step(s, raw, ctx) {
  if (s.stopped) return true;
  if (s.busy) { ctx.print('one sec.'); return false; }
  if (s.mode === 'local') return stepLocal(s, raw, ctx);
  return stepRemote(s, raw, ctx);
}

function stepLocal(s, raw, ctx) {
  const t = raw.trim().toLowerCase();
  if (s.phase === 'learn') return learn(s, raw, ctx);

  if (t === 'undo' || t === 'back') {
    const last = s.log.pop();
    if (!last) { ctx.print('nothing to undo.'); return false; }
    s.w = last.w.slice();
    for (const i of s.rejected) s.w[i] = 0;
    s.asked.delete(last.key);
    s.n--;
    s.wrong = s.rejected.size;
    return ask(s, ctx);
  }

  const ans = parseAnswer(t);
  if (!ans) { ctx.print('yes, no, maybe, or idk. `exit` leaves.'); return false; }

  if (s.phase === 'guess') {
    if (ans === 'yes') {
      const n = s.n;
      ctx.print(n <= 10
        ? pick([`got it in ${n}. you were easy to read.`, `${n} questions. not close to 20.`, `solved in ${n}. the table was kind.`])
        : pick([`took ${n}, but it landed.`, `${n} questions. you made me work.`]));
      return true;
    }
    if (ans === 'no') {
      s.w[s.guess] = 0;
      s.rejected.add(s.guess);
      s.wrong++;
      if (s.wrong >= 3 || s.n >= 20) return giveUp(s, ctx);
      ctx.print(pick(['hm. not that.', 'noted. not that.', 'wrong. recalculating.']));
      return ask(s, ctx);
    }
    ctx.print('yes or no.');
    return false;
  }

  s.log.push({ key: s.key, ans, w: s.w.slice() });
  applyAnswer(s, s.key, ans);
  s.asked.add(s.key);
  s.n++;
  return ask(s, ctx);
}
