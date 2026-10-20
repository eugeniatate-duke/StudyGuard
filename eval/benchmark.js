#!/usr/bin/env node
/**
 * eval/benchmark.js - run StudyGuard's scorer on the labelled evaluation set
 *
 * Run from the repo root:
 *     node eval/benchmark.js
 *     node eval/benchmark.js --out docs/evaluation-results.md
 *
 * Reads eval/prompts.csv (your blind labels) and eval/prompt_types.csv, scores
 * every prompt with engine.js, prints a short summary, and (with --out) writes
 * the full markdown report. All calculations live in eval/evaluate.js.
 *
 * Reminder: once you have seen results, the labels are frozen (see
 * docs/annotation-guide.md).
 */
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./csv.js");
const { evaluate, renderMarkdown } = require("./evaluate.js");
const Engine = require("../engine.js");

const outFlag = process.argv.indexOf("--out");
const outPath = outFlag > -1 ? process.argv[outFlag + 1] : null;

const rows = parseCsv(
  fs.readFileSync(path.join(__dirname, "prompts.csv"), "utf8")
);
const typeMap = {};
parseCsv(
  fs.readFileSync(path.join(__dirname, "prompt_types.csv"), "utf8")
).forEach((r) => {
  typeMap[r.id] = r.type;
});

const unlabelled = rows.filter((r) => !String(r.label || "").trim());
if (unlabelled.length) {
  console.error(
    "Some prompts are not labelled yet. Run: node eval/check-labels.js"
  );
  process.exit(1);
}

const results = evaluate(rows, typeMap, Engine.analyzePrompt);
const markdown = renderMarkdown(results, {
  threshold: Engine.ENGINE_CONFIG.passThreshold,
});

const m = results.metrics;
const show = (x) =>
  x.value === null
    ? "n/a"
    : Math.round(x.value * 100) + "% (" + x.k + "/" + x.n + ")";
console.log(
  "Prompts:",
  results.total,
  "| decided:",
  results.decided,
  "| UNSURE:",
  results.unsure
);
console.log("Accuracy: ", show(m.accuracy));
console.log(
  "Precision:",
  show(m.precision),
  "(held prompts that should be held)"
);
console.log(
  "Recall:   ",
  show(m.recall),
  "(should-hold prompts that were held)"
);
console.log(
  "Missed:",
  results.missed.length,
  "| Wrongly held:",
  results.wronglyHeld.length
);
console.log(
  "Baselines  always-HOLD accuracy:",
  show(results.baselines.majority.accuracy),
  "| keyword rule accuracy:",
  show(results.baselines.keyword.accuracy)
);

if (outPath) {
  fs.writeFileSync(outPath, markdown);
  console.log("Full report written to", outPath);
} else {
  console.log(
    "(Add --out docs/evaluation-results.md to write the full report.)"
  );
}
