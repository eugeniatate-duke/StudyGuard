// tests/engine.test.js
// Run from the repo root with:  node --test
// Uses Node's built-in test runner (Node 18+). No installs needed.

const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzePrompt } = require("../engine.js");

test("blunt code request is flagged as answer-seeking", () => {
  const r = analyzePrompt("Write a Python function for a binary search");
  assert.equal(r.decision, "needs_effort");
  assert.equal(r.intent, "answer_seeking");
  assert.ok(r.score < 50, `expected score < 50, got ${r.score}`);
  assert.ok(r.signals.some((s) => s.id === "direct_code_request"));
});

test("error message plus own attempt passes", () => {
  const r = analyzePrompt(
    "Why does this error happen? Here is my attempt: def add(a, b): return a - b. " +
      "I get a TypeError on line 4 and I'm not sure why."
  );
  assert.equal(r.decision, "pass");
  assert.equal(r.intent, "attempting");
  assert.ok(r.score >= 50);
});

test("neutral conceptual question passes", () => {
  const r = analyzePrompt("Explain how recursion works");
  assert.equal(r.decision, "pass");
  assert.equal(r.intent, "neutral");
});

test("empty prompt is not judged", () => {
  assert.equal(analyzePrompt("").decision, "empty");
  assert.equal(analyzePrompt("   ").decision, "empty");
  assert.equal(analyzePrompt(undefined).decision, "empty");
});

test("a request plus real effort can still pass", () => {
  const r = analyzePrompt(
    "Write a function to sort a list. I tried a loop but I'm stuck on the swap."
  );
  assert.equal(r.decision, "pass");
});

test("each signal counts once even if repeated", () => {
  const once = analyzePrompt("Write a function");
  const many = analyzePrompt(
    "Write a function. Write a function. Write a function."
  );
  assert.equal(once.requestPoints, many.requestPoints);
});

test("score stays between 0 and 100", () => {
  const low = analyzePrompt(
    "Solve this for me. Give me the answer. Write code for me."
  );
  assert.ok(low.score >= 0 && low.score <= 100);
  const high = analyzePrompt(
    "Why does this error happen? I tried this, here is my code: function f() {} " +
      "TypeError on line 2, I'm stuck, give me a hint because I think the approach is wrong"
  );
  assert.equal(high.score, 100);
});

test("curly apostrophes are handled", () => {
  const r = analyzePrompt("I\u2019m stuck on this problem");
  assert.ok(r.signals.some((s) => s.id === "stuck_point"));
});

test("text in the attempt box counts as effort", () => {
  const without = analyzePrompt("Write a function to reverse a string");
  const withAttempt = analyzePrompt("Write a function to reverse a string", {
    attempt: "I think I should loop from the end and build a new string",
  });
  assert.ok(withAttempt.score > without.score);
  assert.ok(withAttempt.signals.some((s) => s.id === "attempt_field"));
});

test("matches carry positions for later highlighting", () => {
  const prompt = "Please write a function now";
  const r = analyzePrompt(prompt);
  const m = r.signals.find((s) => s.id === "direct_code_request").matches[0];
  assert.equal(prompt.slice(m.start, m.end), m.text);
});
