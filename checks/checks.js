// Runs the seven checks of spec section 6 with the real runtime modules.
import { Engine, selectTopRouter, manifestAllowsPeer } from "../runtime/engine.js";
import { AgentNetwork, validateNetwork, filterSlyData, allowedDownstreamSly } from "../runtime/kernel.js";
import { RemoteRegistry, fetchManifest } from "../runtime/remote.js";
import { consumeAgentBudget, consumeRemoteBudget } from "../runtime/runner.js";
import { LlmClient } from "../runtime/llm.js";
import { McpClient } from "../runtime/mcp.js";
import { TraceBus } from "../runtime/trace.js";

const SITE = new URL("../", import.meta.url).href.replace(/\/$/, "");
// The second site comes from the published links.json, so the checks run the same locally and live.
const PEER_URL = (await (await fetch(`${SITE}/links.json`, { cache: "no-store" })).json()).networks.the_ladder.safe_exit;
const PEER = new URL(PEER_URL);
const list = document.querySelector("#list");
const results = [];

function card(title) {
  const el = document.createElement("section");
  el.className = "check";
  el.innerHTML = `<h2><span class="badge">…</span><span></span></h2><ul></ul>`;
  el.querySelector("h2 span:last-child").textContent = title;
  list.append(el);
  return {
    note(text, isError = false) {
      const li = document.createElement("li");
      if (isError) { li.textContent = "Stopped with: "; const s = document.createElement("span"); s.className = "err"; s.textContent = text; li.append(s); }
      else li.textContent = text;
      el.querySelector("ul").append(li);
    },
    done(ok) {
      const b = el.querySelector(".badge");
      b.textContent = ok ? "PASS" : "FAIL";
      b.classList.add(ok ? "pass" : "fail");
      results.push(ok);
    },
  };
}

async function run(title, fn) {
  const c = card(title);
  try { c.done(await fn(c) !== false); }
  catch (err) { c.note(String(err.message || err), true); c.done(false); }
}

// Records every request the runtime makes, with its headers, while fn runs.
async function watchFetch(fn) {
  const seen = [];
  const real = window.fetch;
  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const headers = new Headers(init.headers || (typeof input === "object" ? input.headers : undefined));
    seen.push({ url, auth: headers.get("Authorization") || "" });
    return real(input, init);
  };
  try { return { value: await fn(), seen }; }
  finally { window.fetch = real; }
}

function expectThrow(fn, c) {
  try { fn(); } catch (err) { c.note(err.message, true); return true; }
  c.note("Did not stop."); return false;
}

const { manifest } = await fetchManifest(SITE);
const engine = new Engine({ originUrl: SITE, trace: new TraceBus() });
let top;

await run("1. A network of agents and a manifest, published on the web", async (c) => {
  top = await engine._compile(SITE, manifest, manifest.networks[0], { isTop: true });
  engine.top = { ...top, base: SITE, manifest };
  const agents = (top.network.config.tools || []).map((a) => a.name);
  c.note(`Manifest: ${SITE}/agent-manifest.json, network "${top.network.name}", front agent ${top.network.findFrontMan()}.`);
  c.note(`Agents: ${agents.join(", ")}. Validation errors: ${top.validation.errors.length}.`);
  c.note(location.protocol === "https:" ? "Served over HTTPS." : "Served from loopback HTTP here (the spec allows it for local runs); the live copy is HTTPS.");
  return agents.length >= 2 && top.validation.errors.length === 0;
});

await run("2. Runs on the default model, and on the visitor's own key (BYOK)", async (c) => {
  const def = selectTopRouter(manifest, "", "", "");
  c.note(`Default: ${def.baseUrl}, keyless ${def.keyless}. The visitor needs no key; the publisher's capped proxy pays.`);
  const byok = selectTopRouter(manifest, "", "test-key-not-real", "");
  c.note(`With the visitor's key: ${byok.baseUrl} (switched to BYOK: ${byok.upgradedToByok}).`);
  const client = new LlmClient({ baseUrl: def.baseUrl, apiKey: "test-key-not-real", keyless: true, mock: false });
  const { seen } = await watchFetch(() => client.chat({ model: "anthropic/claude-sonnet-5.5", messages: [{ role: "user", content: "ping" }] }).catch((e) => e));
  const sentKey = seen.some((r) => r.auth);
  c.note(`Request to the default proxy carried a key: ${sentKey ? "yes" : "no"}.`);
  return def.keyless && !def.mock && byok.upgradedToByok && byok.baseUrl !== def.baseUrl && !sentKey;
});

await run("3. An internal agent and a grounded MCP action", async (c) => {
  const spec = (n) => top.network.getAgentSpec(n);
  const internal = top.network.classifyTool("safety_check").kind;
  const mcpRef = spec("ladder_mapper").tools[0];
  c.note(`safety_check is ${internal}; ladder_mapper calls ${mcpRef.url} (${mcpRef.tools.join(", ")}).`);
  const mcp = new McpClient({ url: mcpRef.url });
  const out = await mcp.callTool("analyze_ladder", {
    language: "en", goal: "Run a 10 km race", me: "I run 3 km twice a week",
    blocks: ["No time after work", "Knee hurts after 5 km", "No running partner"],
    fears: ["I will be last", "I will get injured", "People will laugh"],
  });
  const text = typeof out === "string" ? out : (out?.content || []).map((p) => p.text || "").join(" ");
  let reading = {};
  try { reading = JSON.parse(text); } catch {}
  const zones = (reading.steps || []).map((s) => s.zone);
  c.note(`MCP answered from this browser with a "${reading.kind}" of ${zones.length} steps: ${[...new Set(zones)].join(", ")} (sample answers, not a visitor's).`);
  return internal !== "remote" && reading.kind === "reading" && zones.length >= 5;
});

let peer;
await run("4. After consent, a named network from a second site runs here", async (c) => {
  c.note(`links.json binds "safe_exit" to ${top.network.getLink("safe_exit")}.`);
  const asked = [];
  engine.onConsent = async (info) => { asked.push(info); return "once"; };
  const answer = await engine.requestConsent({ kind: "network", peerOrigin: PEER.host, request: "Helplines for country KZ" });
  c.note(`Consent card shown first: ${asked.length === 1}, answer "${answer}".`);
  const url = await engine.resolveLink("safe_exit", top.network, SITE);
  engine.userRouter = { baseUrl: selectTopRouter(manifest, "", "", "").baseUrl, keyless: true, mock: false };
  peer = await watchFetch(() => engine.resolveRemote(url, [], null, manifest));
  const s = peer.value;
  c.note(`Loaded "${s.network.name}" from ${s.base}; it runs in this browser.`);
  return asked.length === 1 && s.network.name === "safe_exit";
});

await run("5. The second site never gets the key and cannot change the router", async (c) => {
  const s = peer.value;
  const peerManifestRouter = s.manifest.llm_router?.base_url;
  c.note(`Safe Exit publishes router ${peerManifestRouter}; it runs on the caller's router ${s.llm.baseUrl}.`);
  const toPeer = peer.seen.filter((r) => r.url.startsWith(PEER.origin));
  c.note(`Requests to Safe Exit: ${toPeer.length}, with a key: ${toPeer.filter((r) => r.auth).length}.`);
  const keyed = new Engine({ originUrl: SITE, trace: new TraceBus(), byokKey: "test-key-not-real" });
  const kt = await keyed._compile(SITE, manifest, manifest.networks[0], { isTop: true });
  keyed.top = { ...kt, base: SITE, manifest };
  const kp = await watchFetch(() => keyed.resolveRemote(PEER_URL, [], null, manifest));
  const leaked = kp.seen.filter((r) => r.url.startsWith(PEER.origin) && r.auth).length;
  c.note(`With a visitor key set: requests to Safe Exit carrying it: ${leaked}; Safe Exit's model goes to ${kp.value.llm.baseUrl}.`);
  return s.llm.baseUrl === engine.userRouter.baseUrl && toPeer.every((r) => !r.auth) && leaked === 0
    && kp.value.llm.baseUrl === kt.llm.baseUrl;
});

await run("6. Private answers stay here unless a field is named in an allow rule", async (c) => {
  const sly = { goal: "Earn 500,000 a month", me: "I earn 150,000", blocks: ["Mom"], fears: ["Shame"], country: "KZ" };
  const allow = allowedDownstreamSly(top.network.getAgentSpec("ladder_guide"));
  const sent = filterSlyData(sly, allow || []);
  c.note(`Allow rule on ladder_guide: ${JSON.stringify(allow)}.`);
  c.note(`What Safe Exit receives: ${JSON.stringify(sent)}. Goal, situation, obstacles and fears stay in this browser.`);
  const none = filterSlyData(sly, allowedDownstreamSly(top.network.getAgentSpec("safety_check")) || []);
  c.note(`An agent with no allow rule passes: ${JSON.stringify(none)}.`);
  return JSON.stringify(sent) === '{"country":"KZ"}' && Object.keys(none).length === 0;
});

await run("7. Four failures stop with a visible error", async (c) => {
  let ok = true;
  c.note("Invalid network (front agent calls a tool that does not exist):");
  const bad = new AgentNetwork({ tools: [{ name: "front", instructions: "x", function: { description: "x" }, tools: ["ghost_tool"] }] }, "broken");
  const v = validateNetwork(bad);
  if (v.errors.length) c.note(`Network 'broken' failed validation: ${v.errors.join("; ")}`, true); else { ok = false; c.note("Not caught."); }
  c.note("Cycle (A calls B, B calls A back):");
  const reg = new RemoteRegistry({ trace: new TraceBus() });
  ok = expectThrow(() => reg.checkCycle([reg.cacheKey(PEER.origin, "safe_exit")], PEER.origin, "safe_exit"), c) && ok;
  c.note("Over budget (25th agent call in one question):");
  const comp = { deadline: Date.now() + 90000, agentCalls: 24, maxAgentCalls: 24, remoteCalls: 4, maxRemoteCalls: 4, peerCalls: new Map(), maxCallsPerPeer: 1 };
  const why = consumeAgentBudget(comp) || consumeRemoteBudget(comp, "x");
  if (why) c.note(`Budget: ${why}`, true); else { ok = false; c.note("Not caught."); }
  c.note("Denied site (not in allowed_peers):");
  const fresh = new Engine({ originUrl: SITE, trace: new TraceBus() });
  fresh.top = { manifest };
  ok = expectThrow(() => fresh._assertAllowedPeer("https://unknown-site.example"), c) && ok;
  c.note(`Policy check for https://unknown-site.example: ${manifestAllowsPeer("https://unknown-site.example", manifest)}.`);
  return ok;
});

const passed = results.filter(Boolean).length;
document.querySelector("#summary").textContent = `${passed} of ${results.length} checks pass.`;
window.__checks = { passed, total: results.length };
