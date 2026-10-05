// terminal-twenty-questions-remote.js — where 20q looks things up.
// Two sources, both quiet on failure (every function resolves to null instead
// of throwing, so the caller can drop to the next source without a trace):
//   1. the site's own guesser endpoint
//   2. Wikidata, walked as a category tree and then ranked by popularity
// The local table in terminal-twenty-questions.js is the last resort.

const FETCH_MS = 3000;
const GUESSER_MS = 3600;

export async function askGuesser(history, final) {
  try {
    const r = await fetch('/api/20q', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ history, final: !!final }),
      signal: AbortSignal.timeout(GUESSER_MS),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if ((d.type !== 'question' && d.type !== 'guess') || typeof d.text !== 'string' || !d.text.trim()) return null;
    return { type: d.type, text: d.text.trim().slice(0, 140) };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ wikidata

const API = 'https://www.wikidata.org/w/api.php';
const cache = new Map();

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!r.ok) throw new Error('lookup');
  return r.json();
}

// Ranked by how widely an item is linked, which is a decent stand-in for how
// well known it is. Returns [{ id, label }] or throws.
async function searchItems(statement) {
  const key = statement;
  if (cache.has(key)) return cache.get(key);
  const find = await getJson(`${API}?action=query&list=search&format=json&origin=*&srnamespace=0&srlimit=18&srsort=incoming_links_desc&srsearch=${encodeURIComponent(statement)}`);
  const ids = (find.query?.search || []).map((x) => x.title).filter((t) => /^Q\d+$/.test(t));
  let out = [];
  if (ids.length) {
    const lab = await getJson(`${API}?action=wbgetentities&format=json&origin=*&props=labels&languages=en&ids=${ids.join('|')}`);
    out = ids
      .map((id) => ({ id, label: lab.entities?.[id]?.labels?.en?.value || '' }))
      .filter((x) => x.label && x.label.length <= 40 && !/^Q\d+$/.test(x.label));
  }
  cache.set(key, out);
  return out;
}

const ROOTS = [
  { id: 'Q729', label: 'an animal', kind: 'class', seeds: [
    { id: 'Q7377', label: 'mammal', fixed: ['dog', 'cat', 'horse', 'cow', 'pig', 'sheep', 'elephant', 'lion', 'tiger', 'bear', 'wolf', 'monkey', 'rabbit', 'mouse', 'whale', 'dolphin', 'giraffe', 'kangaroo'] },
    { id: 'Q5113', label: 'bird', fixed: ['eagle', 'owl', 'penguin', 'chicken', 'duck', 'parrot', 'crow', 'swan', 'flamingo', 'hummingbird'] },
    { id: 'Q152', label: 'fish', fixed: ['shark', 'goldfish', 'salmon', 'tuna', 'clownfish', 'eel', 'seahorse', 'octopus', 'jellyfish', 'crab'] },
    { id: 'Q10811', label: 'reptile or amphibian', fixed: ['snake', 'lizard', 'turtle', 'crocodile', 'frog', 'gecko', 'salamander'] },
    { id: 'Q1390', label: 'insect or spider', fixed: ['bee', 'ant', 'butterfly', 'spider', 'mosquito', 'beetle', 'fly', 'dragonfly', 'ladybug'] },
  ] },
  { id: 'Q756', label: 'a plant', kind: 'class' },
  { id: 'Q2095', label: 'food or drink', kind: 'class' },
  { id: 'Q5', label: 'a real person', kind: 'person' },
  { id: 'Q95074', label: 'a fictional character', kind: 'proper' },
  { id: 'Q2221906', label: 'a place', kind: 'class', instances: true, seeds: [
    { id: 'Q6256', label: 'country' }, { id: 'Q515', label: 'city' }, { id: 'Q4022', label: 'river' },
    { id: 'Q8502', label: 'mountain' }, { id: 'Q23442', label: 'island' }, { id: 'Q23397', label: 'lake' }, { id: 'Q165', label: 'sea' },
  ] },
  { id: 'Q41176', label: 'a building', kind: 'class', instances: true },
  { id: 'Q6999', label: 'a star, planet, or other body in space', kind: 'class', instances: true },
  { id: 'Q1322005', label: 'a weather or natural event', kind: 'class' },
  { id: 'Q42889', label: 'a vehicle', kind: 'class' },
  { id: 'Q39546', label: 'a tool', kind: 'class' },
  { id: 'Q14745', label: 'a piece of furniture', kind: 'class' },
  { id: 'Q11460', label: 'clothing', kind: 'class' },
  { id: 'Q34379', label: 'a musical instrument', kind: 'class' },
  { id: 'Q349', label: 'a sport', kind: 'class' },
  { id: 'Q11424', label: 'a film', kind: 'proper' },
  { id: 'Q571', label: 'a book', kind: 'proper' },
  { id: 'Q7889', label: 'a video game', kind: 'proper' },
  { id: 'Q43229', label: 'an organization or company', kind: 'proper' },
];

const OCCUPATIONS = [
  { id: 'Q33999', label: 'an actor' },
  { id: 'Q177220', label: 'a singer' },
  { id: 'Q639669', label: 'a musician' },
  { id: 'Q2066131', label: 'an athlete' },
  { id: 'Q82955', label: 'a politician' },
  { id: 'Q901', label: 'a scientist' },
  { id: 'Q36180', label: 'a writer' },
  { id: 'Q1028181', label: 'an artist' },
];

export function wikiInit() {
  return { stage: 'root', list: ROOTS, lo: 0, hi: ROOTS.length, root: null, gender: null, alive: null, cands: [], ci: 0, pending: null };
}

function groupQuestion(w) {
  const mid = w.lo + Math.ceil((w.hi - w.lo) / 2);
  const half = w.list.slice(w.lo, mid);
  w.pending = { type: 'group', mid };
  return half.length === 1 ? `is it ${w.stage === 'sub' ? article(half[0].label) : half[0].label}?` : `is it any of these: ${half.map((x) => x.label).join(', ')}?`;
}

function article(label) {
  return (/^[aeiou]/i.test(label) ? 'an ' : 'a ') + label;
}

// Feed an answer to the question last returned by wikiNext().
export function wikiAnswer(w, ans) {
  const p = w.pending;
  w.pending = null;
  if (!p) return;
  if (p.type === 'group') {
    if (ans === 'yes') w.hi = p.mid; else w.lo = p.mid;
  } else if (p.type === 'gender') {
    w.gender = ans === 'yes' ? 'Q6581097' : ans === 'no' ? 'Q6581072' : null;
    w.stage = 'alive';
  } else if (p.type === 'alive') {
    w.alive = ans === 'yes' ? true : ans === 'no' ? false : null;
    w.stage = 'occ';
    w.list = OCCUPATIONS; w.lo = 0; w.hi = OCCUPATIONS.length;
  }
}

export function wikiGuessWrong(w) { w.ci++; }

async function loadClasses(root) {
  const parent = root.id;
  const seeds = root.seeds || [];
  let found = [];
  try { found = await searchItems(`haswbstatement:P279=${parent}`); } catch { if (!seeds.length) throw new Error('lookup'); }
  // common nouns are lowercase on Wikidata, which keeps species names and
  // other proper nouns out of the category list.
  const taken = new Set(seeds.map((x) => x.id));
  const rest = found.filter((x) => x.label[0] === x.label[0].toLowerCase() && x.id !== parent && !taken.has(x.id));
  return [...seeds, ...rest].slice(0, 12);
}

// Categories of everyday things end on the category itself and its kinds;
// named things (places, films, characters) end on well-known examples.
async function loadCandidates(chosen, root, atRoot) {
  if (chosen.fixed) return chosen.fixed.map((label) => ({ label, proper: false }));
  const named = root.kind === 'proper' || root.instances;
  const [inst, kinds] = await Promise.all([
    named ? searchItems(`haswbstatement:P31=${chosen.id}`).catch(() => []) : Promise.resolve([]),
    named && root.kind === 'proper' ? Promise.resolve([]) : searchItems(`haswbstatement:P279=${chosen.id}`).catch(() => []),
  ]);
  const out = [];
  const seen = new Set();
  const add = (label, proper) => {
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    out.push({ label, proper });
  };
  if (!named && !atRoot) add(chosen.label, false);
  for (const x of inst) add(x.label, true);
  for (const x of kinds) if (x.label[0] === x.label[0].toLowerCase()) add(x.label, false);
  return out;
}

async function loadPeople(w, occupation) {
  let q = `haswbstatement:P31=Q5 haswbstatement:P106=${occupation}`;
  if (w.gender) q += ` haswbstatement:P21=${w.gender}`;
  if (w.alive === true) q += ' -haswbstatement:P570';
  else if (w.alive === false) q += ' haswbstatement:P570';
  const found = await searchItems(q);
  return found.map((x) => ({ label: x.label, proper: true }));
}

// Next move. Resolves to { kind: 'question' | 'guess' | 'giveup', text } or
// null when the lookups are unavailable. `budgetLeft` is questions remaining.
export async function wikiNext(w, budgetLeft) {
  try {
    for (let guard = 0; guard < 6; guard++) {
      if (w.stage === 'cand') {
        if (!w.cands.length || w.ci >= Math.min(w.cands.length, 10)) return { kind: 'giveup' };
        const c = w.cands[w.ci];
        return { kind: 'guess', text: (c.proper ? c.label : article(c.label)).toLowerCase() };
      }
      if (w.stage === 'gender') { w.pending = { type: 'gender' }; return { kind: 'question', text: 'is it a man?' }; }
      if (w.stage === 'alive') { w.pending = { type: 'alive' }; return { kind: 'question', text: 'is this person still alive?' }; }

      // group stages: root, sub, occ
      let size = w.hi - w.lo;
      if (size > 1 && budgetLeft <= 1) { w.hi = w.lo + 1; size = 1; }
      if (size > 1) return { kind: 'question', text: groupQuestion(w) };

      const chosen = w.list[w.lo];
      if (w.stage === 'root') {
        w.root = chosen;
        if (chosen.kind === 'person') { w.stage = 'gender'; continue; }
        const classes = await loadClasses(chosen);
        if (classes.length >= 2) { w.stage = 'sub'; w.list = classes; w.lo = 0; w.hi = classes.length; continue; }
        w.cands = await loadCandidates(chosen, chosen, true);
        w.stage = 'cand';
      } else if (w.stage === 'sub') {
        w.cands = await loadCandidates(chosen, w.root, false);
        w.stage = 'cand';
      } else if (w.stage === 'occ') {
        w.cands = await loadPeople(w, chosen.id);
        w.stage = 'cand';
      }
    }
    return { kind: 'giveup' };
  } catch {
    return null;
  }
}
