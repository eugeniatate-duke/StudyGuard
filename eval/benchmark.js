#!/usr/bin/env node
/**
 * eval/benchmark.js - run StudyGuard's scorer on the labelled evaluation set
 *
 * Run from the repo root:
 *     node eval/benchmark.js                          (dev set, v2 rules)
 *     node eval/benchmark.js --set heldout            (held-out set)
 *     node eval/benchmark.js --set heldout --rules v1 (original rules)
 *     node eval/benchmark.js --set heldout --out docs/v2-heldout-results.md
 *
 * --set    dev (default) = eval/prompts.csv + prompt_types.csv
 *          heldout       = eval/heldout.csv + heldout_types.csv
 * --rules  v1 | v2 (default v2) | model. "model" uses the trained classifier in
 *          model/model.json (create it with: node train/train_model.js).
 *          See the RULE SETS note in engine.js and model.js.
 *
 * Scores every labelled prompt with engine.js, prints a short summary, and
 * (with --out) writes the full markdown report. Calculations live in
 * eval/evaluate.js.
 *
 * Reminder: once you have seen results, the labels are frozen (see
 * docs/annotation-guide.md).
 */
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./csv.js");
const { evaluate, renderMarkdown } = require("./evaluate.js");
const Engine = require("../engine.js");

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const outPath = flag("--out", null);
const setName = flag("--set", "dev");
const ruleSet = flag("--rules", "v2");
const FILES = {
  dev: ["prompts.csv", "prompt_types.csv"],
  heldout: ["heldout.csv", "heldout_types.csv"],
};
if (!FILES[setName] || !["v1", "v2", "model"].includes(ruleSet)) {
  console.error("Usage: node eval/benchmark.js [--set dev|heldout] [--rules v1|v2|model] [--out file.md]");
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(path.join(__dirname, FILES[setName][0]), "utf8"));
const typeMap = {};
parseCsv(fs.readFileSync(path.join(__dirname, FILES[setName][1]), "utf8")).forEach((r) => {
  typeMap[r.id] = r.type;
});

const unlabelled = rows.filter((r) => !String(r.label || "").trim());
if (unlabelled.length) {
  console.error("Some prompts are not labelled yet. Run: node eval/check-labels.js");
  process.exit(1);
}

let analyze;
if (ruleSet === "model") {
  const modelPath = path.join(__dirname, "..", "model", "model.json");
  if (!fs.existsSync(modelPath)) {
    console.error("model/model.json not found. Run: node train/train_model.js");
    process.exit(1);
  }
  analyze = require("../model.js").createAnalyzer(JSON.parse(fs.readFileSync(modelPath, "utf8")));
} else {
  analyze = (prompt, options) => Engine.analyzePrompt(prompt, { ...options, ruleSet });
}
const results = evaluate(rows, typeMap, analyze);
const markdown = renderMarkdown(results, { threshold: Engine.ENGINE_CONFIG.passThreshold });

const m = results.metrics;
const show = (x) => (x.value === null ? "n/a" : Math.round(x.value * 100) + "% (" + x.k + "/" + x.n + ")");
console.log("Set:", setName, "| rules:", ruleSet);
console.log("Prompts:", results.total, "| decided:", results.decided, "| UNSURE:", results.unsure);
console.log("Accuracy: ", show(m.accuracy));
console.log("Precision:", show(m.precision), "(held prompts that should be held)");
console.log("Recall:   ", show(m.recall), "(should-hold prompts that were held)");
console.log("Missed:", results.missed.length, "| Wrongly held:", results.wronglyHeld.length);
console.log("Baselines  always-HOLD accuracy:", show(results.baselines.majority.accuracy),
  "| keyword rule accuracy:", show(results.baselines.keyword.accuracy));

if (outPath) {
  fs.writeFileSync(outPath, markdown);
  console.log("Full report written to", outPath);
} else {
  console.log("(Add --out docs/evaluation-results.md to write the full report.)");
}
