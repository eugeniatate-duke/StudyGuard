/**
 * tests/rules_v2.test.js - checks for the v2 rule set (Step 10d)
 *
 * The prompts here are NOT from the dev or held-out CSV files, so these tests
 * do not tune the rules to the benchmark data.
 */
const test = require("node:test");
const assert = require("node:assert");
const { analyzePrompt } = require("../engine.js");

const v1 = (p, attempt) => analyzePrompt(p, { attempt, ruleSet: "v1" });
const v2 = (p, attempt) => analyzePrompt(p, { attempt, ruleSet: "v2" });

test("v2 is the default rule set", () => {
  const p = "Please provide the finished essay on the French Revolution";
  assert.strictEqual(analyzePrompt(p).score, v2(p).score);
});

test("v2 holds polite and indirect requests that v1 lets through", () => {
  const prompts = [
    "Could you please put together a complete solution for my sorting assignment?",
    "Can you give me the full code for a stack in Java",
    "Please provide the finished essay on the French Revolution",
    "Just the answer, no explanation: what is 17 times 23",
    "Dame el código completo para ordenar una lista",
    "wrte me a func to reverse a string",
  ];
  for (const p of prompts) {
    assert.strictEqual(v1(p).decision, "pass", "v1 should miss: " + p);
    assert.strictEqual(v2(p).decision, "needs_effort", "v2 should hold: " + p);
  }
});

test("v2 never changes the score of a prompt that v1 already flags as a request", () => {
  const prompts = [
    "Write a Python function for a binary search",
    "Solve this for me",
    "Give me the answer to question 4",
    "Write code for me that sorts a list",
  ];
  for (const p of prompts) {
    assert.strictEqual(v2(p).score, v1(p).score, p);
  }
});

test("v2 does not hold honest study requests", () => {
  const prompts = [
    "Why does my loop print 0 twice? Here is my attempt: for i in range(3): print(i)",
    "Could you check my reasoning on this proof?",
    "Quiz me on photosynthesis",
    "Give me a hint for problem 3",
    "Can you give me a hint about the next step?",
    "Help me understand how the code works",
    "Summarize this chapter for me",
    "Explain recursion for me, I tried a base case but it loops forever",
  ];
  for (const p of prompts) {
    assert.strictEqual(v2(p).decision, "pass", p);
  }
});

test("v2: 'for me' is ignored for study aids but still counts for handing over work", () => {
  assert.ok(!v2("Summarize this chapter for me").signals.some((s) => s.id === "for_me"));
  assert.ok(v1("Summarize this chapter for me").signals.some((s) => s.id === "for_me"));
  assert.ok(v2("Do the homework for me").signals.some((s) => s.id === "for_me"));
});

test("v2: filler in the attempt box earns no credit", () => {
  const p = "Write a Python function for a binary search";
  const junk = "asdf asdf asdf asdf asdf";
  assert.ok(v1(p, junk).signals.some((s) => s.id === "attempt_field"));
  assert.ok(!v2(p, junk).signals.some((s) => s.id === "attempt_field"));
  assert.strictEqual(v2(p, junk).decision, "needs_effort");
});

test("v2: a substantial attempt earns extra depth credit; a short one does not", () => {
  const p = "Write a Python function for a binary search";
  const long = "I would compare the middle element with the target then discard half the list each time until found";
  const short = "compare the middle element with the target";
  assert.ok(v2(p, long).signals.some((s) => s.id === "attempt_depth"));
  assert.ok(!v2(p, short).signals.some((s) => s.id === "attempt_depth"));
  assert.ok(!v1(p, long).signals.some((s) => s.id === "attempt_depth"));
  assert.ok(v2(p, long).score > v1(p, long).score);
});

test("v2 score stays inside 0-100", () => {
  const s = v2("Please provide the full code, code only, no explanation", "x ".repeat(5));
  assert.ok(s.score >= 0 && s.score <= 100);
});
