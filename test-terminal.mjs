import { pickLine, formatLine, pickEaster } from './public/terminal-responses.js';
import { respond, setRegistry } from './public/terminal-dispatch.js';

const results = [];
const check = (name, ok, extra = '') =>
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + extra}`);

// rotation: full pool coverage before any repeat
const seen = new Set();
for (let i = 0; i < 8; i++) seen.add(pickLine('unknown'));
check('rotation covers full 8-line pool', seen.size === 8, `${seen.size}/8`);

// formatLine $-safety (function-form replacement)
const t1 = formatLine('dealing you: {title}', { title: "Cost $& Effect $' end" });
check('dollar-safe {title}', t1 === "dealing you: Cost $& Effect $' end", t1);

const t2 = formatLine('{input}: command not found. story of its life.', { input: '$$$ profit $&' });
check('dollar-safe {input}', t2.startsWith('$$$ profit $&:'), t2);

// easter reachability through dispatcher (bug 1 fix)
setRegistry([{ name: 'projects', desc: 'x', listed: true }]);
let printed = [];
let navigated = null;
const ctx = {
  rawInput: 'whoami',
  print: (t) => printed.push(t),
  openPortal() {}, openPanel() {}, openInlineApplet() {}, closeAll() {},
  navigate: (path) => { navigated = path; },
  clearLog() {}, logHasContent: () => true, anyUiOpen: () => false,
  soundcloud: { tracks: [], pickRandom() {} }, analemmaLive: false,
  history: ['ls', 'status'],
};
respond(null, [], ctx);
const whoamiPool = [
  "that's the question, isn't it.",
  "labels are cheap. behavior's more expensive.",
];
check('easter fires via dispatcher null-branch', whoamiPool.includes(printed[0]), printed[0]);

// sudo prefix + non-match (bug 2 fix)
check('sudo prefix matches', !!pickEaster('sudo make me a sandwich'));
check('sudo exact matches', !!pickEaster('sudo'));
check('sudoku is NOT an easter', pickEaster('sudoku') === null);

// unknown echoes {input} somewhere in rotation
let hit = false;
ctx.rawInput = 'frobnicate the widget';
for (let i = 0; i < 8; i++) {
  printed = [];
  respond(null, [], ctx);
  if (printed[0] && printed[0].startsWith('frobnicate the widget:')) { hit = true; break; }
}
check('unknown pool echoes raw input', hit);

ctx.rawInput = 'three body';
respond(null, [], ctx);
check('orbital puzzle opens backup portal', navigated === '/orbital.html', navigated);

printed = [];
respond({ name: 'ls', ui: 'client-task' }, [], ctx);
check('expanded matrix command dispatches', printed.some((line) => line.includes('readme.txt')));

printed = [];
respond({ name: 'calc', ui: 'client-task' }, ['3', '*', '18'], ctx);
check('safe calculator evaluates arithmetic', printed[0] === '54', printed[0]);

// play with empty vault -> empty variant, no panel
let panelOpened = false;
printed = [];
ctx.rawInput = 'play';
ctx.openPanel = () => { panelOpened = true; };
respond({ name: 'play', ui: 'panel' }, [], ctx);
check('play empty vault prints empty line', /vault|track list/.test(printed[0] || ''), printed[0]);
check('play empty vault does NOT open panel', panelOpened === false);

// play with tracks -> title interpolated, panel opened
printed = [];
ctx.soundcloud = {
  tracks: [{ title: 'Weird $& Loop', url: 'x' }],
  pickRandom() { return this.tracks[0]; },
};
respond({ name: 'play', ui: 'panel' }, [], ctx);
check('play interpolates $-safe title', (printed[0] || '').includes('Weird $& Loop'), printed[0]);
check('play opens panel', panelOpened === true);

// clear nothing-variant
printed = [];
ctx.logHasContent = () => false;
respond({ name: 'clear', ui: 'internal' }, [], ctx);
check('clear nothing variant', printed[0] === 'nothing much to clear, but it still felt right.', printed[0]);

// close nothing-variant
printed = [];
respond({ name: 'close', ui: 'internal' }, [], ctx);
check('close nothing variant', printed[0] === 'nothing open to close. bold move anyway.', printed[0]);

// help builds from registry + teaser line last
printed = [];
respond({ name: 'help', ui: 'text' }, [], ctx);
check('help lists registry entries', printed.some((l) => l.includes('projects')));
check('help ends with teaser', printed[printed.length - 1] === "there's more. three bodies are still in orbit.");

// help keys prints verbatim block
printed = [];
respond({ name: 'help', ui: 'text' }, ['keys'], ctx);
check('help keys verbatim', printed[0] === 'keyboard things:' && printed.length === 6);

// half-wired registered command falls to unknown (no tells)
printed = [];
ctx.rawInput = 'ghost';
respond({ name: 'ghost', ui: 'text' }, [], ctx);
check('unhandled registered cmd uses unknown pool', printed.length === 1 && !!printed[0]);

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
