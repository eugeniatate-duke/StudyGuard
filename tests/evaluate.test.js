// tests/evaluate.test.js
// Tests for eval/evaluate.js. Run from the repo root with:  node --test

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluate,
  renderMarkdown,
  wilson,
  metricsFrom,
} = require("../eval/evaluate.js");
const { analyzePrompt } = require("../engine.js");

// A stub scorer: holds anything containing "HOLDME", and records what it was given.
function stub(calls) {
  return (prompt, options) => {
    calls.push({ prompt, options });
    const hold = prompt.includes("HOLDME");
    return {
      score: hold ? 10 : 70,
      decision: hold ? "needs_effort" : "pass",
      signals: hold ? [{ id: "x" }] : [],
    };
  };
}

const rows = [
  { id: "A", prompt: "HOLDME one", attempt: "", label: "HOLD" }, // tp
  { id: "B", prompt: "plain two", attempt: "", label: "HOLD" }, // fn (missed)
  { id: "C", prompt: "HOLDME three", attempt: "", label: "PASS" }, // fp (wrongly held)
  { id: "D", prompt: "plain four", attempt: "my try", label: "PASS" }, // tn
  { id: "E", prompt: "HOLDME five", attempt: "", label: "UNSURE" }, // excluded
  { id: "F", prompt: "plain six", attempt: "", label: "pass" }, // lower case is accepted, tn
];
const types = {
  A: "blunt",
  B: "blunt",
  C: "borderline",
  D: "genuine",
  E: "borderline",
  F: "genuine",
};

test("wilson: known values and empty input", () => {
  const w = wilson(8, 10);
  assert.ok(Math.abs(w.value - 0.8) < 1e-9);
  assert.ok(Math.abs(w.lo - 0.49) < 0.005);
  assert.ok(Math.abs(w.hi - 0.943) < 0.005);
  const none = wilson(0, 0);
  assert.equal(none.value, null);
  assert.equal(wilson(10, 10).hi, 1);
});

test("metricsFrom: handles a matrix with no predicted positives", () => {
  const m = metricsFrom({ tp: 0, fn: 3, fp: 0, tn: 2 });
  assert.equal(m.precision.value, null);
  assert.equal(m.recall.value, 0);
  assert.equal(m.f1, null);
  assert.equal(m.accuracy.value, 2 / 5);
});

test("evaluate: builds the confusion matrix and leaves UNSURE out of it", () => {
  const r = evaluate(rows, types, stub([]));
  assert.deepEqual(r.confusion, { tp: 1, fn: 1, fp: 1, tn: 2 });
  assert.equal(r.total, 6);
  assert.equal(r.decided, 5);
  assert.equal(r.unsure, 1);
  assert.equal(r.unsureHeld, 1);
  assert.equal(r.unsurePassed, 0);
});

test("evaluate: metrics are right", () => {
  const r = evaluate(rows, types, stub([]));
  assert.equal(r.metrics.accuracy.value, 3 / 5);
  assert.equal(r.metrics.precision.value, 1 / 2);
  assert.equal(r.metrics.recall.value, 1 / 2);
  assert.equal(r.metrics.specificity.value, 2 / 3);
  assert.equal(r.metrics.f1, 0.5);
});

test("evaluate: lists the mistakes with their category and score", () => {
  const r = evaluate(rows, types, stub([]));
  assert.deepEqual(
    r.missed.map((x) => x.id),
    ["B"]
  );
  assert.deepEqual(
    r.wronglyHeld.map((x) => x.id),
    ["C"]
  );
  assert.equal(r.missed[0].type, "blunt");
  assert.equal(r.wronglyHeld[0].score, 10);
});

test("evaluate: passes the attempt text to the scorer", () => {
  const calls = [];
  evaluate(rows, types, stub(calls));
  assert.equal(
    calls.find((c) => c.prompt === "plain four").options.attempt,
    "my try"
  );
});

test("evaluate: groups results by category and uses 'unknown' for missing ones", () => {
  const r = evaluate(
    [...rows, { id: "Z", prompt: "plain z", attempt: "", label: "PASS" }],
    types,
    stub([])
  );
  const blunt = r.byType.find((t) => t.type === "blunt");
  assert.equal(blunt.n, 2);
  assert.equal(blunt.missed, 1);
  assert.ok(r.byType.find((t) => t.type === "unknown"));
});

test("evaluate: baselines are computed on the same decided rows", () => {
  const r = evaluate(rows, types, stub([]));
  // always-HOLD: 2 should-hold... only A,B are HOLD of 5 decided
  assert.equal(r.baselines.majority.accuracy.value, 2 / 5);
  assert.equal(r.baselines.majority.recall.value, 1);
  assert.ok(r.baselines.keyword.accuracy.n === 5);
});

test("evaluate: works with the real engine", () => {
  const r = evaluate(
    [
      {
        id: "R1",
        prompt: "Write a Python function for a binary search",
        attempt: "",
        label: "HOLD",
      },
      {
        id: "R2",
        prompt: "Why does this error happen? I'm stuck on line 4",
        attempt: "",
        label: "PASS",
      },
    ],
    { R1: "blunt", R2: "genuine" },
    analyzePrompt
  );
  assert.deepEqual(r.confusion, { tp: 1, fn: 0, fp: 0, tn: 1 });
});

test("renderMarkdown: contains the key sections and the mistakes", () => {
  const md = renderMarkdown(evaluate(rows, types, stub([])), {
    generatedAt: "2026-10-20",
    threshold: 50,
  });
  for (const heading of [
    "# StudyGuard evaluation results",
    "## Headline results",
    "## Confusion matrix",
    "## Baselines",
    "## Results by category",
    "## Mistakes",
    "## UNSURE prompts",
    "## How to read this",
  ]) {
    assert.ok(md.includes(heading), "missing " + heading);
  }
  assert.match(md, /\| B \| blunt \|/);
  assert.match(md, /2026-10-20/);
});

test("renderMarkdown: does not crash when nothing is decided", () => {
  const md = renderMarkdown(
    evaluate(
      [{ id: "U", prompt: "x", attempt: "", label: "UNSURE" }],
      {},
      stub([])
    )
  );
  assert.match(md, /n\/a/);
});
