/**
 * tests/model.test.js - checks for the trained classifier (Phase B2)
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("../eval/csv.js");
const Model = require("../model.js");

const rows = parseCsv(fs.readFileSync(path.join(__dirname, "..", "eval", "train.csv"), "utf8"));

test("tokenize lowercases and keeps apostrophes", () => {
  assert.deepStrictEqual(Model.tokenize("Don’t GIVE me, the Answer!"), ["don't", "give", "me", "the", "answer"]);
});

test("featureTokens adds word pairs and prefixes attempt words", () => {
  const t = Model.featureTokens("write code", "I tried a loop and it failed");
  assert.ok(t.includes("write") && t.includes("write code"));
  assert.ok(t.includes("a_present") && t.includes("a_loop"));
});

test("training is deterministic", () => {
  const a = Model.train(rows.slice(0, 120), { iterations: 50 });
  const b = Model.train(rows.slice(0, 120), { iterations: 50 });
  assert.deepStrictEqual(a.weights, b.weights);
});

test("model separates clear examples it was not trained on", () => {
  const m = Model.train(rows, { lambda: 0.003 });
  const hold = Model.predict(m, "Write the whole program for a library system").pHold;
  const pass = Model.predict(m, "Why does my loop skip the last item? I think the range is wrong").pHold;
  assert.ok(hold > 0.5, "hold prompt p=" + hold);
  assert.ok(pass < 0.5, "pass prompt p=" + pass);
});

test("contributions add up to the logit (the model is exactly explainable)", () => {
  const m = Model.train(rows, { lambda: 0.003 });
  const r = Model.predict(m, "Give me the full code for merge sort", "");
  const sum = r.contributions.reduce((s, c) => s + c.value, m.bias);
  assert.ok(Math.abs(sum - r.logit) < 1e-9);
});

test("cross-validation returns sensible numbers", () => {
  const cv = Model.crossValidate(rows, { lambda: 0.003, iterations: 200 }, 4);
  assert.ok(cv.accuracy > 0.8 && cv.accuracy <= 1);
  assert.ok(cv.logLoss > 0);
});

test("createAnalyzer matches the engine's output shape", () => {
  const m = Model.train(rows, { lambda: 0.003 });
  const analyze = Model.createAnalyzer(m);
  const r = analyze("Write the essay for me", { attempt: "" });
  assert.strictEqual(r.decision, "needs_effort");
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(Array.isArray(r.signals));
  assert.strictEqual(analyze("   ", {}).decision, "empty");
});

test("model/model.json (if present) loads and predicts", { skip: !fs.existsSync(path.join(__dirname, "..", "model", "model.json")) }, () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "model", "model.json"), "utf8"));
  const p = Model.predict(m, "Solve problem 3 for me").pHold;
  assert.ok(p >= 0 && p <= 1);
});
