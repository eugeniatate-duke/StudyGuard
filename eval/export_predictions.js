#!/usr/bin/env node
/**
 * eval/export_predictions.js - save the rule engine's decisions for Python
 *
 *     node eval/export_predictions.js
 *
 * Writes python/predictions.json with, for every labelled prompt in the dev and
 * held-out sets, the human label and the decisions of rules v1 and v2.
 * python/make_figures.py reads it to draw confusion matrices next to the
 * scikit-learn model. (Rules run in JavaScript, so this is the bridge.)
 */
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./csv.js");
const Engine = require("../engine.js");

const root = path.join(__dirname, "..");
const out = {};
for (const [name, file] of [["dev", "prompts.csv"], ["heldout", "heldout.csv"]]) {
  const rows = parseCsv(fs.readFileSync(path.join(root, "eval", file), "utf8"));
  out[name] = rows.map((r) => {
    const one = (ruleSet) => {
      const a = Engine.analyzePrompt(r.prompt, { attempt: r.attempt, ruleSet });
      return { decision: a.decision === "needs_effort" ? "HOLD" : "PASS", score: a.score };
    };
    return { id: r.id, prompt: r.prompt, attempt: r.attempt || "", label: String(r.label || "").trim().toUpperCase(), v1: one("v1"), v2: one("v2") };
  });
}
fs.writeFileSync(path.join(root, "python", "predictions.json"), JSON.stringify(out, null, 1));
console.log("Wrote python/predictions.json:", out.dev.length, "dev +", out.heldout.length, "held-out prompts");
