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

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Internal Server Error");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600"
    });
    response.end(data);
  });
}

function redirect(response, location) {
  // 301 permanent so Google consolidates signals onto the canonical URL.
  response.writeHead(301, { Location: location });
  response.end();
}

const server = http.createServer((request, response) => {
  const url = request.url || "/";
  const host = (request.headers.host || "").toLowerCase();
  const pathname = url.split("?")[0];
  const query = url.slice(pathname.length); // "" or "?..."

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
