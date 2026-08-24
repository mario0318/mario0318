// terminal-dispatch.js — command dispatcher for the mario0318 terminal
// Spec: TERMINAL_SPEC.md §5 (registry), §6 (voice), §7 (applet contract)
//
// Contract with terminal.js (the host):
//   respond(command, args, ctx)
//     command : registry entry ({ name, ui, applet?, ... }) or null if unresolved
//     args    : string[] — tokens after the command name
//     ctx     : host-provided capability object:
//       rawInput        : the exact trimmed line the user typed
//       print(text, cls?): append one line to #out via textContent
//       openPortal(id)  : open <dialog> portal with named content
//       openPanel(key, data?) : lazy-load applet module, mount in panel host
//       openInlineApplet(key) : mount inline applet under current line
//       closeAll()      : close any open portal/panel, unmount applet
//       clearLog()      : wipe #out
//       logHasContent() : boolean
//       anyUiOpen()     : boolean
//       navigate(path)  : move to another first-party interface
//       audioVault      : { tracks: []|null, pickRandom(): {title, url|audioUrl} }
//       analemmaLive    : boolean (studio web-hosted yet?)
//
// Invariants (do not relax):
//   - easter eggs resolve BEFORE registry lookup fails to unknown
//   - unresolved commands share one path, pool, and timing
//   - every printed string flows through pickLine/formatLine; no ad-hoc copy

import { pickLine, formatLine, pickEaster, pickWordChatter, pickChatter, helpKeysLines } from './terminal-responses.js';
import { respondUtility } from './terminal-utilities.js';
import { isGameActive, gameInput } from './terminal-games.js';
import { respondAssistant } from './terminal-assistant.js';

// respond() returns true when the input produced a real outcome (dots -> ok)
// and false for unknown/hidden/error paths (dots -> err). See terminal.js run().
export async function respond(command, args, ctx) {
  // A running mini-game owns input ahead of the registry — except the two
  // universal UI escapes, which must always work no matter what's active.
  if (isGameActive() && !(command && (command.name === 'clear' || command.name === 'close'))) {
    const raw = ctx.rawInput.trim();
    if (gameInput(raw, raw.split(/\s+/).slice(1), ctx)) return true;
  }

  const raw = ctx.rawInput.trim();

  if (!command) {
    const normalized = raw.toLowerCase().replace(/\s+/g, ' ');
    if (normalized === 'orbit' || normalized === 'open orbit' || normalized === 'three body') {
      const line = pickLine('easter', 'orbit');
      if (line) ctx.print(line);
      ctx.navigate?.('/orbital.html');
      return true;
    }
    const easter = pickEaster(raw);
    if (easter) {
      ctx.print(easter);
      return false;
    }
    if (respondAssistant(raw, ctx)) return true;
    const wordChatter = pickWordChatter(raw);
    if (wordChatter) {
      ctx.print(wordChatter);
      return false;
    }
    const chatter = pickChatter(raw);
    if (chatter) {
      ctx.print(chatter);
      return false;
    }

    if (respondAssistant(raw, ctx, { allowUnknown: true })) return false;
    const unknown = formatLine(pickLine('unknown'), { input: raw });
    if (unknown) ctx.print(unknown);
    return false;
  }

  // A sentence with recognizable intent takes precedence over a coincidental
  // command prefix. Bare `who` still prints terminal identities; `who are you`
  // answers the actual question.
  if (respondAssistant(raw, ctx, { onlyConversational: true })) return true;

  const helpFlag = extractHelpFlag(args);
  if (helpFlag && command.name !== 'help' && command.name !== 'man') {
    printCommandDetail(ctx, command.name);
    return true;
  }

  switch (command.name) {
    case 'help': {
      if (args[0] === 'keys') {
        for (const l of helpKeysLines()) printHelp(ctx, l);
        return true;
      }
      if (helpFlag) {
        printCommandDetail(ctx, 'help');
        return true;
      }
      if (args[0]) {
        printCommandDetail(ctx, args[0]);
        return true;
      }
      printHelpList(ctx);
      return true;
    }

    case 'man': {
      if (helpFlag) printCommandDetail(ctx, 'man');
      else if (args[0]) printCommandDetail(ctx, args[0]);
      else printHelpList(ctx);
      return true;
    }

    case 'projects': {
      say(ctx, 'projects');
      ctx.openPortal('projects');
      return true;
    }

    case 'play': {
      if (args[0] === 'list') {
        const vault = ctx.audioVault;
        if (!vault || !vault.tracks || vault.tracks.length === 0) {
          say(ctx, 'play', 'empty');
          return true;
        }
        say(ctx, 'play', 'list');
        ctx.openPortal('play-list', vault.tracks);
        return true;
      }
      const vault = ctx.audioVault;
      if (!vault || !vault.tracks || vault.tracks.length === 0) {
        say(ctx, 'play', 'empty');
        return true;
      }
      const track = vault.pickRandom();
      const line = formatLine(pickLine('play'), { title: track.title });
      if (line) ctx.print(line);
      await ctx.openPanel('audio-vault', track);
      return true;
    }

    case 'analemma': {
      say(ctx, 'analemma', ctx.analemmaLive ? 'default' : 'teaser');
      await ctx.openPanel('analemma');
      return true;
    }

    case 'dots': {
      say(ctx, 'easter', 'dotsLabOpen');
      await ctx.openInlineApplet('dots-lab');
      return true;
    }

    case 'contact': {
      say(ctx, 'contact');
      ctx.openPortal('contact');
      return true;
    }

    case 'clear': {
      const variant = ctx.logHasContent() ? 'default' : 'nothing';
      ctx.clearLog();
      say(ctx, 'clear', variant);
      return true;
    }

    case 'close': {
      const variant = ctx.anyUiOpen() ? 'default' : 'nothing';
      ctx.closeAll();
      say(ctx, 'close', variant);
      return true;
    }

    default: {
      if (respondUtility(command.name, args, ctx)) return true;
      if (command.action?.type === 'response' || command.action?.type === 'client-task') {
        const custom = pickLine(command.responsePool || command.name);
        if (custom) {
          ctx.print(formatLine(custom, { input: ctx.rawInput.trim() }));
          return true;
        }
      }
      // Registered commands that have no client implementation keep the
      // legacy unknown path. The assistant is for unresolved free-form input.
      const raw = ctx.rawInput.trim();
      const line = formatLine(pickLine('unknown'), { input: raw });
      if (line) ctx.print(line);
      return false;
    }
  }
}

// one-line convenience for the common say-then-act pattern
function say(ctx, poolKey, variant = 'default') {
  const line = pickLine(poolKey, variant);
  if (line) ctx.print(line);
}

// help list: built from the registry the host passes in, listed:true only.
// host injects the registry via setRegistry() at boot so this module never
// fetches anything itself.
let registry = [];
export function setRegistry(commands) {
  registry = commands;
}

const DESCRIPTION_OVERRIDES = {
  help: 'show the command index',
  projects: 'open shipped work',
  play: 'play a vault audio clip',
  analemma: 'open Analemma Studio',
  dots: 'open dot controls',
  contact: 'show contact options',
  clear: 'clear terminal output',
  close: 'close panels and portals',
  man: 'show command details',
  ls: 'list terminal files',
  cat: 'read a terminal file',
  cd: 'change the pretend path',
  history: 'show recent input',
  top: 'show process load',
  env: 'show guest environment',
  sysinfo: 'show terminal system info',
  dmesg: 'show boot-style messages',
  find: 'search terminal files',
  which: 'locate a command name',
  alias: 'show shortcut examples',
  jobs: 'show foreground job state',
  uptime: 'show tab uptime',
  hostname: 'show terminal host name',
  lscpu: 'show dot-core profile',
  neofetch: 'print terminal profile',
  date: 'show local date',
  grep: 'search command history',
  echo: 'repeat text',
  calc: 'evaluate safe arithmetic',
  timer: 'start a local timer',
  wc: 'count a terminal file',
  head: 'read first line of a file',
  tail: 'read last line of a file',
  cone: 'toggle cone signal',
  glare: 'reflect cone light',
  watch: 'read cone watch log',
  alert: 'test a harmless alert',
  status: 'show cone health',
  sort: 'draw a role',
  traffic: 'read traffic advisory',
  patch: 'run a fictional patch report',
  idle: 'toggle low-energy watch',
  report: 'record an observation',
  tilt: 'adjust cone posture',
  reflect: 'return light',
  taped: 'inspect the taped cone shell',
  'cone-id': 'print cone identifier',
  rps: 'play rock paper scissors',
  number: 'play higher/lower from 1 to 100',
  tictactoe: 'play tic-tac-toe',
  hangman: 'guess the hidden word',
  snake: 'play turn-based snake',
  dungeon: 'explore a tiny dungeon',
  wordle: 'guess a five-letter word',
  memory: 'repeat a growing sequence',
  quiz: 'answer terminal trivia',
  clicker: 'increment the signal count',
  pong: 'play turn-based pong',
  tetris: 'drop text blocks',
  maze: 'navigate a tiny maze',
  mastermind: 'crack a four-digit code',
  sudoku: 'solve a tiny sudoku row',
  ping: 'check fake latency',
  traceroute: 'trace a fake route',
  nslookup: 'look up a pretend host',
  netstat: 'show pretend connections',
  arp: 'show a pretend neighbor',
  dig: 'query a pretend record',
  ifconfig: 'show a pretend interface',
  route: 'show pretend routes',
  ssh: 'refuse remote shell access',
  telnet: 'refuse old remote access',
  ftp: 'refuse file-transfer access',
  curl: 'refuse web fetch access',
  wget: 'refuse web download access',
  secret: 'print a terminal secret',
  log: 'show watch entries',
  debug: 'show diagnostic state',
  ver: 'show terminal version',
  who: 'show terminal identities',
  about: 'show site identity',
  fortune: 'print a short fortune',
  coffee: 'request coffee badly',
  du: 'show pretend file sizes',
  df: 'show pretend storage',
  ps: 'show pretend processes',
  kill: 'refuse process removal',
  mount: 'show pretend mounts',
  umount: 'refuse unmounting',
  free: 'show pretend memory',
  vmstat: 'show pretend memory stats',
  w: 'show visitor session',
  mkdir: 'create a temporary folder',
  touch: 'touch a temporary file',
  rm: 'withhold deletion',
  mv: 'pretend to move a file',
  cp: 'pretend to copy a file',
  chmod: 'apply cosmetic permissions',
  temp: 'show temporary storage',
  backup: 'run a pretend backup',
  config: 'show terminal settings',
  cmatrix: 'print matrix-style text',
  ascii_art: 'print cone ASCII art',
  banner: 'print the site banner',
};

const COMMAND_GUIDE = {
  help: { syntax: 'help [command] | help keys', examples: ['help number', 'help keys'] },
  projects: { syntax: 'projects', examples: ['projects'] },
  play: { syntax: 'play | play list', examples: ['play', 'play list'] },
  analemma: { syntax: 'analemma', examples: ['analemma'] },
  dots: { syntax: 'dots', examples: ['dots'] },
  contact: { syntax: 'contact', examples: ['contact'] },
  clear: { syntax: 'clear', examples: ['clear'] },
  close: { syntax: 'close', examples: ['close'] },
  ls: { syntax: 'ls', examples: ['ls'] },
  cat: { syntax: 'cat [readme.txt|cone.log|motd]', examples: ['cat readme.txt'] },
  cd: { syntax: 'cd [path]', examples: ['cd projects'] },
  history: { syntax: 'history', examples: ['history'] },
  date: { syntax: 'date', examples: ['date'] },
  man: { syntax: 'man [command]', examples: ['man cone'] },
  grep: { syntax: 'grep <history text>', examples: ['grep play'] },
  top: { syntax: 'top', examples: ['top'] },
  echo: { syntax: 'echo <text>', examples: ['echo signal'] },
  calc: { syntax: 'calc <arithmetic>', examples: ['calc 3 * 18'] },
  timer: { syntax: 'timer [seconds 0-60]', examples: ['timer 5'] },
  cone: { syntax: 'cone', examples: ['cone', 'status'] },
  rps: { syntax: 'rps [rock|paper|scissors]', examples: ['rps scissors'] },
  number: { syntax: 'number | number <1-100>', examples: ['number', 'number 37'] },
  ping: { syntax: 'ping [target]', examples: ['ping orbital.gateway'] },
  traceroute: { syntax: 'traceroute [target]', examples: ['traceroute raul3.com'] },
  nslookup: { syntax: 'nslookup [target]', examples: ['nslookup mario0318.com'] },
  dig: { syntax: 'dig [target]', examples: ['dig dapp.cam'] },
  ssh: { syntax: 'ssh [target]', examples: ['ssh orbital.gateway'] },
  telnet: { syntax: 'telnet [target]', examples: ['telnet orbital.gateway'] },
  ftp: { syntax: 'ftp [target]', examples: ['ftp vault'] },
  mkdir: { syntax: 'mkdir <name>', examples: ['mkdir scratch'] },
  touch: { syntax: 'touch <name>', examples: ['touch note.txt'] },
  rm: { syntax: 'rm <name>', examples: ['rm note.txt'] },
  mv: { syntax: 'mv <from> <to>', examples: ['mv a b'] },
  cp: { syntax: 'cp <from> <to>', examples: ['cp a b'] },
  chmod: { syntax: 'chmod <mode> <name>', examples: ['chmod 644 note.txt'] },
  find: { syntax: 'find [text]', examples: ['find cone'] },
  which: { syntax: 'which <command>', examples: ['which calc'] },
  wc: { syntax: 'wc <file>', examples: ['wc motd'] },
  head: { syntax: 'head [file]', examples: ['head readme.txt'] },
  tail: { syntax: 'tail [file]', examples: ['tail cone.log'] },
};

function commandVisibleToGuests(command) {
  return command && command.enabled !== false && command.category !== 'admin';
}

function visibleRegistry() {
  return registry.filter(commandVisibleToGuests);
}

function commandLabel(command) {
  const aliases = (command.aliases || []).filter(Boolean);
  return aliases.length ? `${command.name} (${aliases.join(', ')})` : command.name;
}

function commandDescription(command) {
  if (DESCRIPTION_OVERRIDES[command.name]) return DESCRIPTION_OVERRIDES[command.name];
  return command.desc || 'available guest command';
}

function extractHelpFlag(args) {
  return args.find((arg) => ['-h', '--help', '-help', '/?'].includes(String(arg || '').toLowerCase()));
}

function resolveCommandForHelp(name) {
  const needle = String(name || '').toLowerCase();
  return visibleRegistry().find((command) => command.name === needle || (command.aliases || []).includes(needle));
}

function printHelpList(ctx) {
  printHelp(ctx, '');
  printHelp(ctx, 'commands:');

  for (const c of visibleRegistry()) printHelp(ctx, `  ${commandLabel(c)}`);
}

function printCommandDetail(ctx, name) {
  const command = resolveCommandForHelp(name);
  if (!command) {
    printHelp(ctx, `no guest manual entry for "${name}". try help.`);
    return;
  }
  const guide = COMMAND_GUIDE[command.name] || {};
  printHelp(ctx, '');
  printHelp(ctx, commandLabel(command));
  printHelp(ctx, `  ${commandDescription(command)}`);
  if (guide.syntax) printHelp(ctx, `  syntax: ${guide.syntax}`);
  if (guide.examples?.length) printHelp(ctx, `  example: ${guide.examples.join(' | ')}`);
}

function printHelp(ctx, line) {
  ctx.print(line, 'help-text');
}
