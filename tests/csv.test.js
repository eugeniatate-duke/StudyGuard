// tests/csv.test.js
// Tests for eval/csv.js. Run from the repo root with:  node --test

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { parseCsv } = require("../eval/csv.js");

test("csv: parses a header and simple rows", () => {
  assert.deepEqual(parseCsv("id,label\nP01,HOLD\nP02,PASS\n"), [
    { id: "P01", label: "HOLD" },
    { id: "P02", label: "PASS" },
  ]);
});

test("csv: handles quoted commas, doubled quotes and line breaks in cells", () => {
  const text = 'id,prompt\nP01,"Hello, ""world"""\nP02,"line one\nline two"\n';
  const rows = parseCsv(text);
  assert.equal(rows[0].prompt, 'Hello, "world"');
  assert.equal(rows[1].prompt, "line one\nline two");
});

test("csv: handles CRLF, a BOM, a missing final newline and blank lines", () => {
  const rows = parseCsv("\uFEFFid,label\r\nP01,HOLD\r\n\r\nP02,PASS");
  assert.deepEqual(
    rows.map((r) => r.id),
    ["P01", "P02"]
  );
});

test("csv: short rows get empty strings, and empty input gives no rows", () => {
  assert.deepEqual(parseCsv("a,b,c\n1,2\n"), [{ a: "1", b: "2", c: "" }]);
  assert.deepEqual(parseCsv(""), []);
});

test("dataset: prompts.csv has unique ids, text on every row, and a label column", () => {
  const rows = parseCsv(
    fs.readFileSync(path.join(__dirname, "..", "eval", "prompts.csv"), "utf8")
  );
  assert.ok(rows.length >= 80);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  rows.forEach((r) =>
    assert.ok(r.prompt.trim().length > 0, r.id + " has no prompt")
  );
  assert.ok("label" in rows[0] && "attempt" in rows[0]);
});

test("dataset: prompt_types.csv covers exactly the same ids", () => {
  const dir = path.join(__dirname, "..", "eval");
  const prompts = parseCsv(
    fs.readFileSync(path.join(dir, "prompts.csv"), "utf8")
  ).map((r) => r.id);
  const types = parseCsv(
    fs.readFileSync(path.join(dir, "prompt_types.csv"), "utf8")
  ).map((r) => r.id);
  assert.deepEqual([...prompts].sort(), [...types].sort());
});
