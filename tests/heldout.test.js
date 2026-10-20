// tests/heldout.test.js
// Guards the held-out evaluation set (eval/heldout.csv). Run with:  node --test

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { parseCsv } = require("../eval/csv.js");

const read = (name) =>
  parseCsv(fs.readFileSync(path.join(__dirname, "..", "eval", name), "utf8"));

test("held-out: header is exactly id, prompt, attempt, label", () => {
  const rows = read("heldout.csv");
  assert.deepEqual(Object.keys(rows[0]), ["id", "prompt", "attempt", "label"]);
});

test("held-out: at least 40 prompts, unique ids, text on every row", () => {
  const rows = read("heldout.csv");
  assert.ok(rows.length >= 40);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  rows.forEach((r) =>
    assert.ok(r.prompt.trim().length > 0, r.id + " has no prompt")
  );
});

test("held-out: heldout_types.csv covers exactly the same ids", () => {
  const a = read("heldout.csv")
    .map((r) => r.id)
    .sort();
  const b = read("heldout_types.csv")
    .map((r) => r.id)
    .sort();
  assert.deepEqual(a, b);
});

test("held-out: no prompt is also in the development set", () => {
  const dev = new Set(
    read("prompts.csv").map((r) => r.prompt.trim().toLowerCase())
  );
  read("heldout.csv").forEach((r) =>
    assert.ok(
      !dev.has(r.prompt.trim().toLowerCase()),
      r.id + " duplicates a development prompt"
    )
  );
});
