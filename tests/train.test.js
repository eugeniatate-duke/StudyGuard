/**
 * tests/train.test.js - sanity checks for the synthetic training set (Phase B1)
 * Keeps the training data separate from the TEST-ONLY dev and held-out sets.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("../eval/csv.js");

const load = (f) => parseCsv(fs.readFileSync(path.join(__dirname, "..", "eval", f), "utf8"));

test("train.csv has the expected columns, valid labels and both classes", () => {
  const raw = fs.readFileSync(path.join(__dirname, "..", "eval", "train.csv"), "utf8");
  assert.strictEqual(raw.split(/\r?\n/)[0].replace(/^﻿/, ""), "id,prompt,attempt,label,category");
  const rows = load("train.csv");
  assert.ok(rows.length >= 300);
  for (const r of rows) assert.ok(["HOLD", "PASS"].includes(r.label), r.id);
  const hold = rows.filter((r) => r.label === "HOLD").length;
  assert.ok(hold / rows.length > 0.35 && hold / rows.length < 0.65, "classes should be roughly balanced");
});

test("training prompts are unique", () => {
  const rows = load("train.csv");
  const keys = rows.map((r) => r.prompt.trim().toLowerCase());
  assert.strictEqual(new Set(keys).size, keys.length);
});

test("no training prompt appears in the dev or held-out sets", () => {
  const test_ = new Set([...load("prompts.csv"), ...load("heldout.csv")].map((r) => r.prompt.trim().toLowerCase()));
  for (const r of load("train.csv")) assert.ok(!test_.has(r.prompt.trim().toLowerCase()), r.id);
});
