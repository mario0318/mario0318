// Safe, browser-local command simulations. Nothing here reaches a shell or arbitrary network target.
const session = { cwd: '~', cone: false, idle: false, clicks: 0, number: null };

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

const gameNotes = {
  tictactoe: 'tic-tac-toe board staged. coordinates accepted: A1 through C3.',
  hangman: 'hangman selected. the word is still refusing disclosure.',
  snake: 'snake loaded in text mode. it immediately reconsidered the viewport.',
  dungeon: 'you stand in a small room. exits: north, terminal.',
  wordle: 'wordle chamber ready. submit a five-letter guess after the command.',
  memory: 'sequence: M 3 1 8. repeat it before the tab forgets.',
  quiz: 'question: what date is encoded by 0318? answer with `quiz march 18`.',
  clicker: null,
  pong: 'pong initialized. left paddle claims jurisdiction.',
  tetris: 'blocks queued. gravity remains a design constraint.',
  maze: 'maze generated. every route eventually returns to the prompt.',
  mastermind: 'mastermind code has four symbols. suspicion is encouraged.',
  sudoku: 'sudoku grid reserved. no accidental `sudo` privileges granted.',
};

export function respondUtility(name, args, ctx) {
  const out = (line = '') => ctx.print(line);
  if (staticLines[name]) { staticLines[name].forEach(out); return true; }
  if (gameNotes[name] !== undefined) {
    if (name === 'clicker') out(`signal count: ${++session.clicks}`); else out(gameNotes[name]);
    return true;
  }
  if (name === 'ls') { out('drwxr-xr-x  visitor  projects/'); Object.keys(files).forEach(f=>out(`-rw-r--r--  visitor  ${f}`)); return true; }
  if (name === 'cat') { const key=args[0]||'motd'; (files[key]||[`cat: ${key}: no such signal`]).forEach(out); return true; }
  if (name === 'cd') { session.cwd=args[0]||'~'; out(`path: ${session.cwd}`); return true; }
  if (name === 'history') { (ctx.history||[]).slice(0,20).reverse().forEach((x,i)=>out(`${String(i+1).padStart(3)}  ${x}`)); return true; }
  if (name === 'date') { out(new Date().toString()); return true; }
  if (name === 'echo') { out(args.join(' ')); return true; }
  if (name === 'grep') { const q=args.join(' ').toLowerCase(); (ctx.history||[]).filter(x=>x.toLowerCase().includes(q)).forEach(out); return true; }
  if (name === 'calc') { const expr=args.join(' '); if(!/^[\d\s+\-*/().%]+$/.test(expr)){out('calc: numbers and arithmetic operators only.');return true} try{out(String(Function(`"use strict";return (${expr})`)()))}catch{out('calc: expression declined.')} return true; }
  if (name === 'timer') { const seconds=Math.min(60,Math.max(0,Number(args[0])||3)); out(`timer armed for ${seconds}s (browser-local).`); window.setTimeout(()=>out(`timer: ${seconds}s elapsed.`),seconds*1000); return true; }
  if (name === 'cone') { session.cone=!session.cone; out(session.cone?'cone online. /\\':'cone folded back into storage.'); return true; }
  if (name === 'idle') { session.idle=!session.idle; out(session.idle?'low-energy watch enabled.':'full signal restored.'); return true; }
  if (name === 'sort') { out(['builder','observer','signal keeper','professional tab opener'][Math.floor(Math.random()*4)]); return true; }
  if (name === 'number') { if(session.number==null){session.number=1+Math.floor(Math.random()*100);out('number locked from 1–100. try `number 42`.');return true} const n=Number(args[0]);if(!n){out('give me a number.');return true}if(n===session.number){out('correct. resetting the field.');session.number=null}else out(n<session.number?'higher.':'lower.');return true; }
  if (name === 'rps') { const pick=['rock','paper','scissors'][Math.floor(Math.random()*3)],you=(args[0]||'rock').toLowerCase();out(`you: ${you} · terminal: ${pick}`);return true; }
  if (['ping','traceroute','nslookup','dig','ssh','telnet','ftp'].includes(name)) { const target=args[0]||'orbital.gateway'; out(`${name}: simulated route to ${target}`); out('reply: 3.18 ms · no external connection made'); return true; }
  if (name === 'kill' || name === 'umount') { out(`${name}: operation refused by imaginary kernel.`); return true; }
  if (name === 'auth' || name === 'permit') { out('guest session confirmed. privilege escalation unavailable.'); return true; }
  if (name === 'log') { staticLines.watch.forEach(out); return true; }
  if (name === 'man') { out('matrix commands: system · cone · games · network · lore · maintenance · utility'); out('try `ls`, `status`, `number`, `ping`, `about`, `calc`, or `orbit`.'); return true; }
  return false;
}
