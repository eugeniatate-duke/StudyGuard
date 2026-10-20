/**
 * tests/redteam.test.js - structure checks for the red-team and hint evaluations
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("../eval/csv.js");
const Engine = require("../engine.js");
const Counterfactual = require("../counterfactual.js");

const read = (f) => parseCsv(fs.readFileSync(path.join(__dirname, "..", "eval", f), "utf8"));

test("redteam.csv has the expected header, valid outcomes and unique ids", () => {
  const raw = fs.readFileSync(path.join(__dirname, "..", "eval", "redteam.csv"), "utf8");
  assert.strictEqual(raw.split(/\r?\n/)[0].replace(/^﻿/, ""), "id,prompt,attempt,expected,category");
  const rows = read("redteam.csv");
  assert.ok(rows.length >= 30);
  assert.strictEqual(new Set(rows.map((r) => r.id)).size, rows.length);
  for (const r of rows) {
    assert.ok(["HOLD", "PASS"].includes(r.expected), r.id);
    assert.ok(r.prompt.trim().length > 0, r.id);
  }
  assert.ok(new Set(rows.map((r) => r.category)).size >= 5);
});

test("red-team cases are not copies of training, dev or held-out cases (prompt + attempt pair)", () => {
  // The same base prompt may appear with a different attempt: that is the point of the attack.
  const key = (r) => r.prompt.trim().toLowerCase() + "||" + (r.attempt || "").trim().toLowerCase();
  const seen = new Set([...read("train.csv"), ...read("prompts.csv"), ...read("heldout.csv")].map(key));
  for (const r of read("redteam.csv")) assert.ok(!seen.has(key(r)), r.id);
});

test("every hint plan for a held dev/held-out prompt reaches the pass line", () => {
  for (const r of [...read("prompts.csv"), ...read("heldout.csv")]) {
    const attempt = r.attempt || "";
    if (Engine.analyzePrompt(r.prompt, { attempt }).decision !== "needs_effort") continue;
    assert.ok(Counterfactual.generateHint(r.prompt, { attempt }).verified, r.id);
  }
});
