# mario0318.com — Terminal Spec v1 ("Dark Instrument")

Canonical handoff doc. Claude owns: this spec, CSS, terminal copy, applet contracts.
Codex owns: Express routes (Diminauth, SoundCloud list), deploy.
Standing rule applies: verify live entry file + routing in mario0318-app before any file is touched. Nothing below assumes a filename that hasn't been confirmed against the repo.

Related: Diminauth v0 spec (single-user WebAuthn gate). This doc covers the PUBLIC experience; Diminauth only appears here as a dot color state.

---

## 1. Design tokens

```css
:root {
  /* surfaces */
  --bg:          #0a0b0d;   /* near-black, blue-leaning */
  --bg-pattern:  rgba(255,255,255,0.03); /* 3-dot tile fill */
  --surface:     #111318;   /* panels, portal sheets */
  --surface-hi:  #181b22;   /* hover rows, chips */

  /* text */
  --text:        #e8e4dc;   /* warm off-white */
  --text-dim:    #8a8f98;   /* prompts, timestamps, hints */
  --text-ghost:  #4a4f58;   /* placeholder, disabled */

  /* the only saturation on screen: the three dots */
  --dot-1:       #ff5c47;   /* ember */
  --dot-2:       #ffc14d;   /* amber */
  --dot-3:       #4dd8c7;   /* teal  */

  /* semantic (used sparingly, derived from dots) */
  --ok:          var(--dot-3);
  --warn:        var(--dot-2);
  --err:         var(--dot-1);
  --focus-ring:  var(--dot-3);

  /* motion */
  --t-fast: 120ms;
  --t-med:  240ms;
  --t-slow: 420ms;
  --ease:   cubic-bezier(.2,.9,.2,1);

  /* type */
  --mono: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
  --fs-body: clamp(14px, 1.6vw, 16px);
  --fs-small: 12px;
  --lh: 1.55;
}

@media (prefers-reduced-motion: reduce) {
  :root { --t-fast: 0ms; --t-med: 0ms; --t-slow: 0ms; }
}
```

Rules:
- No other saturated color may enter the UI. Applets inherit tokens; if an applet embeds third-party chrome (SoundCloud player), it sits inside a `--surface` frame so the outer world stays consistent.
- Contrast: `--text` on `--bg` is ~13:1. `--text-dim` on `--bg` is ~5.5:1 (passes AA for body). Never use `--text-ghost` for information, only decoration/placeholder.
- Zero webfont downloads by default: `ui-monospace` first. JetBrains Mono only if already self-hosted in the repo; do not add a font CDN.

Background pattern: single inline SVG tile (three 2px circles in triangle arrangement, fill `--bg-pattern`), tiled via `background-repeat`. Tile ~56×56px. It should be invisible on a glance and discovered on a stare.

---

## 2. The three dots — state machine

The dots are the entire status system. No text labels, no badges. Position: top-left header, 10px diameter, 8px gap.

| State | Behavior | Trigger |
|---|---|---|
| `idle` | Slow "breathing" — opacity 0.55→0.9, staggered 400ms per dot, 4s cycle | default |
| `listening` | Dots hold at full opacity, subtle 1px lift | input focused + non-empty |
| `working` | Left-to-right chase pulse, 900ms loop | command dispatched, awaiting result |
| `ok` | Single synchronized pulse to 1.0, settle to idle | command success |
| `err` | Dot 1 (ember) double-blink, others dim to 0.3 for 600ms | command failure / unknown |
| `panel` | Dots shrink 20% and dock tighter | applet panel open |
| `elevated` | Dot 3 (teal) holds a steady 2px outer glow | Diminauth session active |

Notes:
- `elevated` is deliberately unlabeled. To guests it's noise; to you it's the login indicator. Never explain it in help, comments, or copy.
- All states are CSS classes on the `.dots` container driven by one JS function `setDots(state)`. Keyframes in CSS, no rAF loops. Reduced motion: all states collapse to static opacity levels (idle 0.7, elevated glow stays — it's informational).

```
idle ⇄ listening → working → ok → idle
                          ↘ err → idle
panel overlays any state; elevated is a parallel flag (class), not a state.
```

---

## 3. DOM wireframe (with ARIA)

```html
<body>
  <!-- no-JS fallback: visible by default, hidden by terminal boot -->
  <nav id="fallback-nav" aria-label="Site navigation">
    <a href="/projects">projects</a> …
  </nav>

  <main id="term" class="term" hidden>
    <header class="term-head">
      <div class="dots" role="img" aria-label="status indicator">
        <span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span>
      </div>
    </header>

    <div id="out" class="term-out" role="log" aria-live="polite" aria-atomic="false">
      <!-- output lines appended as <div class="line"> via textContent ONLY -->
    </div>

    <form id="prompt" class="term-prompt">  <!-- NOTE: plain form ok here (not React) -->
      <span class="ps1" aria-hidden="true">~</span>
      <input id="cmd" type="text" autocomplete="off" autocapitalize="off"
             spellcheck="false" enterkeyhint="go"
             aria-label="terminal command input"
             placeholder="type something. or don't." />
    </form>

    <div id="chips" class="chips" role="listbox" aria-label="command suggestions">
      <!-- mobile-first suggestion chips, also shown on first visit desktop -->
    </div>
  </main>

  <dialog id="portal" class="portal" aria-labelledby="portal-title">
    <button class="portal-close" aria-label="close">×</button>
    <h2 id="portal-title"></h2>
    <div id="portal-body"></div>
  </dialog>

  <section id="panel" class="panel" hidden aria-label="applet panel">
    <div id="panel-mount"></div>
    <!-- when open, .term collapses to a docked mini prompt bar at bottom -->
  </section>
</body>
```

Accessibility hard rules:
- Output region is `role="log"` + `aria-live="polite"` — screen readers announce results without stealing focus.
- Focus never leaves `#cmd` after a command unless a portal/panel opens; `<dialog>` handles its own trap + Escape. Closing returns focus to `#cmd`.
- Every applet mount must be reachable by Tab and dismissible by Escape or typing `close` in the docked bar.
- Tab in the input = completion, NOT focus move. Provide Esc-then-Tab as the focus-escape path and note it in `help keys`.
- All output via `textContent`/`createTextNode`. `innerHTML` is banned in the terminal module. Applets render into their own mount and may use richer DOM, but never interpolate user input as HTML.

Layout:
- Desktop: terminal centered, max-width 76ch, generous vertical whitespace, output scrolls under a soft top fade mask.
- Mobile (<640px): full-bleed; prompt bar `position: sticky; bottom: 0` with `env(safe-area-inset-bottom)` padding; chips row above the prompt, horizontally scrollable with `scroll-snap-type: x proximity`.

---

## 4. Motion spec

| Element | Animation | Duration/ease |
|---|---|---|
| Output line entry | clip-path inset reveal left→right + 4px rise | `--t-med` `--ease` |
| Multi-line responses | lines stagger 40ms each, cap 8 (rest instant) | — |
| Portal sheet | translateY(24px)+fade in; scale(.98) fade out | `--t-slow` in, `--t-med` out |
| Panel open | panel slides up; terminal morphs to dock bar (height + translate, no layout thrash: transform/opacity only) | `--t-slow` |
| Chip tap | 2% scale press, ripple-free | `--t-fast` |
| Dot states | pure CSS keyframes per §2 | per state |
| Unknown command | output line does a 3px horizontal shiver once | `--t-fast` ×2 |

Performance rules: animate only `transform`, `opacity`, `clip-path`. No JS timers for typewriter effects. `content-visibility: auto` on old output lines past ~200 lines; hard cap output at 500 lines (drop oldest).

---

## 5. Command registry — public schema

Static file, e.g. `commands.public.json` (final path/name verified against repo conventions). Privileged registry is a separate server response post-Diminauth and is NOT referenced anywhere in public assets.

```json
{
  "version": 1,
  "commands": [
    {
      "name": "help",
      "aliases": ["?"],
      "desc": "some of what this thing does",
      "ui": "text",
      "category": "core",
      "listed": true
    },
    {
      "name": "projects",
      "aliases": ["ls", "work"],
      "desc": "things that got built",
      "ui": "portal",
      "category": "explore",
      "listed": true
    },
    {
      "name": "play",
      "aliases": ["sc", "music"],
      "desc": "random clip from the vault",
      "ui": "panel",
      "applet": "soundcloud",
      "category": "toys",
      "listed": true
    },
    {
      "name": "analemma",
      "aliases": ["studio"],
      "desc": "analemma studio",
      "ui": "panel",
      "applet": "analemma",
      "category": "toys",
      "listed": true
    },
    {
      "name": "dots",
      "desc": "mess with the dots",
      "ui": "inline-applet",
      "applet": "dots-lab",
      "category": "toys",
      "listed": false
    },
    {
      "name": "contact",
      "aliases": ["hi"],
      "desc": "reach out",
      "ui": "portal",
      "category": "core",
      "listed": true
    },
    {
      "name": "clear", "ui": "internal", "listed": false
    },
    {
      "name": "close", "ui": "internal", "listed": false
    }
  ]
}
```

Schema fields:
- `ui`: `text` | `portal` | `panel` | `inline-applet` | `internal`
- `applet`: module key → lazy `import(`/applets/${key}.js`)`
- `listed`: appears in `help`. Unlisted commands are the discovery layer.
- No `required_scope`, no rate limits, no server metadata in the public file. If a public command needs a server route (SoundCloud track list), the route path lives in the applet module, not the registry.

Parser: split on whitespace, first token lowercased → name/alias lookup, rest passed as `args[]` string array. No quoting/flag grammar in v1 (add only when an applet needs it). Unknown → witty fallback pool.

---

## 6. Terminal voice & copy

Personality: dry, terse, slightly amused. Lowercase throughout. Never apologetic, never corporate. The terminal knows more than it says.

Boot sequence (fast, ~1.2s total, skippable by keypress):
```
mario0318
· · ·
ready.
```

`help` output (deliberately incomplete):
```
some things you can type:

  projects     things that got built
  play         random clip from the vault
  analemma     analemma studio
  contact      reach out
  help keys    keyboard stuff

there's more. this list isn't it.
```

Unknown-command fallback pool (rotate, no repeat until exhausted):
```
no idea what that means. respect the attempt though.
that's not a thing. yet.
tried it. nothing happened. suspicious.
the dots looked at each other. nothing.
[args echoed]: command not found. story of its life.
```

Easter responses (all `listed: false`, zero server cost):
```
whoami    → that's the question, isn't it.
sudo *    → absolutely not.
exit      → you can't leave. kidding. it's a website. close the tab.
rm -rf /  → bold. no.
hello     → hey.
42        → yes.
dots      → opens dots-lab (live sliders: orbit speed, gap, hue-shift — writes CSS vars only)
```

Denied/hidden privileged commands: identical output to unknown commands. No "requires elevation," no different timing, no tells. (This supersedes the earlier framework doc's "explainability for denied commands" — correct for enterprise, wrong for a personal site where the existence of an admin layer is itself private.)

---

## 7. Applet contract

One interface. Everything future drops in here.

```js
// /applets/<key>.js
export default {
  key: "soundcloud",
  title: "the vault",
  ui: "panel",                       // must match registry
  async mount(el, ctx) {
    // el: mount node inside #panel-mount (or inline line for inline-applet)
    // ctx: { args, print(text), close(), tokens }  — print writes to terminal log
  },
  unmount() { /* cleanup: abort fetches, clear timers, revoke object URLs */ }
}
```

Contract rules:
- Applets are lazy ES modules. No applet code loads before its first invocation.
- Applets never touch the terminal DOM directly — only `ctx.print()` and their own mount.
- Applets inherit tokens via CSS custom properties; they may define scoped extras but not new saturated hues (§1 rule).
- `unmount()` is mandatory and must leave zero listeners/timers. Terminal calls it on `close`, on a new panel opening, and on `pagehide`.
- Third-party embeds (iframes) get `loading="lazy"`, explicit `allow`/`sandbox` attributes, and a `--surface` frame with the applet title bar.

### 7.1 soundcloud applet (v1)
- `play` no args → pick random track from list → render SoundCloud widget iframe via their oEmbed/embed URL → auto-note in terminal: `dealing you: <title>`.
- `play next` → reshuffle. `play list` → portal with full track list.
- Track list source: static JSON at first (regenerated manually), Codex route later if wanted. **Before wiring: verify SoundCloud's current oEmbed/widget availability and terms** per standing API rule — their third-party access has churned repeatedly.
- Widget iframe is the one place foreign chrome is allowed; frame it per §7 rules.

### 7.2 analemma applet (v1)
- If Analemma Studio is web-hosted: sandboxed iframe panel with a docked terminal bar; `close` returns. If heavier interop is ever needed, that's a v2 postMessage contract — not now.
- If not yet web-hosted: applet renders a teaser card + `notify me` (mailto or contact portal). Ship the slot, fill later.

### 7.3 dots-lab (v1, inline)
- 3 range inputs (speed, gap, hue rotation) writing `--dot-*` / animation vars live. Reset on `clear`. Pure client. This is the "toy that teaches the interface is alive."

---

## 8. File layout (proposed — confirm against repo before creation)

```
mario0318 world root/
  index.html            ← or the verified live entry file; DO NOT assume
  css/terminal.css      ← tokens (§1), dots (§2), layout, motion (§4)
  js/terminal.js        ← boot, parser, registry, dots state, output, portal/panel host
  js/diminauth.js       ← auth calls only (separate spec)
  applets/
    soundcloud.js
    analemma.js
    dots-lab.js
  assets/dots-tile.svg
  commands.public.json
```

Constraints: no build step, no bundler, no framework, native ES modules. Total public JS budget (excluding applets): **< 24KB unminified**. Keep the modules readable and dependency-free.

---

## 9. Build order

1. Static shell: fallback nav, tokens, background tile, dots idle animation. (pure Claude output, no repo risk)
2. terminal.js: boot, input, output log, parser, unknown-pool, `help`, `clear`. 
3. Portal sheet (`<dialog>`) + `projects`/`contact` content.
4. Panel host + docked bar + applet loader. dots-lab first (proves the contract with zero external deps).
5. soundcloud applet (verify SoundCloud terms → static track JSON → widget).
6. analemma applet slot.
7. Diminauth integration point: privileged registry fetch merges into command table at runtime; `elevated` dot class. (Codex routes per Diminauth v0 spec.)
8. QA: keyboard-only pass, VoiceOver/NVDA pass on the log region, reduced-motion pass, Lighthouse a11y ≥ 95, 500-line output soak.

Each step ships independently. Step 2 alone is already a working site.

---

## 10. Explicit non-goals (v1)

- No command history sync, no localStorage of anything typed.
- No analytics events on keystrokes. Page-level analytics only if already present in the world.
- No quoting/flags grammar, no piping, no command chaining.
- No theming toggle (dark instrument is the identity; there is no light mode).
- No service worker / offline (revisit only if applets justify it).
- Nothing PROOFGATE. Nothing sprime.io. This world stays itself.
