// Default-model proxy for The Ladder (Cloudflare Worker).
// Visitors talk to the assistant without their own key. The publisher's Otari key
// lives only here, as the secret OTARI_KEY, never in the page or in git.
// Caps: one model, short answers, small requests, per-visitor and daily limits.
// On top of these, the Otari key itself carries a hard spend limit set in Otari.

export const LIMITS = {
  model: "anthropic/claude-sonnet-5.5",
  maxTokens: 900,            // per answer
  maxBodyBytes: 48_000,      // per request
  perIpPerHour: 40,          // model calls from one visitor
  perDay: 600,               // model calls for the whole site
};

const UPSTREAM = "https://api.otari.ai/api/v1/chat/completions";

export function corsHeaders(origin, allowed) {
  const ok = allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(status, body, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

// A small in-memory window. Each Worker isolate counts on its own, so the Otari
// key's spend limit stays the hard ceiling.
const counters = new Map();
export function overLimit(key, limit, windowMs, now = Date.now()) {
  const entry = counters.get(key);
  if (!entry || now - entry.start > windowMs) {
    counters.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export async function handle(request, env, fetchImpl = fetch) {
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin") || "";
  const cors = corsHeaders(origin, allowed);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  if (request.method !== "POST" || !path.endsWith("/chat/completions")) {
    return json(404, { error: { message: "Only POST /v1/chat/completions is served here." } }, cors);
  }
  if (!allowed.includes(origin)) {
    return json(403, { error: { message: "This free model works only on The Ladder's own pages." } }, cors);
  }
  if (!env.OTARI_KEY) {
    return json(503, { error: { message: "The free model is not switched on yet. Add your own key in AI model settings." } }, cors);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (overLimit(`ip:${ip}`, LIMITS.perIpPerHour, 3_600_000) || overLimit("day", LIMITS.perDay, 86_400_000)) {
    return json(429, { error: { message: "The free model has reached its limit for now. Try later or add your own key in AI model settings." } }, cors);
  }
  const raw = await request.text();
  if (raw.length > LIMITS.maxBodyBytes) {
    return json(413, { error: { message: "This conversation is too long for the free model. Start a new chat." } }, cors);
  }
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: { message: "Bad JSON." } }, cors); }
  // The proxy decides the model and the answer length, whatever the page asked for.
  body.model = LIMITS.model;
  body.max_tokens = Math.min(Number(body.max_tokens) || LIMITS.maxTokens, LIMITS.maxTokens);
  delete body.max_completion_tokens;
  delete body.n;
  const upstream = await fetchImpl(UPSTREAM, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OTARI_KEY}` },
    body: JSON.stringify(body),
  });
  const headers = { ...cors, "Content-Type": upstream.headers.get("Content-Type") || "application/json" };
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default { fetch: (request, env) => handle(request, env) };
