/**
 * tests/shap_parity.test.js - JavaScript SHAP must match the shap library
 *
 * python/explain_shap_lime.py runs shap.LinearExplainer and writes
 * python/shap_parity.json (per-word values). explain.js must reproduce them.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("../eval/csv.js");
const Explain = require("../explain.js");

const root = path.join(__dirname, "..");
const modelFile = path.join(root, "model", "model.sklearn.json");
const casesFile = path.join(root, "python", "shap_parity.json");
const ready = fs.existsSync(modelFile) && fs.existsSync(casesFile);

test("explain.js SHAP matches shap.LinearExplainer", { skip: !ready && "run python3 python/explain_shap_lime.py first" }, () => {
  const model = JSON.parse(fs.readFileSync(modelFile, "utf8"));
  const rows = parseCsv(fs.readFileSync(path.join(root, "eval", "train.csv"), "utf8"));
  const bg = Explain.backgroundMean(model, rows);
  const cases = JSON.parse(fs.readFileSync(casesFile, "utf8"));
  assert.ok(cases.length >= 5);
  for (const c of cases) {
    const js = Explain.shapWords(model, c.prompt, c.attempt, bg).words;
    assert.deepStrictEqual(js.map((w) => w.text), c.words, c.prompt);
    js.forEach((w, i) => assert.ok(Math.abs(w.value - c.values[i]) < 1e-9, `${c.prompt} / ${w.text}`));
  }
});
