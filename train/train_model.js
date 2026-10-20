#!/usr/bin/env node
/**
 * train/train_model.js - train StudyGuard's classifier and save model/model.json
 *
 *     node train/train_model.js
 *
 * Trains on eval/train.csv ONLY. The dev set (eval/prompts.csv) and held-out set
 * (eval/heldout.csv) are never read here, so they stay a fair test.
 * The regularisation strength is chosen by 5-fold cross-validation on the
 * training set (not on the test sets).
 * Deterministic: same data -> same model.json.
 */
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("../eval/csv.js");
const Model = require("../model.js");

const root = path.join(__dirname, "..");
const rows = parseCsv(fs.readFileSync(path.join(root, "eval", "train.csv"), "utf8"));
console.log("Training rows:", rows.length);

const grid = [0.0003, 0.001, 0.003, 0.01, 0.03];
let best = null;
for (const lambda of grid) {
  const cv = Model.crossValidate(rows, { lambda }, 5);
  console.log(`lambda ${lambda}: CV accuracy ${(cv.accuracy * 100).toFixed(1)}%  log loss ${cv.logLoss.toFixed(3)}`);
  if (!best || cv.logLoss < best.cv.logLoss) best = { lambda, cv };
}
console.log("Chosen lambda (lowest CV log loss):", best.lambda);

const model = Model.train(rows, { lambda: best.lambda });
model.cv = { folds: 5, accuracy: best.cv.accuracy, logLoss: best.cv.logLoss };
fs.mkdirSync(path.join(root, "model"), { recursive: true });
fs.writeFileSync(path.join(root, "model", "model.json"), JSON.stringify(model));
console.log("Vocabulary size:", model.idf.length);
console.log("Wrote model/model.json");

// Show what it learned: the strongest words either way.
const names = Object.keys(model.vocab);
const ranked = names.map((t, i) => ({ t, w: model.weights[i] })).sort((a, b) => b.w - a.w);
console.log("\nTop words pushing toward HOLD:");
ranked.slice(0, 12).forEach((r) => console.log("  +" + r.w.toFixed(2), r.t));
console.log("Top words pushing toward PASS:");
ranked.slice(-12).reverse().forEach((r) => console.log("  " + r.w.toFixed(2), r.t));
