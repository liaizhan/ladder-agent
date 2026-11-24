import test from "node:test";
import assert from "node:assert/strict";
import { handle, LIMITS } from "./worker.js";
const env = { ALLOWED_ORIGINS: "https://site.example", OTARI_KEY: "test-secret" };
const req = (origin, body) => new Request("https://p.example/v1/chat/completions", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
test("foreign origin is refused and the key is never used", async () => {
  let called = false;
  const r = await handle(req("https://evil.example", { model: "x" }), env, async () => { called = true; });
  assert.equal(r.status, 403); assert.equal(called, false);
});
test("no key configured gives a clear 503", async () => {
  const r = await handle(req("https://site.example", {}), { ...env, OTARI_KEY: "" });
  assert.equal(r.status, 503);
});
test("model and answer length are forced, key added only upstream", async () => {
  let sent;
  const r = await handle(req("https://site.example", { model: "openai/gpt-5-pro", max_tokens: 99999, messages: [] }), env,
    async (url, init) => { sent = { url, init }; return new Response("{}", { status: 200 }); });
  assert.equal(r.status, 200);
  const body = JSON.parse(sent.init.body);
  assert.equal(body.model, LIMITS.model); assert.equal(body.max_tokens, LIMITS.maxTokens);
  assert.equal(sent.init.headers.Authorization, "Bearer test-secret");
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://site.example");
});
test("oversized request is refused", async () => {
  const r = await handle(req("https://site.example", { messages: [{ content: "x".repeat(LIMITS.maxBodyBytes) }] }), env, async () => new Response("{}"));
  assert.equal(r.status, 413);
});
