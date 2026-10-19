// tests/breakdownmap.test.js
// Tests for breakdownmap.js. Run from the repo root with:  node --test

const test = require("node:test");
const assert = require("node:assert/strict");

const { analyzePrompt } = require("../engine.js");
const { explainPrompt } = require("../perturbation.js");
const { generateHint } = require("../counterfactual.js");
const { buildMap, effortLevel } = require("../breakdownmap.js");

function mapFor(question, attempt = "") {
  const opts = { attempt };
  return buildMap(
    analyzePrompt(question, opts),
    explainPrompt(question, opts),
    generateHint(question, opts)
  );
}

test("map: blunt code request is labelled, absent effort, with unlock steps", () => {
  const m = mapFor("Write a Python function for a binary search");
  assert.equal(m.score, 15);
  assert.equal(m.passed, false);
  assert.equal(m.intent.label, "Direct code generation");
  assert.equal(m.effort.level, "Absent");
  assert.equal(m.effort.points, 0);
  assert.match(m.intent.explanation, /own approach/);
  assert.ok(m.unlock.steps.length >= 1);
  assert.ok(m.unlock.projectedScore >= 50);
});

test("map: red words come from the perturbation step", () => {
  const m = mapFor("Write a Python function for a binary search");
  const red = m.words
    .filter((w) => w.effect === "answer_seeking")
    .map((w) => w.text);
  assert.deepEqual(red, ["Write", "function"]);
});

test("map: a good prompt passes, reads as an attempt, and has no unlock plan", () => {
  const m = mapFor("Why does this error happen? I am stuck on line 4");
  assert.equal(m.passed, true);
  assert.equal(m.intent.label, "Working it through");
  assert.equal(m.effort.level, "Strong");
  assert.equal(m.unlock, null);
});

test("map: an attempt changes the explanation and the effort level", () => {
  const m = mapFor(
    "Write a Python function for a binary search",
    "I think I should compare the middle element and then halve the range"
  );
  assert.equal(m.passed, true);
  assert.match(m.intent.explanation, /offsets part/);
  assert.notEqual(m.effort.level, "Absent");
});

test("map: signals list quotes the exact matched words", () => {
  const m = mapFor("Write a Python function for a binary search");
  assert.equal(m.signals[0].id, "direct_code_request");
  assert.deepEqual(m.signals[0].quotes, ["Write a Python function"]);
});

test("map: never claims to be a probability, and bars stay within 0-100", () => {
  const m = mapFor("Give me the answer and solve this for me, write the code");
  assert.match(m.caveat, /not a probability/);
  assert.ok(m.intent.bar >= 0 && m.intent.bar <= 100);
  assert.ok(m.effort.bar >= 0 && m.effort.bar <= 100);
});

test("map: works without an explanation or hint", () => {
  const m = buildMap(analyzePrompt("Give me the answer"), null, null);
  assert.deepEqual(m.words, []);
  assert.equal(m.unlock, null);
});

test("effortLevel thresholds", () => {
  assert.equal(effortLevel(0), "Absent");
  assert.equal(effortLevel(10), "Low");
  assert.equal(effortLevel(25), "Moderate");
  assert.equal(effortLevel(40), "Strong");
});
