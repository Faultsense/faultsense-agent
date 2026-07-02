// Minimal Node HTTP host for the TanStack Start production build.
//
// `npm run build` produces:
//   dist/server/server.js  — fetch-style handler exporting { fetch }
//   dist/client/           — static assets (JS bundles, the faultsense agent
//                            bundles in public/ are copied here too)
//
// TanStack Start v1 doesn't ship a built-in node-server target in this
// version, so this wrapper:
//   1. Serves files under dist/client/ as static assets first
//   2. Bridges everything else into the fetch handler via Web Request/Response
//
// Designed for Railway / any plain Node host. Reads $PORT (default 3000).

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import serverEntry from "./dist/server/server.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = resolve(ROOT, "dist/client");
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

async function tryStaticFile(urlPath) {
  // Reject path traversal: normalize and confirm the resolved path is
  // still under CLIENT_DIR.
  const safePath = normalize(urlPath).replace(/^[/\\]+/, "");
  const fullPath = resolve(CLIENT_DIR, safePath);
  if (!fullPath.startsWith(CLIENT_DIR + "/") && fullPath !== CLIENT_DIR) {
    return null;
  }
  try {
    const info = await stat(fullPath);
    if (!info.isFile()) return null;
    const buf = await readFile(fullPath);
    const ext = extname(fullPath).toLowerCase();
    return { body: buf, contentType: MIME[ext] || "application/octet-stream" };
  } catch {
    return null;
  }
}

function nodeRequestToWebRequest(req, host) {
  const url = `http://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else if (v != null) {
      headers.set(k, v);
    }
  }
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req;
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function writeWebResponse(webRes, nodeRes) {
  nodeRes.statusCode = webRes.status;
  nodeRes.statusMessage = webRes.statusText;
  webRes.headers.forEach((value, key) => nodeRes.setHeader(key, value));
  if (!webRes.body) {
    nodeRes.end();
    return;
  }
  const reader = webRes.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    nodeRes.write(value);
  }
  nodeRes.end();
}

const server = createServer(async (req, res) => {
  try {
    // Static-asset shortcut for GET/HEAD under dist/client/.
    if (req.method === "GET" || req.method === "HEAD") {
      const urlPath = req.url.split("?")[0];
      const file = await tryStaticFile(urlPath);
      if (file) {
        res.statusCode = 200;
        res.setHeader("content-type", file.contentType);
        res.setHeader("content-length", file.body.length);
        if (req.method === "HEAD") return res.end();
        return res.end(file.body);
      }
    }

    // Hand off to the TanStack Start fetch handler.
    const host = req.headers.host || `localhost:${PORT}`;
    const webReq = nodeRequestToWebRequest(req, host);
    const webRes = await serverEntry.fetch(webReq);
    await writeWebResponse(webRes, res);
  } catch (err) {
    console.error("server: handler error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain");
      res.end("internal server error");
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`tanstack todolist listening on http://0.0.0.0:${PORT}`);
});
