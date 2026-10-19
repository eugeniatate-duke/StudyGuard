// tests/perturbation.test.js
// Run from the repo root with:  node --test

const test = require("node:test");
const assert = require("node:assert/strict");
const { explainPrompt, tokenize, maskToken } = require("../perturbation.js");

test("tokenize returns positions that slice back to each word", () => {
  const text = "Why doesn\u2019t this work, line 4?";
  const tokens = tokenize(text);
  assert.ok(tokens.length >= 5);
  for (const t of tokens) assert.equal(text.slice(t.start, t.end), t.text);
});

test("maskToken removes exactly one word", () => {
  const text = "write a function";
  const [first] = tokenize(text);
  assert.equal(maskToken(text, first), " a function");
});

test("blunt code request: 'write' and 'function' drive the score", () => {
  const r = explainPrompt("Write a Python function for a binary search");
  assert.equal(r.blocked, true);
  const flagged = r.topFeatures.map((t) => t.text.toLowerCase()).sort();
  assert.deepEqual(flagged, ["function", "write"]);
  for (const t of r.topFeatures) {
    assert.equal(t.delta, 35);
    assert.equal(t.effect, "answer_seeking");
    assert.equal(t.flipsDecision, true); // removing it lets the prompt pass
  }
});

test("unrelated words are not flagged", () => {
  const r = explainPrompt("Write a Python function for a binary search");
  const python = r.tokens.find((t) => t.text === "Python");
  assert.equal(python.delta, 0);
  assert.equal(python.flagged, false);
  assert.equal(python.effect, "neutral");
});

test("effort words get a negative delta (green)", () => {
  const r = explainPrompt("Write a function. I tried a loop but I'm stuck.");
  const stuck = r.tokens.find((t) => t.text === "stuck");
  assert.ok(stuck.delta < 0);
  assert.equal(stuck.effect, "effort");
});

test("importance is scaled to 0..1 with the largest at 1", () => {
  const r = explainPrompt("Solve this for me and write a function");
  const values = r.tokens.map((t) => t.importance);
  assert.ok(values.every((v) => v >= 0 && v <= 1));
  assert.equal(Math.max(...values), 1);
});

test("small length-bonus wobble is not flagged", () => {
  // 20 words, no signals: removing any word shifts the length bonus by 1 point.
  const prompt =
    "Tell the story of the quick brown fox that jumped over the lazy dog near the old river bank today";
  const r = explainPrompt(prompt);
  assert.equal(r.topFeatures.length, 0);
  assert.ok(r.tokens.every((t) => Math.abs(t.delta) <= 1));
});

test("empty prompt returns no tokens and does not crash", () => {
  const r = explainPrompt("");
  assert.deepEqual(r.tokens, []);
  assert.equal(r.blocked, false);
});

test("attempt box text is respected when re-scoring", () => {
  const r = explainPrompt("Write a function to reverse a string", {
    attempt: "I think I should loop from the end and build a new string",
  });
  assert.equal(
    r.baseline.signals.some((s) => s.id === "attempt_field"),
    true
  );
  assert.ok(r.topFeatures.length > 0);
});

test("explaining does not change the engine result for the same input", () => {
  const { analyzePrompt } = require("../engine.js");
  const p = "Give me the answer";
  const before = analyzePrompt(p);
  explainPrompt(p);
  assert.deepEqual(analyzePrompt(p), before);
});
