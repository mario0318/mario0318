import fs from 'node:fs';
import { pickLine, formatLine, pickEaster } from './public/terminal-responses.js';
import { assistantResponsePools } from './public/terminal-responses-assistant.js';
import { respond, setRegistry } from './public/terminal-dispatch.js';
import { respondUtility } from './public/terminal-utilities.js';
import { classifyAssistant, ASSISTANT_BUCKETS } from './public/terminal-assistant-rules.js';
import { stopGame } from './public/terminal-games.js';
import { displayTitle, isExcludedByPrivacy, normalizeUrlPrefix, outputName } from './scripts/import-audio-vault.mjs';

globalThis.window = globalThis.window || { setTimeout };

const registry = JSON.parse(fs.readFileSync('public/commands.public.json', 'utf8')).commands;
const bundledTracks = JSON.parse(fs.readFileSync('public/tracks.json', 'utf8'));
const terminalCss = fs.readFileSync('public/terminal.css', 'utf8');
setRegistry(registry);

const results = [];
const check = (name, ok, extra = '') =>
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + extra}`);

function makeCtx(overrides = {}) {
  const state = {
    printed: [],
    panels: [],
    portals: [],
    inline: [],
    closed: 0,
    cleared: 0,
    navigated: null,
  };
  const ctx = {
    rawInput: '',
    print: (t = '') => state.printed.push(String(t)),
    openPortal: (id, data) => state.portals.push({ id, data }),
    openPanel: (key, data) => state.panels.push({ key, data }),
    openInlineApplet: (key) => state.inline.push(key),
    closeAll: () => { state.closed++; },
    clearLog: () => { state.cleared++; },
    logHasContent: () => true,
    anyUiOpen: () => false,
    navigate: (path) => { state.navigated = path; },
    audioVault: { tracks: [], pickRandom() { return this.tracks[0]; } },
    analemmaLive: true,
    history: ['ls', 'status', 'play'],
    ...overrides,
  };
  return { ctx, state };
}

function cssHexVar(name) {
  return terminalCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
}

function contrastRatio(foreground, background) {
  const toRgb = (hex) => hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255);
  const channel = (value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const luminance = (hex) => {
    const [r, g, b] = toRgb(hex).map(channel);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function runCommand(command, args = [], rawInput = null, overrides = {}) {
  const { ctx, state } = makeCtx(overrides);
  ctx.rawInput = rawInput ?? [command?.name, ...args].filter(Boolean).join(' ');
  const handled = await respond(command, args, ctx);
  return { handled, ctx, state };
}

// rotation: full pool coverage before any repeat
const seen = new Set();
for (let i = 0; i < 8; i++) seen.add(pickLine('unknown'));
check('rotation covers full 8-line pool', seen.size === 8, `${seen.size}/8`);

// formatLine $-safety (function-form replacement)
const t1 = formatLine('dealing you: {title}', { title: "Cost $& Effect $' end" });
check('dollar-safe {title}', t1 === "dealing you: Cost $& Effect $' end", t1);

const t2 = formatLine('{input}: command not found. story of its life.', { input: '$$$ profit $&' });
check('dollar-safe {input}', t2.startsWith('$$$ profit $&:'), t2);

check('bundled track manifest is an array', Array.isArray(bundledTracks));
check('bundled track manifest avoids SoundCloud page links', bundledTracks.every((track) => !/soundcloud\.com/i.test(track.url || track.audioUrl || '')));
check('terminal palette keeps body text high contrast', contrastRatio(cssHexVar('text'), cssHexVar('bg')) >= 7);
check('terminal palette keeps dim text readable', contrastRatio(cssHexVar('text-dim'), cssHexVar('bg')) >= 4.5);
check('terminal palette keeps accents readable on black', ['dot-1', 'dot-2', 'dot-3'].every((name) => contrastRatio(cssHexVar(name), cssHexVar('bg')) >= 4.5));
check('terminal palette keeps command and interactive input readable', ['cmd-green', 'interactive'].every((name) => contrastRatio(cssHexVar(name), cssHexVar('bg')) >= 4.5));
check('terminal font stack is technical sans, not fully monospace', /sans-serif/.test(terminalCss) && /tabular-nums/.test(terminalCss) && !/ui-monospace/.test(terminalCss));
check('audio vault cache is ignored by git', fs.readFileSync('.gitignore', 'utf8').includes('public/audio-vault/'));
check('audio vault cache is ignored by Cloud Run source deploy', fs.readFileSync('.gcloudignore', 'utf8').includes('public/audio-vault/'));
check('audio importer excludes Personal path segment', isExcludedByPrivacy('Personal/clip.mp3') && isExcludedByPrivacy('foo/personal/bar.wav'));
check('audio importer does not exclude non-personal words', !isExcludedByPrivacy('impersonal/clip.mp3') && !isExcludedByPrivacy('personality/clip.mp3'));
check('audio importer creates mp3 output names', outputName('Folder/Clip With $ Weird.wav').endsWith('.mp3'));
check('audio importer title preserves folder context', displayTitle('Folder/Clip_Name.wav') === 'Folder / Clip Name');
check('audio importer normalizes url prefix', normalizeUrlPrefix('https://media.example.test/audio-vault') === 'https://media.example.test/audio-vault/');

// easter reachability through dispatcher
let result = await runCommand(null, [], 'whoami');
const whoamiPool = [
  "that's the question, isn't it.",
  "labels are cheap. behavior's more expensive.",
];
check('easter fires via dispatcher null-branch', whoamiPool.includes(result.state.printed[0]), result.state.printed[0]);

// sudo prefix + non-match
check('sudo prefix matches', !!pickEaster('sudo make me a sandwich'));
check('sudo exact matches', !!pickEaster('sudo'));
check('sudoku is NOT an easter', pickEaster('sudoku') === null);

check('assistant routes builder language', classifyAssistant('help me ship this api') === ASSISTANT_BUCKETS.BUILDER);
check('assistant routes lore language', classifyAssistant('the orbital vault is quiet') === ASSISTANT_BUCKETS.LORE);
check('assistant routes capability questions', classifyAssistant('how does this work?') === ASSISTANT_BUCKETS.CAPABILITY);
check('assistant routes game hints with game context', classifyAssistant('i am stuck', { lastCommand: 'game_wordle' }) === ASSISTANT_BUCKETS.GAME);
check('assistant distinguishes visitor identity', classifyAssistant('who am i') === ASSISTANT_BUCKETS.IDENTITY_USER);
check('assistant distinguishes terminal identity', classifyAssistant('who are you') === ASSISTANT_BUCKETS.IDENTITY_TERMINAL);
check('assistant recognizes direct requests', classifyAssistant('say something useful') === ASSISTANT_BUCKETS.DIRECTIVE);
check('assistant recognizes criticism', classifyAssistant('this sucks') === ASSISTANT_BUCKETS.CRITIQUE);

let assistantResult = await runCommand({ name: 'who', ui: 'client-task' }, ['are', 'you'], 'who are you');
check('natural identity question beats who command prefix', assistantResponsePools.assistant_identity_terminal.default.includes(assistantResult.state.printed[0]), assistantResult.state.printed[0]);
assistantResult = await runCommand({ name: 'who', ui: 'client-task' }, ['am', 'i'], 'who am i');
check('visitor and terminal identity do not share a response path', assistantResponsePools.assistant_identity_user.default.includes(assistantResult.state.printed[0]), assistantResult.state.printed[0]);
assistantResult = await runCommand({ name: 'umount', ui: 'client-task' }, ['yourself'], 'umount yourself');
check('natural directive beats simulated command prefix', assistantResponsePools.assistant_directive.default.includes(assistantResult.state.printed[0]), assistantResult.state.printed[0]);

const assistantOutputs = [];
for (const input of ['unmapped phrase alpha', 'unmapped phrase beta', 'unmapped phrase gamma', 'unmapped phrase delta']) {
  result = await runCommand(null, [], input);
  assistantOutputs.push(result.state.printed[0]);
}
const assistantAllowed = new Set(assistantResponsePools.assistant_unknown.default);
check('assistant handles unresolved free-form input', assistantOutputs.every((line) => assistantAllowed.has(line)));
check('assistant unknown responses vary within bounded pool', new Set(assistantOutputs).size >= 3, assistantOutputs.join(' | '));

result = await runCommand(null, [], 'three body');
check('orbital puzzle opens backup portal', result.state.navigated === '/orbital.html', result.state.navigated);

result = await runCommand({ name: 'ls', ui: 'client-task' }, [], 'ls');
check('expanded matrix command dispatches', result.state.printed.some((line) => line.includes('readme.txt')));

result = await runCommand({ name: 'calc', ui: 'client-task' }, ['3', '*', '18'], 'calc 3 * 18');
check('safe calculator evaluates arithmetic', result.state.printed[0] === '54', result.state.printed[0]);

// play with empty vault -> intentional empty response, no panel
result = await runCommand({ name: 'play', ui: 'panel' }, [], 'play');
check('play empty vault prints intentional useful line', /no direct file urls|direct audio urls/.test(result.state.printed[0] || ''), result.state.printed[0]);
check('play empty vault does NOT open panel', result.state.panels.length === 0);

// play with tracks -> title interpolated, panel opened
result = await runCommand(
  { name: 'play', ui: 'panel' },
  [],
  'play',
  { audioVault: { tracks: [{ title: 'Weird $& Loop', url: 'https://media.example.test/clip.mp3' }], pickRandom() { return this.tracks[0]; } } },
);
check('play interpolates $-safe title', (result.state.printed[0] || '').includes('Weird $& Loop'), result.state.printed[0]);
check('play opens audio vault panel', result.state.panels[0]?.key === 'audio-vault');

result = await runCommand({ name: 'analemma', ui: 'panel' }, [], 'analemma');
check('analemma opens panel', result.state.panels[0]?.key === 'analemma');
check('analemma no longer uses teaser copy when live', !/catching up|teaser|undefined/.test(result.state.printed.join('\n')));

result = await runCommand({ name: 'number', ui: 'client-task' }, [], 'number');
check('number command explains full range when started', /1 to 100/.test(result.state.printed.join('\n')));

result = await runCommand({ name: 'number', ui: 'client-task' }, ['37'], 'number 37');
check('number accepts guesses other than 42', /higher|lower|correct/.test(result.state.printed.join('\n')), result.state.printed.join(' | '));

result = await runCommand({ name: 'cone', ui: 'client-task' }, [], 'cone');
check('cone explains purpose', /lore\/status channel|lore channel/.test(result.state.printed.join('\n')), result.state.printed.join(' | '));

// clear nothing-variant
result = await runCommand(
  { name: 'clear', ui: 'internal' },
  [],
  'clear',
  { logHasContent: () => false },
);
check('clear nothing variant', result.state.printed[0] === 'nothing much to clear, but it still felt right.', result.state.printed[0]);

// close nothing-variant
result = await runCommand({ name: 'close', ui: 'internal' }, [], 'close');
check('close nothing variant', result.state.printed[0] === 'nothing open to close. bold move anyway.', result.state.printed[0]);

// help builds from registry and does not claim undisclosed extras
result = await runCommand({ name: 'help', ui: 'text' }, [], 'help');
const visibleCommands = registry.filter((command) => command.enabled !== false && command.category !== 'admin');
const helpText = result.state.printed.join('\n');
check('help lists every guest-visible registry command', visibleCommands.every((command) => helpText.includes(command.name)));
check('help does not end with vague extra-command teaser', !helpText.includes("there's more"));
check('help hides discovery guidance by default', !/help <command>|syntax:|example:|tab/.test(helpText));
check('help does not expose command categories', !/^(core|places|toys|system|utility|cone|games|network|lore|maintenance|data|visual|other):$/m.test(helpText));
check('help descriptions are not category fallbacks', !/(simulated .* command|browser-local (utility|mini-game|command)|traffic-cone lore\/control command|site lore response|visual terminal output)/.test(helpText));

// help keys prints verbatim block
result = await runCommand({ name: 'help', ui: 'text' }, ['keys'], 'help keys');
check('help keys verbatim', result.state.printed[0] === 'keyboard things:' && result.state.printed.length === 6);

// command-specific help
result = await runCommand({ name: 'help', ui: 'text' }, ['number'], 'help number');
check('help number includes syntax and example', /syntax: number/.test(result.state.printed.join('\n')) && /number 37/.test(result.state.printed.join('\n')));
check('help number does not include category', !result.state.printed.join('\n').includes('category:'));

result = await runCommand({ name: 'help', ui: 'text' }, ['play'], 'help play');
check('help play does not advertise unimplemented next command', !result.state.printed.join('\n').includes('play next'));

result = await runCommand({ name: 'number', ui: 'client-task' }, ['-h'], 'number -h');
check('number -h includes syntax and example', /syntax: number/.test(result.state.printed.join('\n')) && /number 37/.test(result.state.printed.join('\n')));

result = await runCommand({ name: 'cone', ui: 'client-task' }, ['/?'], 'cone /?');
check('cone /? includes purpose and syntax', /toggle cone signal/.test(result.state.printed.join('\n')) && /syntax: cone/.test(result.state.printed.join('\n')));

result = await runCommand({ name: 'help', ui: 'text' }, ['-h'], 'help -h');
check('help -h includes help command syntax', /syntax: help/.test(result.state.printed.join('\n')));

// half-wired registered command falls to unknown (no tells)
result = await runCommand({ name: 'ghost', ui: 'text' }, [], 'ghost');
check('unhandled registered cmd uses unknown pool', result.handled === false && result.state.printed.length === 1 && !!result.state.printed[0]);

// Every guest-visible command either dispatches successfully or returns an intentional response.
const sampleArgs = {
  cat: ['motd'], grep: ['play'], calc: ['3', '*', '18'], timer: ['0'], rps: ['rock'],
  number: ['37'], ping: ['orbital.gateway'], traceroute: ['orbital.gateway'],
  nslookup: ['mario0318.com'], dig: ['mario0318.com'], ssh: ['orbital.gateway'],
  telnet: ['orbital.gateway'], ftp: ['vault'], mkdir: ['scratch'], touch: ['note.txt'],
  rm: ['note.txt'], mv: ['a', 'b'], cp: ['a', 'b'], chmod: ['644', 'note.txt'],
  find: ['cone'], which: ['calc'], wc: ['motd'], head: ['motd'], tail: ['motd'],
  tictactoe: [], hangman: [], snake: [], dungeon: [], wordle: [], memory: [],
  quiz: [], clicker: [], pong: [], tetris: [], maze: [], mastermind: [], sudoku: [],
};
const persistentGames = new Set(['tictactoe', 'hangman', 'snake', 'dungeon', 'wordle', 'memory', 'quiz', 'pong', 'tetris', 'maze', 'mastermind', 'sudoku']);
for (const command of visibleCommands) {
  if (command.name === 'help') continue;
  const args = sampleArgs[command.name] || [];
  result = await runCommand(command, args, [command.name, ...args].join(' '));
  const producedIntentionalOutcome = result.handled || result.state.printed.length || result.state.panels.length || result.state.portals.length || result.state.inline.length || result.state.cleared || result.state.closed || result.state.navigated;
  check(`guest command responds: ${command.name}`, !!producedIntentionalOutcome);
  if (persistentGames.has(command.name)) stopGame({ print() {} });
}

// Public registry should not expose privileged/admin command names.
check('public registry excludes auth command', !registry.some((command) => command.name === 'auth'));
check('public registry excludes permit command', !registry.some((command) => command.name === 'permit'));

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
