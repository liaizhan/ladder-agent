// Safe Exit helplines: one data file, every copy built from it, every number with an official source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build, loadData, promptText, telHref } from "../../scripts/build-helplines.mjs";

const data = loadData();
const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

test("every copy of the list matches helplines.json (run node scripts/build-helplines.mjs after editing it)", () => {
  for (const [p, text] of Object.entries(build(data))) {
    assert.equal(read(p), text, `${p} is out of date`);
  }
});

test("each country has a unique two-letter code, a name, an emergency number and a checked line", () => {
  const codes = new Set();
  for (const c of data.countries) {
    assert.match(c.code, /^[A-Z]{2}$/);
    assert.ok(!codes.has(c.code), `${c.code} twice`);
    codes.add(c.code);
    assert.ok(c.name);
    assert.ok(c.emergency.length > 0, `${c.code} has no emergency number`);
    assert.ok(c.lines.length > 0, `${c.code} has no helpline`);
  }
  assert.ok(codes.size >= 30, `only ${codes.size} countries`);
});

test("every number is dialable and links to the https page it was checked on", () => {
  for (const c of data.countries) {
    for (const l of [...c.emergency, ...c.lines]) {
      assert.match(telHref(l.number), /^tel:\+?\d{2,15}$/, `${c.code} ${l.number}`);
      assert.match(l.source, /^https:\/\/[^\s]+$/, `${c.code} ${l.number} has no https source`);
      assert.ok(l.label, `${c.code} ${l.number} has no label`);
    }
  }
});

test("the assistant's text names every country and the fallback", () => {
  const text = promptText(data);
  for (const c of data.countries) assert.ok(text.includes(`- ${c.code} (${c.name}): `), c.code);
  assert.ok(text.includes("findahelpline.com"));
  const network = JSON.parse(read("safe-exit/safe_exit.network.json"));
  assert.equal(network.commondefs.replacement_strings.helplines, text);
});

test("the Ladder's country menu offers every country Safe Exit knows, then Other", () => {
  const html = read("ladder/index.html");
  for (const c of data.countries) assert.ok(html.includes(`<option value="${c.code}">`), c.code);
  assert.ok(html.indexOf('value="OTHER"') > html.indexOf("<!-- countries:end -->"));
});
