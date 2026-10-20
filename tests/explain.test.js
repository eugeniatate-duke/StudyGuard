/**
 * tests/explain.test.js - checks for SHAP / LIME / occlusion explanations (Phase B3)
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("../eval/csv.js");
const Model = require("../model.js");
const Explain = require("../explain.js");

const rows = parseCsv(fs.readFileSync(path.join(__dirname, "..", "eval", "train.csv"), "utf8"));
const model = Model.train(rows, { lambda: 0.003, iterations: 300 });
const bg = Explain.backgroundMean(model, rows);
const prompt = "Could you please write the full code for a binary search in Python?";

test("tokenizeWords gives positions that match the text", () => {
  const w = Explain.tokenizeWords("Don’t write code!");
  assert.deepStrictEqual(w.map((x) => x.text), ["Don’t", "write", "code"]);
  assert.strictEqual("Don’t write code!".slice(w[1].start, w[1].end), "write");
});

test("maskWords removes only the dropped words", () => {
  const text = "write the code";
  const w = Explain.tokenizeWords(text);
  assert.strictEqual(Explain.maskWords(text, w, [true, false, true]).replace(/\s+/g, " "), "write code");
});

test("SHAP efficiency: feature values sum to logit minus background logit", () => {
  const s = Explain.shapWords(model, prompt, "", bg);
  const sum = s.features.reduce((a, f) => a + f.value, 0);
  assert.ok(Math.abs(sum - (s.logit - s.baseLogit)) < 1e-9);
});

test("SHAP gives answer-seeking words a positive value and effort words a negative one", () => {
  const hold = Explain.shapWords(model, prompt, "", bg).words;
  const get = (ws, t) => ws.find((w) => w.text.toLowerCase() === t).value;
  assert.ok(get(hold, "write") > 0 && get(hold, "full") > 0);
  const pass = Explain.shapWords(model, "Can you give me a hint for this problem?", "", bg).words;
  assert.ok(get(pass, "hint") < 0);
});

test("occlusion: removing the strongest HOLD word lowers p(HOLD)", () => {
  const o = Explain.occlusion(model, "Write the full code for me", "");
  assert.ok(Math.max(...o.map((w) => w.value)) > 0);
});

test("LIME is reproducible for a given seed and varies mildly across seeds", () => {
  const a = Explain.limeWords(model, prompt, "", { seed: 3 }).map((w) => w.value);
  const b = Explain.limeWords(model, prompt, "", { seed: 3 }).map((w) => w.value);
  assert.deepStrictEqual(a, b);
  const c = Explain.limeWords(model, prompt, "", { seed: 4 }).map((w) => w.value);
  assert.notDeepStrictEqual(a, c);
});

test("LIME and SHAP agree on the top word for a clear prompt", () => {
  const lime = Explain.limeWords(model, "Write the full code for me", "", { seed: 1 }).map((w) => w.value);
  const shap = Explain.shapWords(model, "Write the full code for me", "", bg).words.map((w) => w.value);
  const top = (v) => v.indexOf(Math.max(...v));
  assert.ok(lime[top(lime)] > 0);
  assert.ok(shap[top(shap)] > 0);
  assert.ok(shap[top(lime)] > 0, "LIME's top word should also push toward HOLD under SHAP");
});

test("empty prompt gives empty explanations", () => {
  assert.deepStrictEqual(Explain.limeWords(model, "", ""), []);
  assert.deepStrictEqual(Explain.occlusion(model, "", ""), []);
});
