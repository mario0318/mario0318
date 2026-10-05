const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const port = Number(process.env.PORT) || 8080;
const rootDir = path.join(__dirname, "public");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function resolvePath(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0]);
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const candidate = path.normalize(path.join(rootDir, normalizedPath));

  if (!candidate.startsWith(rootDir)) {
    return null;
  }

  return candidate;
}

function serveFile(filePath, response) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  const cacheControl = [".html", ".js", ".css", ".json"].includes(extension)
    ? "no-cache"
    : "public, max-age=3600";

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Internal Server Error");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": cacheControl
    });
    response.end(data);
  });
}

function redirect(response, location) {
  // 301 permanent so Google consolidates signals onto the canonical URL.
  response.writeHead(301, { Location: location });
  response.end();
}

// ---------------------------------------------------------------- 20q guesser
// POST /api/20q { history: [{kind, text, answer}], final }  ->  { type, text }
// Any failure answers with a bare 503 and no detail; the client has fallbacks.
// Providers are tried in PROVIDER_ORDER, skipping any without a key or that
// fail, inside one shared deadline. Free tiers first by default.
const env = (name) => (process.env[name] || "").trim();
const PROVIDERS = {
  gemini: {
    key: () => env("GEMINI_API_KEY"),
    async ask(key, system, user, signal) {
      const model = env("GEMINI_MODEL") || "gemini-2.5-flash-lite";
      const base = env("GEMINI_API_URL") || "https://generativelanguage.googleapis.com/v1beta/models";
      const r = await fetch(base + "/" + model + ":generateContent", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: 120, responseMimeType: "application/json" }
        }),
        signal
      });
      if (!r.ok) throw new Error("upstream");
      const d = await r.json();
      return String(d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text || "");
    }
  },
  groq: {
    key: () => env("GROQ_API_KEY"),
    async ask(key, system, user, signal) {
      const model = env("GROQ_MODEL") || "openai/gpt-oss-120b";
      const r = await fetch(env("GROQ_API_URL") || "https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify(Object.assign({
          model,
          // reasoning models spend part of this budget before answering
          max_tokens: 600,
          messages: [{ role: "system", content: system }, { role: "user", content: user }]
        }, model.includes("gpt-oss") ? { reasoning_effort: "low" } : {})),
        signal
      });
      if (!r.ok) throw new Error("upstream");
      const d = await r.json();
      return String(d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || "");
    }
  },
  anthropic: {
    key: () => env("ANTHROPIC_API_KEY"),
    async ask(key, system, user, signal) {
      const r = await fetch(env("ANTHROPIC_API_URL") || "https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: env("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001",
          max_tokens: 120,
          system,
          messages: [{ role: "user", content: user }]
        }),
        signal
      });
      if (!r.ok) throw new Error("upstream");
      const d = await r.json();
      return String(d && d.content && d.content[0] && d.content[0].text || "");
    }
  }
};
const PROVIDER_ORDER = (env("PROVIDER_ORDER") || "gemini,groq,anthropic").split(",").map((x) => x.trim()).filter((x) => PROVIDERS[x]);
const DEADLINE_MS = 3300;

function anyProvider() {
  return PROVIDER_ORDER.some((name) => PROVIDERS[name].key());
}

// Resolves to the first well-formed { type, text } any provider produces, or null.
async function askProviders(system, user) {
  const deadline = Date.now() + DEADLINE_MS;
  for (const name of PROVIDER_ORDER) {
    const provider = PROVIDERS[name];
    const key = provider.key();
    const left = deadline - Date.now();
    if (!key || left < 500) continue;
    try {
      const text = await provider.ask(key, system, user, AbortSignal.timeout(left));
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : null;
      if (!parsed || (parsed.type !== "question" && parsed.type !== "guess") || typeof parsed.text !== "string") continue;
      const line = parsed.text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 140);
      if (line) return { type: parsed.type, text: line };
    } catch {
      // try the next provider
    }
  }
  return null;
}
const IP_LIMIT = 90;
const IP_WINDOW_MS = 30 * 60 * 1000;
const DAY_LIMIT = 3000;
const hits = new Map();
let dayKey = "";
let dayCount = 0;

const GUESS_SYSTEM = [
  "you are the guesser in a game of 20 questions. the player has silently picked any one thing: a person, character, animal, place, object, food, brand, event, or idea.",
  "each turn, ask exactly one yes/no question that splits the remaining possibilities roughly in half, or make a guess when you are reasonably sure. never repeat or rephrase an earlier question. answers are yes, no, maybe, or idk, and may occasionally be wrong, so do not rule something out on one answer if the rest of the evidence is strong.",
  "you must guess by question 20. after a wrong guess, use it and keep going.",
  "voice: lowercase, terse, dry, plain words, no emoji, no exclamation marks, one short line.",
  'reply with a single json object and nothing else: {"type":"question","text":"..."} or {"type":"guess","text":"a bicycle"}. a guess is just the thing, with its article.'
].join(" ");

function allowRequest(ip) {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dayCount = 0; }
  if (dayCount >= DAY_LIMIT) return false;
  const recent = (hits.get(ip) || []).filter((t) => now - t < IP_WINDOW_MS);
  if (recent.length >= IP_LIMIT) { hits.set(ip, recent); return false; }
  recent.push(now);
  hits.set(ip, recent);
  dayCount++;
  if (hits.size > 5000) {
    for (const [key, list] of hits) if (!list.some((t) => now - t < IP_WINDOW_MS)) hits.delete(key);
  }
  return true;
}

function readBody(request, limit) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { resolve(null); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", () => resolve(null));
  });
}

const ANSWERS = new Set(["yes", "no", "maybe", "idk"]);

function cleanHistory(history) {
  if (!Array.isArray(history) || history.length > 30) return null;
  const out = [];
  for (const item of history) {
    if (!item || (item.kind !== "q" && item.kind !== "guess") || !ANSWERS.has(item.answer)) return null;
    const text = String(item.text || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!text) return null;
    out.push({ kind: item.kind, text, answer: item.answer });
  }
  return out;
}

function buildTurn(history, final) {
  const asked = history.filter((h) => h.kind === "q").length;
  const wrong = history.filter((h) => h.kind === "guess").length;
  const lines = history.length
    ? history.map((h) => (h.kind === "q" ? "question: " + h.text + " -> " + h.answer : "guess: " + h.text + " -> " + h.answer))
    : ["the game has just started."];
  lines.push("questions asked so far: " + asked + " of 20. wrong guesses: " + wrong + ".");
  lines.push(final ? "you must make a guess now." : "your move.");
  return lines.join("\n");
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function handleGuess(request, response) {
  const fail = () => sendJson(response, 503, {});
  if (!anyProvider()) return fail();
  const ip = String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "").split(",")[0].trim();
  if (!allowRequest(ip)) return fail();
  const raw = await readBody(request, 8192);
  if (raw === null) return fail();
  let payload;
  try { payload = JSON.parse(raw); } catch { return fail(); }
  const history = cleanHistory(payload && payload.history);
  if (!history) return fail();
  try {
    const result = await askProviders(GUESS_SYSTEM, buildTurn(history, !!payload.final));
    if (!result) return fail();
    return sendJson(response, 200, result);
  } catch {
    return fail();
  }
}

const server = http.createServer((request, response) => {
  const url = request.url || "/";
  const host = (request.headers.host || "").toLowerCase();
  const pathname = url.split("?")[0];
  const query = url.slice(pathname.length); // "" or "?..."

  if (request.method === "POST" && pathname === "/api/20q") {
    handleGuess(request, response);
    return;
  }

  // Canonical host: collapse www. onto the apex.
  if (host.startsWith("www.")) {
    redirect(response, `https://${host.slice(4)}${url}`);
    return;
  }

  // Canonical paths: kill duplicate URLs.
  if (pathname === "/index.html") {
    redirect(response, `/${query}`);
    return;
  }
  if (pathname === "/orbital") {
    redirect(response, `/orbital.html${query}`);
    return;
  }

  const filePath = resolvePath(url);

  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      serveFile(filePath, response);
      return;
    }

    // No SPA fallback: unknown paths are real 404s, not soft-404 duplicates.
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`mario0318-site listening on ${port}`);
});
