// terminal-dispatch.js — command dispatcher for the mario0318 terminal
// Spec: TERMINAL_SPEC.md §5 (registry), §6 (voice), §7 (applet contract)
//
// Contract with terminal.js (the host):
//   respond(command, args, ctx)
//     command : registry entry ({ name, ui, applet?, ... }) or null if unresolved
//     args    : string[] — tokens after the command name
//     ctx     : host-provided capability object:
//       rawInput        : the exact trimmed line the user typed
//       print(text)     : append one line to #out via textContent
//       openPortal(id)  : open <dialog> portal with named content
//       openPanel(key, data?) : lazy-load applet module, mount in panel host
//       openInlineApplet(key) : mount inline applet under current line
//       closeAll()      : close any open portal/panel, unmount applet
//       clearLog()      : wipe #out
//       logHasContent() : boolean
//       anyUiOpen()     : boolean
//       navigate(path)  : move to another first-party interface
//       soundcloud      : { tracks: []|null, pickRandom(): {title, url} }
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
export function respond(command, args, ctx) {
  // A running mini-game owns input ahead of the registry — except the two
  // universal UI escapes, which must always work no matter what's active.
  if (isGameActive() && !(command && (command.name === 'clear' || command.name === 'close'))) {
    const raw = ctx.rawInput.trim();
    if (gameInput(raw, raw.split(/\s+/).slice(1), ctx)) return true;
  }

  if (!command) {
    const raw = ctx.rawInput.trim();
    const normalized = raw.toLowerCase().replace(/\s+/g, ' ');
    if (normalized === 'orbit' || normalized === 'open orbit' || normalized === 'three body') {
      const line = pickLine('easter', 'orbit');
      if (line) ctx.print(line);
      ctx.navigate?.('/orbital.html');
      return true;
    }
    const line = pickEaster(raw) || pickWordChatter(raw) || pickChatter(raw);
    if (line) {
      ctx.print(line);
      return false;
    }
    if (respondAssistant(raw, ctx)) return true;

    const unknown = formatLine(pickLine('unknown'), { input: raw });
    if (unknown) ctx.print(unknown);
    return false;
  }

  switch (command.name) {
    case 'help': {
      if (args[0] === 'keys') {
        for (const l of helpKeysLines()) ctx.print(l);
        return true;
      }
      const line = pickLine('help');
      if (line) ctx.print(line);
      printHelpList(ctx);
      return true;
    }

    case 'projects': {
      say(ctx, 'projects');
      ctx.openPortal('projects');
      return true;
    }

    case 'play': {
      if (args[0] === 'list') {
        const sc = ctx.soundcloud;
        if (!sc || !sc.tracks || sc.tracks.length === 0) {
          say(ctx, 'play', 'empty');
          return true;
        }
        say(ctx, 'play', 'list');
        ctx.openPortal('play-list', sc.tracks);
        return true;
      }
      const sc = ctx.soundcloud;
      if (!sc || !sc.tracks || sc.tracks.length === 0) {
        say(ctx, 'play', 'empty');
        return true;
      }
      const track = sc.pickRandom();
      const line = formatLine(pickLine('play'), { title: track.title });
      if (line) ctx.print(line);
      ctx.openPanel('soundcloud', track);
      return true;
    }

    case 'analemma': {
      say(ctx, 'analemma', ctx.analemmaLive ? 'default' : 'teaser');
      ctx.openPanel('analemma');
      return true;
    }

    case 'dots': {
      say(ctx, 'easter', 'dotsLabOpen');
      ctx.openInlineApplet('dots-lab');
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

function printHelpList(ctx) {
  ctx.print('');
  const listed = registry.filter((c) => c.listed);
  const pad = Math.max(...listed.map((c) => c.name.length), 8) + 4;
  for (const c of listed) {
    ctx.print(`  ${c.name.padEnd(pad)}${c.desc || ''}`);
  }
  ctx.print('  help keys'.padEnd(pad + 2) + 'keyboard stuff');
  ctx.print('');
  ctx.print("there's more. three bodies are still in orbit.");
}
