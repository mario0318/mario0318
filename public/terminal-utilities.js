// Safe, browser-local command simulations. Nothing here reaches a shell or arbitrary network target.
import { startGame } from './terminal-games.js';

const session = { cwd: '~', cone: false, idle: false, clicks: 0, number: null };
const GAME_NAMES = ['tictactoe', 'hangman', 'snake', 'dungeon', 'wordle', 'memory', 'quiz', 'pong', 'tetris', 'maze', 'mastermind', 'sudoku'];
const FORTUNES = [
  'a watched dot never breathes faster.',
  'the terminal remembers what you clear.',
  'three bodies, one gravity.',
  'somewhere a cone is holding a line.',
  'the shortest path between two prompts is a command.',
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const files = {
  'readme.txt': ['mario0318 terminal', 'projects, experiments, signals, and one quiet orbital backup.'],
  'cone.log': ['03:18 post established', 'traffic nominal', 'reflective layer online'],
  'motd': ['the interface is text. the system is pretending to be larger than it is.'],
};

const staticLines = {
  sysinfo: ['m318 web terminal', 'runtime: browser-local', 'kernel: imaginary 3.18', 'uptime: this tab'],
  dmesg: ['[0.0318] signal bus online', '[0.0550] three orbital bodies registered', '[0.0900] cone observer attached'],
  env: ['USER=visitor', 'HOME=~', 'SHELL=/bin/m318', 'TERM=signal-256color', 'AUTH=guest'],
  df: ['filesystem       size  used  avail', 'signal://home   318M   31M   287M'],
  free: ['memory       total   used   free', 'signal       318M    42M   276M'],
  du: ['4K  ./motd', '12K ./cone.log', '31K ./projects', '47K total'],
  ps: ['PID  STATE  COMMAND', '318  S      terminal', '319  R      signal-watch', '420  S      cone-daemon'],
  top: ['load: 0.03  users: 1  tasks: 3', 'CPU 3.18%  MEM 13.1%  cone: observing'],
  vmstat: ['procs  memory  signal', '1      318M    stable'],
  w: ['visitor  tty-web  up this-tab  idle 0:00'],
  mount: ['signalfs on / type imaginary (ro)', 'memory on /tmp type session (rw)'],
  ifconfig: ['web0: 10.3.18.1  mask 255.255.255.0', '      status: signal acquired'],
  netstat: ['Proto Local           Remote          State', 'tcp   m318:443       visitor:*       ESTABLISHED'],
  arp: ['10.3.18.1  03:18:03:18:03:18  web0'],
  route: ['default via orbital.gateway dev web0', '10.3.18.0/24 dev web0 scope signal'],
  about: ['mario0318', 'builder / signal / systems', 'this terminal is a map, not a machine.'],
  who: ['visitor  web0', 'cone     post-0318', 'three-body observer'],
  ver: ['mario0318 terminal 3.18', 'command matrix: expanded'],
  debug: ['state=nominal', 'auth=guest', 'shell=disabled', 'network=simulated', 'orbital=available'],
  traffic: ['northbound packets: light', 'signal merge: clear', 'cone advisory: keep moving'],
  status: ['durability: 98%', 'reflectivity: 100%', 'posture: upright', 'signal: nominal'],
  glare: ['the cone catches the light and returns it without comment.'],
  watch: ['03:18:12 — one visitor typed into the dark.', '03:18:18 — no collision detected.'],
  alert: ['defensive protocol simulated.', 'nothing was armed. nothing needed to be.'],
  patch: ['scanning fictional faults...', 'patched 0 real issues and 3 imaginary ones.'],
  report: ['observation recorded in volatile memory.', 'it will survive exactly as long as this tab.'],
  tilt: ['posture adjusted 3.18 degrees. still within tolerance.'],
  reflect: ['incident light returned to sender.'],
  taped: ['orange shell. silver tape. structurally optimistic.'],
  'cone-id': ['CONE-M318-0318', 'class: reflective observer'],
  secret: ['the secret is that the terminal is honest about being a website.'],
  backup: ['snapshot complete: 0 bytes copied, all vibes preserved.'],
  config: ['selection=weighted', 'shell_execution=blocked', 'orbital_backup=enabled'],
  temp: ['/tmp/session-0318  volatile  0K'],
  cmatrix: ['m 3 1 8  ·  s i g n a l  ·  0 1 1 0', '0 1 0 1  ·  c o n e  ·  3 1 8 m'],
  ascii_art: ['       /\\', '      /  \\', '     /____\\', '    /|    |\\', '   /_|____|_\\'],
  banner: ['M  A  R  I  O  0  3  1  8'],
};

export function respondUtility(name, args, ctx) {
  const out = (line = '') => ctx.print(line);
  if (staticLines[name]) { staticLines[name].forEach(out); return true; }
  if (name === 'clicker') { out(`signal count: ${++session.clicks}`); return true; }
  if (GAME_NAMES.includes(name)) { startGame(name, args, ctx); return true; }
  if (name === 'ls') { out('drwxr-xr-x  visitor  projects/'); Object.keys(files).forEach(f=>out(`-rw-r--r--  visitor  ${f}`)); return true; }
  if (name === 'cat') { const key=args[0]||'motd'; (files[key]||[`cat: ${key}: no such signal`]).forEach(out); return true; }
  if (name === 'cd') { session.cwd=args[0]||'~'; out(`path: ${session.cwd}`); return true; }
  if (name === 'history') { (ctx.history||[]).slice(0,20).reverse().forEach((x,i)=>out(`${String(i+1).padStart(3)}  ${x}`)); return true; }
  if (name === 'date') { out(new Date().toString()); return true; }
  if (name === 'echo') { out(args.join(' ')); return true; }
  if (name === 'grep') { const q=args.join(' ').toLowerCase(); (ctx.history||[]).filter(x=>x.toLowerCase().includes(q)).forEach(out); return true; }
  if (name === 'calc') { const expr=args.join(' '); if(!/^[\d\s+\-*/().%]+$/.test(expr)){out('calc: numbers and arithmetic operators only.');return true} try{out(String(Function(`"use strict";return (${expr})`)()))}catch{out('calc: expression declined.')} return true; }
  if (name === 'timer') { const seconds=Math.min(60,Math.max(0,Number(args[0])||3)); out(`timer armed for ${seconds}s (browser-local).`); window.setTimeout(()=>out(`timer: ${seconds}s elapsed.`),seconds*1000); return true; }
  if (name === 'cone') {
    session.cone = !session.cone;
    if (session.cone) {
      out('cone signal online. it is the site lore/status channel, not a real sensor.');
    } else {
      out('cone signal offline. lore channel folded back into storage.');
    }
    return true;
  }
  if (name === 'idle') { session.idle=!session.idle; out(session.idle?'low-energy watch enabled.':'full signal restored.'); return true; }
  if (name === 'sort') { out(['builder','observer','signal keeper','professional tab opener'][Math.floor(Math.random()*4)]); return true; }
  if (name === 'number') {
    if (args[0] === 'reset' || args[0] === 'stop') {
      session.number = null;
      out('number game reset.');
      return true;
    }
    if (session.number == null) session.number = 1 + Math.floor(Math.random() * 100);
    if (!args.length) {
      out('number game active: guess an integer from 1 to 100.');
      return true;
    }
    const n = Number(args[0]);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      out('give me an integer from 1 to 100.');
      return true;
    }
    if (n === session.number) {
      out('correct. resetting the field.');
      session.number = null;
    } else {
      out(n < session.number ? 'higher.' : 'lower.');
    }
    return true;
  }
  if (name === 'rps') { const pick=['rock','paper','scissors'][Math.floor(Math.random()*3)],you=(args[0]||'rock').toLowerCase();out(`you: ${you} · terminal: ${pick}`);return true; }
  if (['ping','traceroute','nslookup','dig','ssh','telnet','ftp'].includes(name)) { const target=args[0]||'orbital.gateway'; out(`${name}: simulated route to ${target}`); out('reply: 3.18 ms · no external connection made'); return true; }
  if (name === 'kill' || name === 'umount') { out(`${name}: operation refused by imaginary kernel.`); return true; }
  if (name === 'auth' || name === 'permit') { out('guest session confirmed. privilege escalation unavailable.'); return true; }
  if (name === 'log') { staticLines.watch.forEach(out); return true; }
  if (name === 'mkdir') { out(`created ${args[0]||'folder'}/. it will not survive a refresh.`); return true; }
  if (name === 'touch') { out(`touched ${args[0]||'file'}. timestamp updated, substance unchanged.`); return true; }
  if (name === 'rm') { out(`rm: ${args[0]||'file'}: permission theoretically granted, action withheld.`); return true; }
  if (name === 'mv') { out(`moved ${args[0]||'a'} -> ${args[1]||'b'}. nothing actually left.`); return true; }
  if (name === 'cp') { out(`copied ${args[0]||'a'} -> ${args[1]||'b'}. now there are two illusions.`); return true; }
  if (name === 'chmod') { out(`chmod ${args[0]||'000'} applied to ${args[1]||'file'}: cosmetic only.`); return true; }
  if (name === 'find') { const q=args[0]||''; const hit=Object.keys(files).find(f=>f.includes(q)); out(hit?`./${hit}`:`find: nothing matching "${q}".`); return true; }
  if (name === 'which') { out(`${args[0]||'that'}: /bin/m318/${args[0]||'unknown'} (simulated binary)`); return true; }
  if (name === 'alias') { out("ll='ls -la'"); out("g='git status --imaginary'"); out("cone='echo /\\\\'"); return true; }
  if (name === 'jobs') { out('no background jobs. everything here is foreground, on purpose.'); return true; }
  if (name === 'uptime') { out(`up ${Math.floor(performance.now()/1000)}s, 1 user, load average: calm.`); return true; }
  if (name === 'hostname') { out('m318-web-0318'); return true; }
  if (name === 'fortune') { out(pick(FORTUNES)); return true; }
  if (name === 'coffee') { out("418: i'm a teapot. still no coffee."); return true; }
  if (name === 'lscpu') { out('architecture: imaginary'); out('cores: 3 (one per dot)'); out('model: cone-class'); return true; }
  if (name === 'neofetch') { out('   /\\        guest@m318'); out('  /  \\       -----------'); out(' /____\\      os: signal-web'); out('/|    |\\     shell: /bin/m318'); out(`uptime: ${Math.floor(performance.now()/1000)}s`); return true; }
  if (name === 'curl' || name === 'wget') { out(`${name}: network egress disabled in this shell. nice try though.`); return true; }
  if (name === 'wc') { const key=args[0]; const lines=files[key]; if(!lines){out(`wc: ${key||'file'}: no such signal`);return true;} const words=lines.join(' ').split(/\s+/).filter(Boolean).length; const chars=lines.join('\n').length; out(`${lines.length} ${words} ${chars} ${key}`); return true; }
  if (name === 'head') { const key=args[0]||'motd'; (files[key]||[`head: ${key}: no such signal`]).slice(0,1).forEach(out); return true; }
  if (name === 'tail') { const key=args[0]||'motd'; const lines=files[key]||[`tail: ${key}: no such signal`]; lines.slice(-1).forEach(out); return true; }
  return false;
}
