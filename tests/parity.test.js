/**
 * tests/parity.test.js - the browser model must match the Python model
 *
 * python/train_sklearn.py trains with scikit-learn, exports model/model.sklearn.json
 * and writes python/parity_cases.json (prompts + the probabilities Python gave).
 * model.js must reproduce them, otherwise a model trained in Python would behave
 * differently inside the Chrome extension.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const Model = require("../model.js");

const modelFile = path.join(__dirname, "..", "model", "model.sklearn.json");
const casesFile = path.join(__dirname, "..", "python", "parity_cases.json");
const ready = fs.existsSync(modelFile) && fs.existsSync(casesFile);

test("JavaScript reproduces scikit-learn probabilities", { skip: !ready && "run python3 python/train_sklearn.py first" }, () => {
  const model = JSON.parse(fs.readFileSync(modelFile, "utf8"));
  const cases = JSON.parse(fs.readFileSync(casesFile, "utf8"));
  assert.ok(cases.length >= 20);
  let worst = 0;
  for (const c of cases) {
    const p = Model.predict(model, c.prompt, c.attempt).pHold;
    worst = Math.max(worst, Math.abs(p - c.pHold));
    assert.ok(Math.abs(p - c.pHold) < 1e-9, `"${c.prompt}" js=${p} python=${c.pHold}`);
  }
  assert.ok(worst < 1e-9);
});

test("exported model has the fields model.js needs", { skip: !ready && "run python3 python/train_sklearn.py first" }, () => {
  const model = JSON.parse(fs.readFileSync(modelFile, "utf8"));
  assert.strictEqual(model.type, "tfidf-logreg");
  assert.strictEqual(model.idf.length, model.weights.length);
  assert.strictEqual(Object.keys(model.vocab).length, model.idf.length);
  assert.ok(typeof model.bias === "number");
});
