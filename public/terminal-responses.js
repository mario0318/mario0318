// terminal-responses.js — voice layer for the mario0318 terminal
// Spec: TERMINAL_SPEC.md §6 / §6.1
// Rules: lowercase, terse, dry. dispatcher fills placeholders; applets never format.
// All strings printed via ctx.print -> textContent. No HTML anywhere in here.

import { assistantResponsePools } from './terminal-responses-assistant.js';

let responsePools = {
  help: {
    default: [
      'some things you can ask this thing to do. not all of them, on purpose.',
      "here's a small slice of what works. the rest you'll find the usual way: typing.",
      "minimal tour coming up. if you're the exhaustive type, you're in the wrong terminal.",
    ],
    keys: [
      'keyboard things:',
      '  enter      run the line',
      '  tab        complete, not move focus',
      '  esc        escape, then tab to move focus',
      '  esc again  close panels and portals',
      'reduced-motion and screen readers get the same commands. the dots behave differently, not the keys.',
    ],
  },

  projects: {
    default: [
      "opening projects. they took a while; this won't.",
      'projects coming up. things that escaped the notebook.',
      'loading the things that actually shipped.',
    ],
  },

  play: {
    default: [
      'dealing you: {title}',
      "today's draw from the vault: {title}",
      'the vault picked one: {title}',
    ],
    list: [
      'listing the vault instead of spinning it.',
      'switching to the catalog. pick your own noise.',
    ],
    empty: [
      "vault's quiet. soundcloud is either sulking or the list is empty.",
      "couldn't get a track list. try again later. the silence is not a feature.",
    ],
  },

  analemma: {
    default: [
      'sending you over to analemma.',
      "studio's up. panel's taking you there.",
      'opening analemma in the side channel.',
    ],
    teaser: [
      "analemma's slot is here. the studio's catching up.",
      'panel is a teaser for now. the studio moves in later.',
    ],
  },

  contact: {
    default: [
      'opening ways to reach in.',
      'bringing up contact things. you talk, the site listens.',
      'portal for reaching out, coming up.',
    ],
  },

  clear: {
    default: [
      'screen swept. the terminal remembers more than it shows.',
      "cleared. the past lines are gone; the state isn't.",
      'log wiped. dots and commands stay exactly how they were.',
    ],
    nothing: ['nothing much to clear, but it still felt right.'],
  },

  close: {
    default: [
      "closed that. terminal's back on primary duty.",
      'panel shut. prompt has the floor again.',
      "portal's gone. the shell stayed.",
    ],
    nothing: ['nothing open to close. bold move anyway.'],
  },

  unknown: {
    default: [
      'no idea what that means. respect the attempt though.',
      "that's not a thing. yet.",
      'tried it. nothing happened. suspicious.',
      'the dots looked at each other. nothing.',
      '{input}: command not found. story of its life.',
      'whatever that was, the terminal shrugged.',
      'typed it, ran it, reality declined.',
      'the command table stared at that string and stayed quiet.',
    ],
  },

  easter: {
    whoami: [
      "that's the question, isn't it.",
      "labels are cheap. behavior's more expensive.",
    ],
    sudo: [
      'absolutely not.',
      'still no. the terminal admires the attempt, not the plan.',
    ],
    exit: [
      "you can't leave. kidding. it's a website. close the tab.",
      'still a website. still exitless.',
    ],
    rmrf: ['bold. no.', 'ambitious, but the filesystem here is imaginary.'],
    hello: ['hey.', 'hey. typing already puts you in the top percentile.'],
    fortyTwo: ['yes.', 'agreed. not elaborating.'],
    dotsLabOpen: [
      "lab's open. try not to break the dots. you can, but don't.",
      'wiring the dots directly to you. sliders first, chaos later.',
      'dots-lab online. the status lights just became your problem.',
    ],
    dotsLabReset: ['dots back to default. the breathing is normal again.'],
    orbit: [
      'three bodies found. opening the quiet channel.',
      'orbital backup responding. mind the gravity.',
      'old signal acquired. stepping sideways.',
    ],
    mom: [
      'raised two sons on hard work and stubborn love. everything built here traces back to that.',
      "resilience isn't a personality trait in this family. it's inherited, and she's the source.",
      'the kind of love that outworks everything else. still catching up to it.',
    ],
    brother: [
      "go-getter. the kind of ambition that doesn't ask permission.",
      "funny in a way that takes a second to land, then doesn't leave.",
      'ambition and a sense of humor that never quite lets itself be pinned down.',
    ],
  },

  // loose keyword reactions to whatever wasn't a command. dumber than it looks,
  // matched on plain substrings/regex, no model, no memory past this line.
  chatter: {
    farewell: [
      'already? fine. the tab will still be here.',
      'bye. this refreshes and forgets everything anyway.',
      'leaving noted. nothing was saved.',
    ],
    thanks: [
      'sure.',
      "don't mention it. literally, there's nothing to mention.",
      'noted. gratitude logged nowhere.',
    ],
    identity: [
      'a terminal. text pretending to be a machine.',
      'not going to answer that one directly.',
      'the interface is text. the system is pretending to be larger than it is.',
    ],
    wellbeing: [
      'running. no complaints from the process table.',
      'stable. same as every other tab.',
      "fine. it's a website, hard to have a bad day.",
    ],
    compliment: [
      'noted, with mild suspicion.',
      "appreciated. don't let it go to the cone's head.",
      'thanks. the dots heard that too.',
    ],
    insult: [
      "fair. it's still not going to do anything about it.",
      'heard. filed under feedback, never read.',
      "that's valid. type `help` when you're done.",
    ],
    helpseek: [
      'type `help` for the short version.',
      'start with `help`. the rest is `man`.',
      '`help` exists for exactly this.',
    ],
    place: [
      'a personal terminal. some things here got built, most got typed.',
      "mario0318's corner. type `about` for the short version.",
      "you're inside a website pretending to be a shell.",
    ],
    question: [
      "that's a real question. this isn't a real answer machine. try `help`.",
      'questions go to `help` or `man`. this terminal just reacts.',
      'good question. wrong terminal for it.',
    ],
  },

  // single-word reactions — exact-match on the whole line, not substrings.
  // aliases (build->builder, stuck->lost, ...) are resolved in pickWordChatter()
  // before this pool is even consulted, so every word below is a canonical key.
  words: {
    builder: [
      'as long as something gets built, the prompt remembers.',
      'most people talk about building. fewer commit.',
      'the stack cares more about artifacts than titles.',
      'ship first, describe it later.',
    ],
    systems: [
      'systems notice patterns you repeat, not words you type.',
      'if you keep poking the same node, it starts to hum.',
      'everything here is wired for long-term failure tolerance.',
      'local process is a small slice of the diagram.',
    ],
    signal: [
      'signal costs more than noise, so it stays sparse.',
      'the meter here reads past intent, not syntax.',
      'if you are looking for a sign, this prompt is not it.',
      'strong signals usually arrive unannounced.',
    ],
    code: [
      'the parser does not care why you typed it.',
      'code is judged at runtime, not at idea time.',
      'syntax is the easy part. semantics leak.',
      'every keystroke here is an uncommitted diff.',
    ],
    ship: [
      'shipping is just deleting excuses in bulk.',
      'if it is not deployed, it is still a hobby.',
      'latency cares about artifacts, not hopes.',
      'the log only remembers what left the machine.',
    ],
    design: [
      'design here is mostly constraint, not aesthetics.',
      'good layouts survive bad operators.',
      'interfaces outlive intentions.',
      'the graph is already drawn. you are just tracing.',
    ],
    product: [
      'products are just decisions fossilized in code.',
      'roadmaps collapse into one binary question: used or ignored.',
      'feature sets age faster than dependencies.',
      "pricing is outside this shell's jurisdiction.",
    ],
    idea: [
      'ideas arrive loud and leave quiet.',
      'this machine only tracks the ones that compile.',
      'most ideas die in staging.',
      'the backlog is full. new entries require proof.',
    ],
    project: [
      'projects end when the last cron stops.',
      'scope creep looks smaller from inside a prompt.',
      'every project here is one failed deploy away from archive.',
      'git remembers more than anyone else on the team.',
    ],
    startup: [
      'startups are just while loops with investor logging.',
      'burn rate is not exposed as an environment variable.',
      'this shell has watched more pivots than product launches.',
      'founder mode usually ends at oom.',
    ],
    hack: [
      'hacks become infrastructure when nobody cleans them up.',
      'temporary fixes are marked permanent by uptime.',
      'if it works, someone will depend on it.',
      'the ugliest path often ships first.',
    ],
    deploy: [
      'deployment is just trust applied to new bytes.',
      'rollback is the real deployment strategy.',
      'every deploy is a small wager against entropy.',
      'health checks never tell the whole story.',
    ],
    scale: [
      'scaling breaks the parts you forgot to monitor.',
      'bottlenecks know you before you know them.',
      'horizontal fixes hide vertical regrets.',
      'nothing scales like accumulated duct tape.',
    ],
    portfolio: [
      'portfolios impress humans, not kernels.',
      'this shell only tracks shipped artifacts.',
      'the best line item is still running somewhere.',
      'bullet points decay faster than logs.',
    ],
    resume: [
      'resumes are plaintext bragging with selective deletes.',
      'this prompt has seen more real incidents than any cv.',
      'titles compress badly into reality.',
      'career paths look linear only in hindsight.',
    ],
    hire: [
      'hiring through a terminal is one way to filter.',
      "the best builders rarely type 'hire' first.",
      'contracts outlive enthusiasm.',
      'headcount is not a configuration flag.',
    ],
    freelance: [
      'freelance mode toggles between feast and timeout.',
      'invoices are just structured requests for trust.',
      'this shell does not chase payments.',
      'clients exit faster than codebases.',
    ],
    client: [
      'clients remember outages more than features.',
      'every new client adds one hidden cronjob.',
      'their requirements file is never complete.',
      'scope is a negotiation, not a config.',
    ],
    brand: [
      'brands are just repeated outputs over time.',
      'the logo file lives elsewhere.',
      'reputation is cached but eventually invalidates.',
      'this terminal contributes quietly.',
    ],
    bug: [
      'bugs are just reality arguing with assumptions.',
      'the cone has seen worse.',
      'production issues rarely match the ticket description.',
      "every bug starts as somebody's clever idea.",
    ],
    feature: [
      'features are bugs with better marketing.',
      'flags grow faster than understanding.',
      'most feature requests hide a deeper problem.',
      'this shell cares more about impact than labels.',
    ],
    stack: [
      'stacks are just layered regrets.',
      'the deeper the stack, the slower the blame.',
      'every abstraction hides one unpleasant truth.',
      'versioning is how stacks confess history.',
    ],
    api: [
      'apis are agreements disguised as endpoints.',
      'this prompt respects rate limits more than feelings.',
      'breaking changes return more than status codes.',
      'documentation expires before tokens do.',
    ],
    backend: [
      'backend is where all the decisions hide.',
      'latency starts and ends here.',
      'logs from this side rarely hit dashboards.',
      'uptime is the only ok metric.',
    ],
    frontend: [
      "frontend work surfaces other people's choices.",
      'pixels do not reach this shell.',
      'this layer trusts the request more than the click.',
      "render loops start with someone's impatience.",
    ],
    database: [
      'databases remember everything you regret and nothing you meant.',
      'indexes are quiet until they are missing.',
      'schema changes measure courage.',
      'backups are the only honest mirror.',
    ],
    server: [
      'servers are just machines that stayed on too long.',
      'this one keeps its boundaries narrow.',
      'uptime looks brave until the first kernel panic.',
      'most servers want fewer humans.',
    ],
    cloud: [
      "the cloud is just other people's terminals.",
      'billing details are omitted by design.',
      'latency is shared. responsibility is not.',
      'this prompt still thinks in bare metal.',
    ],
    ai: [
      'ai is just patterns pretending to be insight.',
      'models do not care about your prompt tone.',
      'training runs feel like rituals from here.',
      'this shell logs outputs, not opinions.',
    ],
    model: [
      'models age the moment they are shipped.',
      'weights are just frozen guesses.',
      'version numbers mean less than datasets.',
      'this environment does not host training.',
    ],
    prompt: [
      'prompts are arguments with invisible listeners.',
      'you are not the first to try that word here.',
      'the parser notes intent, then shrugs.',
      'verbosity does not improve outcomes.',
    ],
    agent: [
      'agents act until a timeout says otherwise.',
      'this shell only trusts what exits cleanly.',
      'autonomy here is heavily sandboxed.',
      'every agent is one misfire from revoke.',
    ],
    automation: [
      'automation replaces discipline until it fails.',
      'cronjobs are just rituals with timestamps.',
      'manual overrides leave the deepest scars.',
      'the quiet hours belong to scripts.',
    ],
    pipeline: [
      'pipelines break where monitoring is laziest.',
      'every stage pretends it is the important one.',
      'failed runs teach more than successful ones.',
      'the graph is held together by retries.',
    ],

    bored: [
      'boredom is just low signal at high uptime.',
      'you could ship instead of typing adjectives.',
      'idle loops are already covered by other commands.',
      'nothing changes until a commit does.',
    ],
    lost: [
      'if you are lost, the prompt is not the map.',
      'paths here are explicit. your intent is not.',
      'try an actual command instead of feelings.',
      'direction is a human problem.',
    ],
    cool: [
      'cool is a client-side concept.',
      'this shell stays at room temperature.',
      'style does not propagate through stdin.',
      'approval is outside this process group.',
    ],
    weird: [
      'weird is relative. logs say otherwise.',
      'unusual input is still just bytes.',
      'you have not seen the real edge cases.',
      'this system has a higher bar for strange.',
    ],
    creepy: [
      'machines do not find you creepy.',
      'risk is measured in access, not vibes.',
      'the scariest parts are not exposed here.',
      'if this feels off, good. stay alert.',
    ],
    fun: [
      'fun usually starts after something ships.',
      'this interface optimizes for clarity, not entertainment.',
      'you can wire fun on top if you insist.',
      'the runtime is indifferent to your mood.',
    ],
    boring: [
      'boring is another word for stable.',
      'most real systems aspire to boring.',
      'outages are exciting. you do not want those.',
      'try chaos in staging, not here.',
    ],
    test: [
      'tests are welcome. assertions, not adjectives.',
      'this prompt has survived plenty of test input.',
      'if you are testing, watch what breaks, not what prints.',
      'coverage here is psychological, not numeric.',
    ],
    why: [
      "the kernel does not answer 'why'.",
      'reasoning layer lives above this prompt.',
      'if you need meaning, grep elsewhere.',
      "this shell focuses on 'what' and 'how'.",
    ],
    wow: [
      'reaction noted. state unchanged.',
      'the system metrics did not move.',
      'surprise does not persist in logs.',
      'continue if you have actual work.',
    ],
    damn: [
      'swearing at terminals rarely helps.',
      'entropy respects no profanity.',
      'log files do not quote you.',
      'take it out on a branch instead.',
    ],
    lol: [
      'laughter is not logged.',
      'humor layer wrapped around stdin, not stdout.',
      'the machine remains stone-faced.',
      'keep typing if you are serious.',
    ],
    nice: [
      'nice is a scheduling flag, not a compliment.',
      'priority changes require more than adjectives.',
      'cpu shares stay indifferent.',
      'if you want change, alter a config.',
    ],
    ok: [
      'acknowledged. nothing changed.',
      'consent does not modify state.',
      'this shell waits for actual instructions.',
      'silence is the default response.',
    ],
    sure: [
      'agreement detected. impact pending.',
      'promises here expire quickly.',
      "without a command, 'sure' is noise.",
      'concurrence does not flip bits.',
    ],
    yo: [
      'greetings are cheap. cycles are not.',
      'this is not a chat buffer.',
      'handshakes happen at protocol level.',
      'move from salutations to instructions.',
    ],
    sup: [
      'status signals exist elsewhere.',
      'the prompt has no feelings to report.',
      'idle state persists.',
      'if you want activity, trigger it.',
    ],

    vault: [
      'the vault is not listed in any directory.',
      'keys appear only after you stop asking.',
      'most entries are older than this hostname.',
      'access is earned, not requested.',
    ],
    orbital: [
      'orbital paths here are mostly conceptual.',
      'objects drift, logs stay.',
      'gravity is modeled by cronjobs.',
      'you are currently on a low-inclination track.',
    ],
    gravity: [
      'gravity keeps stray processes from escaping.',
      'everything you start eventually falls somewhere.',
      'escape velocity is a rare configuration.',
      'leaks follow the same pull.',
    ],
    static: [
      'static builds hum louder close to midnight.',
      'noise sits on the surface. static runs deeper.',
      'the channel here is already occupied.',
      'tuning is discouraged.',
    ],
    reflection: [
      'reflection here is literal, not emotional.',
      'the cone surface stores more than light.',
      'you are being logged, not judged.',
      'mirrors prefer truth over comfort.',
    ],
    mirror: [
      'mirrors see more retries than successes.',
      'angles matter. most people stand wrong.',
      'this prompt is another surface.',
      'what you type is a weak reflection.',
    ],
    glow: [
      'glow is for cones, not users.',
      'low-level light indicates ongoing work.',
      'if it stops glowing, start worrying.',
      'the brightest signals stay quiet.',
    ],
    dark: [
      'darkness is mostly unmonitored space.',
      'silent intervals hide the interesting events.',
      'not everything gets a status line.',
      'you are looking at the visible fraction.',
    ],
    light: [
      'light here is diagnostic, not decorative.',
      'each blink means someone tried something.',
      'overexposed logs tell boring stories.',
      'true clarity is usually dim.',
    ],
    quiet: [
      'quiet channels are rarely truly empty.',
      'low noise does not mean low risk.',
      'someone else is listening upstream.',
      'silence is a kind of signal.',
    ],
    noise: [
      'noise eats more attention than outages.',
      'filters here are intentionally harsh.',
      'most input will be discarded.',
      'only patterns survive the trim.',
    ],
    wait: [
      'waiting is a core protocol.',
      'the system moves slower than your thoughts.',
      'timeouts protect against your impatience.',
      'some results are designed to arrive late.',
    ],
    patience: [
      'patience is a scarce resource in prod.',
      'this shell rewards people who have it.',
      'impatience correlates with incident count.',
      'linger if you want better data.',
    ],
    drift: [
      'drift happens while everyone is busy shipping.',
      'configs slide off spec quietly.',
      'the cone notices long before dashboards.',
      'alignment is temporary.',
    ],
    focus: [
      'focus is a scarce thread.',
      'if you split attention, the system will not.',
      'logs reward sustained curiosity.',
      'close other terminals before you try deep work.',
    ],
    chaos: [
      'chaos is already running in a limited container.',
      'unexpected behavior is part of the design.',
      'we only surface a safe slice.',
      'full chaos mode is not user-facing.',
    ],
    order: [
      'order emerges after enough incidents.',
      'playbooks are crystallized panic.',
      'this environment leans toward structured failure.',
      'nothing here is as tidy as it prints.',
    ],
    control: [
      'control is mostly an illusion behind a keyboard.',
      'permissions hint at power, not guarantee it.',
      'the system retains final say.',
      'you own your inputs, not the outcome.',
    ],
    trust: [
      'trust accumulates slowly and disappears instantly.',
      'the shell extends minimal trust by default.',
      'keys are more important than words here.',
      'audit trails remember what trust forgot.',
    ],
    real: [
      'real work rarely announces itself.',
      'metrics decide what is real, not adjectives.',
      'this prompt has seen more than it reports.',
      'if you doubt it, ship and watch.',
    ],
    fake: [
      'auth layers deal with impersonation quietly.',
      'the system flags anomalies without commentary.',
      'labels are less useful than behaviors.',
      'you know what you are, the shell does not care.',
    ],
    truth: [
      'truth is versioned like any other artifact.',
      'logs are closer than opinions.',
      'queries reveal more than declarations.',
      'the cone prefers raw data.',
    ],
    lie: [
      'machines detect inconsistencies faster than people.',
      'lying to logs is a losing game.',
      'event streams eventually expose you.',
      'this prompt does not do forgiveness.',
    ],
    mystery: [
      'mystery keeps people typing into empty prompts.',
      'some details are intentionally undocumented.',
      'the interesting parts are not on display.',
      'curiosity is the only allowed exploit.',
    ],
    riddle: [
      'every riddle here ends in a stack trace.',
      'answers usually look like config diffs.',
      'if you solve it, nothing special happens.',
      'puzzles are for you, not the system.',
    ],
    puzzle: [
      'puzzles are just misconfigured expectations.',
      'the graph is complete; you are reconstructing it.',
      'solutions rarely get a banner.',
      'the reward is understanding, not fireworks.',
    ],
    game: [
      'games are sporadically wired into this shell.',
      'if you want one, find the right command.',
      'this layer does not hand out hints.',
      'winning changes less than you think.',
    ],
    sound: [
      'sound lives in another process group.',
      'this interface assumes silence.',
      'beats exist, but not on this channel.',
      'you are tuned to the text-only stream.',
    ],
    track: [
      'tracks overlap when you stay too long.',
      'paths leave residue in history.',
      'only some traces are visible.',
      'if you follow the right track, it loops.',
    ],
    beat: [
      'beats are stored as timing, not music.',
      'rhythm in logs is more useful than songs.',
      'incidents have a recognizable pulse.',
      'you can hear it if you stare long enough.',
    ],
    rhythm: [
      'rhythm emerges from recurring failures.',
      'cadence of deploys matters more than slogans.',
      'this shell keeps the tempo steady.',
      'you are either in sync or in the way.',
    ],
  },

  ...assistantResponsePools,
};

// aliases resolve to a canonical key in responsePools.words above. "stack" is
// intentionally absent here — it's a primary word, not an alias of "systems".
const WORD_ALIASES = {
  build: 'builder',
  engineer: 'builder',
  developer: 'builder',
  prototype: 'builder',
  launch: 'ship',
  'product-market fit': 'product',
  mvp: 'product',
  'side project': 'project',
  'startup life': 'startup',
  hiring: 'hire',
  job: 'freelance',
  hacker: 'hack',

  stuck: 'lost',
  confused: 'lost',
  testing: 'test',
  haha: 'lol',
  okay: 'ok',
  alright: 'ok',
  scary: 'creepy',
};

// ---------------------------------------------------------------------------
// rotation: per-pool sequential, random start per page load, no repeat until
// pool exhausts within a session. state is one Map; nothing persisted.
// ---------------------------------------------------------------------------

const responseIndex = new Map();
const responseRecent = new Map();
let selectionSettings = { selectionMode: 'sequential', noRepeatWindow: 0 };

export function configureResponses(pools = {}, settings = {}) {
  for (const [key, value] of Object.entries(pools)) {
    if (Array.isArray(value)) {
      responsePools[key] = { ...(responsePools[key] || {}), default: value };
    } else if (value && typeof value === 'object') {
      responsePools[key] = { ...(responsePools[key] || {}), ...value };
    }
  }
  selectionSettings = { ...selectionSettings, ...settings };
  responseIndex.clear();
  responseRecent.clear();
}

export function pickLine(poolKey, variant = 'default') {
  const group = responsePools[poolKey];
  if (!group) return null;
  const rawPool = group[variant] || group.default;
  if (!rawPool || rawPool.length === 0) return null;
  const pool = rawPool
    .map((item) => typeof item === 'string' ? { text: item, weight: 1, enabled: true } : item)
    .filter((item) => item && item.enabled !== false && typeof item.text === 'string');
  if (pool.length === 0) return null;

  const key = `${poolKey}:${variant}`;
  if (selectionSettings.selectionMode === 'random' || selectionSettings.selectionMode === 'weighted') {
    const recent = responseRecent.get(key) || [];
    const available = pool.filter((item) => !recent.includes(item.text));
    const candidates = available.length ? available : pool;
    let picked;
    if (selectionSettings.selectionMode === 'weighted') {
      const total = candidates.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
      let cursor = Math.random() * (total || candidates.length);
      picked = candidates[candidates.length - 1];
      for (const item of candidates) {
        cursor -= total ? Math.max(0, Number(item.weight) || 0) : 1;
        if (cursor <= 0) { picked = item; break; }
      }
    } else {
      picked = candidates[Math.floor(Math.random() * candidates.length)];
    }
    const windowSize = Math.max(0, Number(selectionSettings.noRepeatWindow) || 0);
    responseRecent.set(key, [...recent, picked.text].slice(-windowSize));
    return picked.text;
  }
  if (!responseIndex.has(key)) {
    responseIndex.set(key, Math.floor(Math.random() * pool.length));
  }
  const idx = responseIndex.get(key);
  responseIndex.set(key, idx + 1);
  return pool[idx % pool.length].text;
}

// function-form replacement: `$` sequences in track titles or typed input
// must never be interpreted as replacement patterns.
export function formatLine(line, ctx = {}) {
  if (!line) return null;
  return line
    .replace('{title}', () => ctx.title ?? '')
    .replace('{input}', () => ctx.input ?? '');
}

// help `keys` block is printed verbatim, in order, not rotated.
export function helpKeysLines() {
  return responsePools.help.keys.slice();
}

// ---------------------------------------------------------------------------
// easter eggs: matched on raw trimmed input BEFORE registry lookup.
// returns a line or null. exact matches except sudo prefix.
// ---------------------------------------------------------------------------

export function pickEaster(rawInput) {
  const raw = (rawInput || '').trim().toLowerCase();
  if (raw === 'whoami') return pickLine('easter', 'whoami');
  if (raw === 'sudo' || raw.startsWith('sudo ')) return pickLine('easter', 'sudo');
  if (raw === 'exit' || raw === 'quit' || raw === ':q') return pickLine('easter', 'exit');
  if (raw === 'rm -rf /' || raw === 'rm -rf /*') return pickLine('easter', 'rmrf');
  if (raw === 'hello' || raw === 'hi' || raw === 'hey') return pickLine('easter', 'hello');
  if (raw === '42') return pickLine('easter', 'fortyTwo');
  if (raw === 'wally' || raw === 'waleska') return pickLine('easter', 'mom');
  if (raw === 'joshua' || raw === 'josh') return pickLine('easter', 'brother');
  return null;
}

// ---------------------------------------------------------------------------
// chatter: loose, keyword-level reactions for whatever isn't a real command
// and isn't a listed easter egg. Plain substring/regex matching, checked in
// order, first hit wins. Not a conversation engine — a dumb reflex layer.
// ---------------------------------------------------------------------------

export function pickChatter(rawInput) {
  const raw = (rawInput || '').trim().toLowerCase();
  if (!raw) return null;
  if (/^(bye|goodbye|good ?night|see ya|cya|later)\b/.test(raw)) return pickLine('chatter', 'farewell');
  if (/\b(thanks|thank you|thx|ty)\b/.test(raw)) return pickLine('chatter', 'thanks');
  if (/(who are you|what are you|are you (real|alive|ai|a bot|human|sentient))/.test(raw)) return pickLine('chatter', 'identity');
  if (/(how are you|how'?s it going|how (are|you) doing)/.test(raw)) return pickLine('chatter', 'wellbeing');
  if (/(i love (you|this)|this is (cool|awesome|sick|great)|nice (site|terminal|work))/.test(raw)) return pickLine('chatter', 'compliment');
  if (/(fuck you|screw you|you suck|this sucks|stupid (thing|terminal|site))/.test(raw)) return pickLine('chatter', 'insult');
  if (/(help me|what can you do|what do you do)\b/.test(raw)) return pickLine('chatter', 'helpseek');
  if (/(what is this( place)?\??$|where am i)/.test(raw)) return pickLine('chatter', 'place');
  if (raw.endsWith('?')) return pickLine('chatter', 'question');
  return null;
}

// ---------------------------------------------------------------------------
// word chatter: exact-match on the whole trimmed line against responsePools.words,
// resolving through WORD_ALIASES first. Deliberately dumber than pickChatter —
// no substrings, no regex, just "is this line one specific word we know."
// ---------------------------------------------------------------------------

export function pickWordChatter(rawInput) {
  const raw = (rawInput || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!raw) return null;
  const key = responsePools.words[raw] ? raw : WORD_ALIASES[raw];
  if (!key) return null;
  return pickLine('words', key);
}
