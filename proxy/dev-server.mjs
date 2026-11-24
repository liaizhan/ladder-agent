// Local run of the proxy on http://127.0.0.1:8787 (no key: answers 503 by design).
import http from "node:http";
import { handle } from "./worker.js";
const env = { ALLOWED_ORIGINS: "http://127.0.0.1:8080,http://localhost:8080,http://127.0.0.1:8081,http://localhost:8081", OTARI_KEY: process.env.OTARI_KEY || "" };
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const request = new Request(`http://127.0.0.1:8787${req.url}`, {
    method: req.method, headers: req.headers, body: ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const out = await handle(request, env);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(8787, "127.0.0.1", () => console.log("proxy on http://127.0.0.1:8787/v1"));
