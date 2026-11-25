// Builds every copy of the helpline list from one file, safe-exit/helplines.json:
//   * the "helplines" text in safe_exit.hocon and safe_exit.network.json (what the assistant says),
//   * the list on the Safe Exit page (safe-exit/index.html),
//   * the country menu on the Ladder page (ladder/index.html).
// Run after editing helplines.json:  node scripts/build-helplines.mjs
// With --check it changes nothing and exits 1 if any copy is out of date (the tests use this).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const path = (p) => ROOT + p;

/** Digits and a leading plus, for tel: links. */
export function telHref(number) {
  return "tel:" + String(number).replace(/[^\d+]/g, "");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/** One line's facts in plain words: "free, 24/7, anonymous". */
function facts(line) {
  const out = [];
  if (line.free === true) out.push("free");
  if (line.hours) out.push(line.hours);
  if (line.anonymous === true) out.push("anonymous");
  if (line.extra) out.push(line.extra);
  return out;
}

/** The text the Safe Exit assistant gives, one country per line. */
export function promptText(data) {
  const rows = data.countries.map((c) => {
    const emergency = c.emergency.map((e) => `${e.number} ${e.label}`).join(". ");
    const lines = c.lines.map((l) => [`${l.number} ${l.label}`, ...facts(l)].join(", ")).join(". ");
    return `- ${c.code} (${c.name}): ${emergency}.${lines ? ` ${lines}.` : ""}`;
  });
  return [
    "",
    `Helplines (checked against official sources on ${data.checked}; give them exactly as written):`,
    ...rows,
    `- Any other country or no country: ${data.fallback}`,
    "",
  ].join("\n");
}

/** The list on the Safe Exit page. */
export function pageHtml(data, indent = "        ") {
  const out = [];
  const sorted = [...data.countries].sort((a, b) => a.name.localeCompare(b.name, "en"));
  for (const c of sorted) {
    out.push(`${indent}<details class="country" id="${c.code.toLowerCase()}">`);
    out.push(`${indent}  <summary>${escapeHtml(c.name)}</summary>`);
    out.push(`${indent}  <ul class="lines">`);
    for (const l of [...c.lines, ...c.emergency]) {
      const text = [l.label, ...facts(l)].join(", ");
      out.push(`${indent}    <li><a class="num" href="${telHref(l.number)}">${escapeHtml(l.number)}</a> <span>${escapeHtml(text)}</span> <a class="src" href="${escapeHtml(l.source)}" rel="noopener">source</a></li>`);
    }
    out.push(`${indent}  </ul>`);
    out.push(`${indent}</details>`);
  }
  return out.join("\n");
}

/** The country menu on the Ladder page, sorted by name. */
export function optionsHtml(data, indent = "              ") {
  const sorted = [...data.countries].sort((a, b) => a.name.localeCompare(b.name, "en"));
  return sorted.map((c) => `${indent}<option value="${c.code}">${escapeHtml(c.name)}</option>`).join("\n");
}

/** Replace what sits between two marker comments, keeping the markers. */
export function between(text, start, end, inner) {
  const i = text.indexOf(start);
  const j = text.indexOf(end, i + start.length);
  if (i < 0 || j < 0) throw new Error(`Markers ${start} and ${end} not found.`);
  const lineStart = text.lastIndexOf("\n", j) + 1;
  return text.slice(0, i + start.length) + "\n" + inner + "\n" + text.slice(lineStart);
}

/** Every built file as { path: new text }. */
export function build(data) {
  const prompt = promptText(data);
  const hocon = readFileSync(path("safe-exit/safe_exit.hocon"), "utf8");
  const hoconOut = hocon.replace(/("helplines": """)[\s\S]*?(""",)/, (_, a, b) => a + prompt + b);
  const network = JSON.parse(readFileSync(path("safe-exit/safe_exit.network.json"), "utf8"));
  network.commondefs.replacement_strings.helplines = prompt;
  const page = readFileSync(path("safe-exit/index.html"), "utf8");
  const ladder = readFileSync(path("ladder/index.html"), "utf8");
  return {
    "safe-exit/safe_exit.hocon": hoconOut,
    "safe-exit/safe_exit.network.json": JSON.stringify(network, null, 2) + "\n",
    "safe-exit/index.html": between(page, "<!-- helplines:start -->", "<!-- helplines:end -->", pageHtml(data)),
    "ladder/index.html": between(ladder, "<!-- countries:start -->", "<!-- countries:end -->", optionsHtml(data)),
  };
}

export function loadData() {
  return JSON.parse(readFileSync(path("safe-exit/helplines.json"), "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const files = build(loadData());
  let stale = 0;
  for (const [p, text] of Object.entries(files)) {
    if (readFileSync(path(p), "utf8") === text) continue;
    stale += 1;
    if (check) console.error(`Out of date: ${p}`);
    else writeFileSync(path(p), text);
  }
  if (check && stale) process.exit(1);
  console.log(check ? "All helpline copies are up to date." : `Rebuilt ${stale} file(s).`);
}
