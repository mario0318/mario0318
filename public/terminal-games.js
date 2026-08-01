// terminal-games.js — turn-based mini-games for the mario0318 terminal
// One command per Enter press. No raw key capture, no rAF loops, no timers.
// State lives in module scope for the current tab only; nothing persists.
//
// Contract with terminal-dispatch.js:
//   isGameActive()                 : is a game currently running
//   startGame(name, args, ctx)     : begin a game by registry name; true if it exists
//   gameInput(raw, args, ctx)      : feed one line of input to the active game;
//                                     true if consumed (dots go 'ok'), false otherwise
//   stopGame(ctx)                  : end whatever is active
//
// Output only via ctx.print(text) -> textContent. No HTML.

let game = null; // { type, data }

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rint(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

const WORDS = ['signal', 'orbital', 'cone', 'terminal', 'vault', 'static', 'traffic', 'reflect', 'analemma', 'dungeon', 'cursor', 'matrix', 'render', 'kernel'];
const WORDS5 = ['vault', 'orbit', 'cargo', 'shift', 'crane', 'panel', 'input', 'light', 'sound', 'trace', 'pulse', 'frame', 'glare'];

export function isGameActive() { return !!game; }

export function stopGame(ctx) {
  if (!game) return false;
  const type = game.type;
  game = null;
  ctx.print(`${type}: session ended. back to the prompt.`);
  return true;
}

export function gameInput(raw, args, ctx) {
  if (!game) return false;
  const norm = raw.trim().toLowerCase();
  if (norm === 'stop' || norm === 'quit' || norm === 'q') return stopGame(ctx);
  const handler = handlers[game.type];
  if (!handler) { game = null; return false; }
  return handler.move(raw, args, ctx);
}

export function startGame(name, args, ctx) {
  const handler = handlers[name];
  if (!handler) return false;
  game = { type: name, data: handler.init() };
  handler.render(ctx, true);
  return true;
}

// ---------------------------------------------------------------- tictactoe

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function printBoard(ctx, board) {
  const s = (i) => board[i] || '.';
  ctx.print('  a b c');
  ctx.print('1 ' + [0, 1, 2].map(s).join(' '));
  ctx.print('2 ' + [3, 4, 5].map(s).join(' '));
  ctx.print('3 ' + [6, 7, 8].map(s).join(' '));
}

function checkWin(board) {
  for (const [a, b, c] of LINES) if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  if (board.every(Boolean)) return 'draw';
  return null;
}

function pickComputerMove(board) {
  const empties = board.map((v, i) => (v ? null : i)).filter((v) => v !== null);
  if (!empties.length) return null;
  for (const i of empties) { const b = board.slice(); b[i] = 'O'; if (checkWin(b) === 'O') return i; }
  for (const i of empties) { const b = board.slice(); b[i] = 'X'; if (checkWin(b) === 'X') return i; }
  if (board[4] == null) return 4;
  const corners = [0, 2, 6, 8].filter((i) => empties.includes(i));
  if (corners.length) return pick(corners);
  return pick(empties);
}

// ------------------------------------------------------------------ wordle

function scoreWordle(guess, answer) {
  const res = Array(5).fill('_');
  const pool = answer.split('');
  for (let i = 0; i < 5; i++) if (guess[i] === answer[i]) { res[i] = guess[i].toUpperCase(); pool[i] = null; }
  for (let i = 0; i < 5; i++) {
    if (res[i] !== '_') continue;
    const idx = pool.indexOf(guess[i]);
    if (idx !== -1) { res[i] = guess[i]; pool[idx] = null; } else res[i] = '_';
  }
  return res.join('');
}

// ------------------------------------------------------------------- snake

function spawnApple(size, body) {
  let pos;
  do { pos = [rint(0, size - 1), rint(0, size - 1)]; } while (body.some(([y, x]) => y === pos[0] && x === pos[1]));
  return pos;
}

function printSnake(ctx, data) {
  const { size, body, apple, score } = data;
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < size; x++) {
      if (body[0][0] === y && body[0][1] === x) row += 'O';
      else if (body.some(([by, bx]) => by === y && bx === x)) row += 'o';
      else if (apple[0] === y && apple[1] === x) row += '*';
      else row += '.';
    }
    ctx.print(row);
  }
  ctx.print(`score: ${score}`);
}

// -------------------------------------------------------------------- pong

function stepPong(data) {
  let [by, bx] = data.ball;
  let [vy, vx] = data.vel;
  let ny = by + vy;
  if (ny < 0 || ny > data.h - 1) { vy = -vy; ny = by + vy; }
  let nx = bx + vx;
  let result = null;
  if (nx < 0) {
    if (by >= data.py && by <= data.py + 1) { vx = 1; nx = 0; } else result = 'miss';
  } else if (nx > data.w - 1) {
    if (by >= data.oy && by <= data.oy + 1) { vx = -1; nx = data.w - 1; } else result = 'score';
  }
  data.ball = [ny, nx];
  data.vel = [vy, vx];
  return result;
}

function printPong(ctx, data) {
  const { w, h, py, oy, ball } = data;
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (x === 0 && y >= py && y <= py + 1) row += '|';
      else if (x === w - 1 && y >= oy && y <= oy + 1) row += '|';
      else if (ball[0] === y && ball[1] === x) row += 'o';
      else row += ' ';
    }
    ctx.print('[' + row + ']');
  }
}

// ------------------------------------------------------------------ tetris

function printTetris(ctx, data) {
  for (const row of data.grid) ctx.print(row.map((v) => (v ? '#' : '.')).join(''));
  ctx.print(`score: ${data.score}`);
}

// -------------------------------------------------------------------- maze

const MAZE_ROOMS = {
  start: { desc: 'a bare junction. exits: north, east.', exits: { north: 'hall', east: 'vault' } },
  hall: { desc: 'a long hall, humming faintly. exits: south, east.', exits: { south: 'start', east: 'core' } },
  vault: { desc: 'a locked-looking vault, door ajar. exits: west, north.', exits: { west: 'start', north: 'core' } },
  core: { desc: 'the signal core. this is the exit.', exits: {}, goal: true },
};

// ----------------------------------------------------------------- dungeon

const DUNGEON_ROOMS = {
  entry: { desc: 'you stand at the mouth of a dark room. exits: north.', exits: { north: 'chamber' }, item: 'torch' },
  chamber: { desc: 'a chamber lit only by what you carry. exits: south, east.', exits: { south: 'entry', east: 'shrine' }, item: 'coin' },
  shrine: { desc: 'a small shrine. something glints. exits: west.', exits: { west: 'chamber' }, item: 'amulet' },
};

// ------------------------------------------------------------------ quiz

const QUIZ = [
  { q: 'what date is encoded by 0318?', a: ['march 18', '3/18', '03/18', 'march 18th'] },
  { q: 'how many dots run this terminal?', a: ['3', 'three'] },
  { q: 'what color is dot one?', a: ['ember', 'red', 'orange-red'] },
  { q: 'what color is dot three?', a: ['teal', 'cyan', 'teal green'] },
  { q: 'true or false: this terminal executes real shell commands.', a: ['false', 'no'] },
  { q: 'what do you type to see the command index?', a: ['help'] },
];

// ------------------------------------------------------------------- handlers

const handlers = {
  tictactoe: {
    init() { return { board: Array(9).fill(null) }; },
    render(ctx, intro) {
      if (intro) ctx.print('tictactoe: you are X. play a cell like `b2`. `stop` to bail.');
      printBoard(ctx, game.data.board);
    },
    move(raw, args, ctx) {
      const m = raw.trim().toLowerCase().match(/^([a-c])([1-3])$/);
      if (!m) { ctx.print('tictactoe: play a cell like `a1` through `c3`.'); return true; }
      const col = m[1].charCodeAt(0) - 97;
      const row = Number(m[2]) - 1;
      const idx = row * 3 + col;
      const { board } = game.data;
      if (board[idx]) { ctx.print('tictactoe: that cell is taken.'); return true; }
      board[idx] = 'X';
      let result = checkWin(board);
      if (!result) {
        const cIdx = pickComputerMove(board);
        if (cIdx != null) board[cIdx] = 'O';
        result = checkWin(board);
      }
      printBoard(ctx, board);
      if (result === 'X') { ctx.print('tictactoe: you win. the computer is unbothered.'); game = null; }
      else if (result === 'O') { ctx.print('tictactoe: computer wins. it will not gloat.'); game = null; }
      else if (result === 'draw') { ctx.print('tictactoe: draw. predictable.'); game = null; }
      return true;
    },
  },

  hangman: {
    init() { return { word: pick(WORDS), guessed: new Set(), misses: 0, max: 6 }; },
    render(ctx, intro) {
      const { word, guessed, misses, max } = game.data;
      if (intro) ctx.print('hangman: guess one letter at a time. `stop` to bail.');
      ctx.print(word.split('').map((c) => (guessed.has(c) ? c : '_')).join(' '));
      ctx.print(`misses: ${misses}/${max}`);
    },
    move(raw, args, ctx) {
      const letter = raw.trim().toLowerCase();
      if (!/^[a-z]$/.test(letter)) { ctx.print('hangman: one letter at a time.'); return true; }
      const { word, guessed } = game.data;
      if (guessed.has(letter)) { ctx.print('hangman: already tried that one.'); return true; }
      guessed.add(letter);
      if (!word.includes(letter)) game.data.misses++;
      const won = word.split('').every((c) => guessed.has(c));
      this.render(ctx, false);
      if (won) { ctx.print(`hangman: word was "${word}". you got it.`); game = null; }
      else if (game.data.misses >= game.data.max) { ctx.print(`hangman: out of misses. word was "${word}".`); game = null; }
      return true;
    },
  },

  wordle: {
    init() { return { answer: pick(WORDS5), guesses: [], max: 6 }; },
    render(ctx, intro) {
      if (intro) ctx.print('wordle: guess a 5-letter word. `stop` to bail.');
      for (const g of game.data.guesses) ctx.print(g.word + '  ' + g.feedback);
      ctx.print(`${game.data.guesses.length}/${game.data.max}`);
    },
    move(raw, args, ctx) {
      const word = raw.trim().toLowerCase();
      if (!/^[a-z]{5}$/.test(word)) { ctx.print('wordle: five letters, letters only.'); return true; }
      const { answer } = game.data;
      const feedback = scoreWordle(word, answer);
      game.data.guesses.push({ word, feedback });
      ctx.print(word + '  ' + feedback);
      if (word === answer) { ctx.print('wordle: correct.'); game = null; return true; }
      if (game.data.guesses.length >= game.data.max) { ctx.print(`wordle: out of guesses. word was "${answer}".`); game = null; return true; }
      return true;
    },
  },

  memory: {
    init() { return { seq: [rint(1, 9)] }; },
    render(ctx, intro) {
      if (intro) ctx.print('memory: remember the sequence, repeat it space-separated. `stop` to bail.');
      ctx.print('sequence: ' + game.data.seq.join(' '));
      ctx.print('repeat it.');
    },
    move(raw, args, ctx) {
      const nums = raw.trim().split(/\s+/).map(Number);
      const { seq } = game.data;
      const ok = nums.length === seq.length && nums.every((n, i) => n === seq[i]);
      if (!ok) { ctx.print(`memory: wrong. sequence was ${seq.join(' ')}. score: ${seq.length - 1}.`); game = null; return true; }
      ctx.print('correct. one more.');
      game.data.seq.push(rint(1, 9));
      this.render(ctx, false);
      return true;
    },
  },

  quiz: {
    init() { return { i: 0, score: 0 }; },
    render(ctx, intro) {
      if (intro) ctx.print('quiz: six questions. `stop` to bail.');
      ctx.print(`q${game.data.i + 1}: ${QUIZ[game.data.i].q}`);
    },
    move(raw, args, ctx) {
      const ans = raw.trim().toLowerCase();
      const q = QUIZ[game.data.i];
      const correct = q.a.some((a) => a.toLowerCase() === ans);
      if (correct) { game.data.score++; ctx.print('correct.'); } else ctx.print(`no. answer: ${q.a[0]}.`);
      game.data.i++;
      if (game.data.i >= QUIZ.length) { ctx.print(`quiz: done. ${game.data.score}/${QUIZ.length}.`); game = null; return true; }
      this.render(ctx, false);
      return true;
    },
  },

  mastermind: {
    init() { return { code: Array.from({ length: 4 }, () => rint(1, 6)), tries: 0, max: 10 }; },
    render(ctx, intro) {
      if (intro) ctx.print('mastermind: 4 digits, 1-6, repeats allowed. guess like `3 1 4 2`. `stop` to bail.');
    },
    move(raw, args, ctx) {
      const guess = raw.trim().split(/\s+/).map(Number);
      if (guess.length !== 4 || guess.some((n) => !Number.isInteger(n) || n < 1 || n > 6)) {
        ctx.print('mastermind: four digits, 1 through 6.'); return true;
      }
      const { code } = game.data;
      game.data.tries++;
      let black = 0;
      const usedCode = [false, false, false, false];
      const usedGuess = [false, false, false, false];
      for (let i = 0; i < 4; i++) if (guess[i] === code[i]) { black++; usedCode[i] = true; usedGuess[i] = true; }
      let white = 0;
      for (let i = 0; i < 4; i++) {
        if (usedGuess[i]) continue;
        for (let j = 0; j < 4; j++) {
          if (usedCode[j] || guess[i] !== code[j]) continue;
          white++; usedCode[j] = true; break;
        }
      }
      ctx.print(`black: ${black}  white: ${white}  (${game.data.tries}/${game.data.max})`);
      if (black === 4) { ctx.print('mastermind: cracked it.'); game = null; return true; }
      if (game.data.tries >= game.data.max) { ctx.print(`mastermind: out of tries. code was ${code.join(' ')}.`); game = null; return true; }
      return true;
    },
  },

  maze: {
    init() { return { room: 'start' }; },
    render(ctx, intro) {
      if (intro) ctx.print('maze: move with n/s/e/w. `stop` to bail.');
      ctx.print(MAZE_ROOMS[game.data.room].desc);
    },
    move(raw, args, ctx) {
      const input = raw.trim().toLowerCase();
      if (input === 'look') { this.render(ctx, false); return true; }
      const dirs = { n: 'north', s: 'south', e: 'east', w: 'west', north: 'north', south: 'south', east: 'east', west: 'west' };
      const dir = dirs[input];
      if (!dir) { ctx.print('maze: n, s, e, w, or look.'); return true; }
      const room = MAZE_ROOMS[game.data.room];
      const next = room.exits[dir];
      if (!next) { ctx.print('maze: no way through there.'); return true; }
      game.data.room = next;
      const nr = MAZE_ROOMS[next];
      ctx.print(nr.desc);
      if (nr.goal) { ctx.print('maze: found the core. cleared.'); game = null; }
      return true;
    },
  },

  dungeon: {
    init() { return { room: 'entry', inv: [], taken: new Set() }; },
    render(ctx, intro) {
      if (intro) ctx.print('dungeon: go <dir>, look, take <item>, inventory. `stop` to bail.');
      ctx.print(DUNGEON_ROOMS[game.data.room].desc);
    },
    move(raw, args, ctx) {
      const input = raw.trim().toLowerCase();
      const { data } = game;
      const room = DUNGEON_ROOMS[data.room];
      if (input === 'look') { ctx.print(room.desc); return true; }
      if (input === 'inventory' || input === 'inv') { ctx.print('carrying: ' + (data.inv.length ? data.inv.join(', ') : 'nothing')); return true; }
      if (input.startsWith('take ')) {
        const item = input.slice(5).trim();
        if (room.item && room.item === item && !data.taken.has(data.room)) {
          data.inv.push(item);
          data.taken.add(data.room);
          ctx.print(`took the ${item}.`);
          if (item === 'amulet') { ctx.print('dungeon: the amulet hums. story over, for now.'); game = null; }
        } else ctx.print(`nothing here called "${item}".`);
        return true;
      }
      const m = input.match(/^(?:go\s+)?(north|south|east|west|n|s|e|w)$/);
      if (!m) { ctx.print('dungeon: go <dir>, look, take <item>, or inventory.'); return true; }
      const dirMap = { n: 'north', s: 'south', e: 'east', w: 'west' };
      const dir = dirMap[m[1]] || m[1];
      const next = room.exits[dir];
      if (!next) { ctx.print('dungeon: no way through there.'); return true; }
      data.room = next;
      ctx.print(DUNGEON_ROOMS[next].desc);
      return true;
    },
  },

  sudoku: {
    init() {
      const solution = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]];
      const board = [[1, 0, 0, 4], [0, 4, 1, 0], [0, 1, 4, 0], [4, 0, 0, 1]];
      return { board, solution };
    },
    render(ctx, intro) {
      if (intro) ctx.print('sudoku: 4x4. `sudoku set r c v` (1-4 each). `stop` to bail.');
      for (const row of game.data.board) ctx.print(row.map((v) => v || '.').join(' '));
    },
    move(raw, args, ctx) {
      const parts = raw.trim().split(/\s+/);
      if (parts[0].toLowerCase() !== 'set' || parts.length !== 4) { ctx.print('sudoku: `set r c v`, 1-4 each.'); return true; }
      const r = Number(parts[1]);
      const c = Number(parts[2]);
      const v = Number(parts[3]);
      if (![r, c, v].every((n) => Number.isInteger(n) && n >= 1 && n <= 4)) { ctx.print('sudoku: r, c, v must be 1-4.'); return true; }
      const { board, solution } = game.data;
      if (board[r - 1][c - 1]) { ctx.print('sudoku: that cell is already set.'); return true; }
      if (solution[r - 1][c - 1] !== v) { ctx.print('sudoku: not quite.'); return true; }
      board[r - 1][c - 1] = v;
      this.render(ctx, false);
      if (board.every((row) => row.every(Boolean))) { ctx.print('sudoku: solved.'); game = null; }
      return true;
    },
  },

  snake: {
    init() {
      const size = 9;
      const body = [[4, 4], [4, 3], [4, 2]];
      return { size, body, dir: 'right', apple: spawnApple(size, body), score: 0 };
    },
    render(ctx, intro) {
      if (intro) ctx.print('snake: move with u/d/l/r, one step per command. `stop` to bail.');
      printSnake(ctx, game.data);
    },
    move(raw, args, ctx) {
      const dirs = { u: 'up', d: 'down', l: 'left', r: 'right', up: 'up', down: 'down', left: 'left', right: 'right' };
      const dir = dirs[raw.trim().toLowerCase()];
      if (!dir) { ctx.print('snake: u, d, l, or r.'); return true; }
      const opp = { up: 'down', down: 'up', left: 'right', right: 'left' };
      const { data } = game;
      if (data.body.length > 1 && dir === opp[data.dir]) { ctx.print("snake: can't reverse into yourself."); return true; }
      data.dir = dir;
      const [hy, hx] = data.body[0];
      const delta = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
      const nh = [hy + delta[0], hx + delta[1]];
      const dead = nh[0] < 0 || nh[1] < 0 || nh[0] >= data.size || nh[1] >= data.size
        || data.body.some(([y, x]) => y === nh[0] && x === nh[1]);
      if (dead) {
        printSnake(ctx, data);
        ctx.print(`snake: dead. score ${data.score}.`);
        game = null;
        return true;
      }
      data.body.unshift(nh);
      if (nh[0] === data.apple[0] && nh[1] === data.apple[1]) {
        data.score++;
        data.apple = spawnApple(data.size, data.body);
      } else {
        data.body.pop();
      }
      printSnake(ctx, data);
      return true;
    },
  },

  pong: {
    init() { return { w: 10, h: 6, py: 2, oy: 2, ball: [2, 5], vel: [pick([-1, 1]), -1], score: 0, misses: 0 }; },
    render(ctx, intro) {
      if (intro) ctx.print('pong: move with u/d, hold with s. `stop` to bail.');
      printPong(ctx, game.data);
    },
    move(raw, args, ctx) {
      const cmd = { u: 'up', d: 'down', s: 'stay', up: 'up', down: 'down', stay: 'stay' }[raw.trim().toLowerCase()];
      if (!cmd) { ctx.print('pong: u, d, or s.'); return true; }
      const { data } = game;
      if (cmd === 'up') data.py = Math.max(0, data.py - 1);
      if (cmd === 'down') data.py = Math.min(data.h - 2, data.py + 1);
      if (data.ball[0] < data.oy) data.oy = Math.max(0, data.oy - 1);
      else if (data.ball[0] > data.oy) data.oy = Math.min(data.h - 2, data.oy + 1);
      const result = stepPong(data);
      printPong(ctx, data);
      if (result === 'miss') {
        data.misses++;
        ctx.print(`pong: missed. (${data.misses}/5)`);
        data.ball = [rint(0, data.h - 1), Math.floor(data.w / 2)];
        data.vel = [pick([-1, 1]), -1];
        if (data.misses >= 5) { ctx.print(`pong: game over. score ${data.score}.`); game = null; }
      } else if (result === 'score') {
        data.score++;
        ctx.print(`pong: point. score ${data.score}.`);
        data.ball = [rint(0, data.h - 1), Math.floor(data.w / 2)];
        data.vel = [pick([-1, 1]), 1];
      }
      return true;
    },
  },

  tetris: {
    init() { return { w: 6, h: 10, grid: Array.from({ length: 10 }, () => Array(6).fill(0)), score: 0 }; },
    render(ctx, intro) {
      if (intro) ctx.print('tetris: drop a block into a column, `tetris <col 1-6>`. clear full rows. `stop` to bail.');
      printTetris(ctx, game.data);
    },
    move(raw, args, ctx) {
      const col = Number(raw.trim());
      const { data } = game;
      if (!Number.isInteger(col) || col < 1 || col > data.w) { ctx.print(`tetris: pick a column 1-${data.w}.`); return true; }
      const c = col - 1;
      let landed = -1;
      for (let y = data.h - 1; y >= 0; y--) {
        if (!data.grid[y][c]) { data.grid[y][c] = 1; landed = y; break; }
      }
      if (landed === -1) {
        printTetris(ctx, data);
        ctx.print(`tetris: game over. score ${data.score}.`);
        game = null;
        return true;
      }
      const before = data.grid.length;
      data.grid = data.grid.filter((row) => !row.every(Boolean));
      const cleared = before - data.grid.length;
      while (data.grid.length < data.h) data.grid.unshift(Array(data.w).fill(0));
      if (cleared) { data.score += cleared; ctx.print(`tetris: cleared ${cleared} row(s).`); }
      printTetris(ctx, data);
      return true;
    },
  },
};
