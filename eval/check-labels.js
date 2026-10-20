#!/usr/bin/env node
/**
 * eval/check-labels.js - check that eval/prompts.csv is fully and validly labelled
 *
 * Run from the repo root:   node eval/check-labels.js
 *
 * It reports how many prompts are labelled HOLD, PASS and UNSURE, lists any
 * that are blank or mistyped, and warns if the classes are very unbalanced.
 * It does NOT run the scorer, so you can use it before you have seen any
 * results (the labels must be made blind; see docs/annotation-guide.md).
 */
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./csv.js");

const VALID = ["HOLD", "PASS", "UNSURE"];
const file = process.argv[2] || path.join(__dirname, "prompts.csv");

const rows = parseCsv(fs.readFileSync(file, "utf8"));
const counts = { HOLD: 0, PASS: 0, UNSURE: 0 };
const blank = [];
const invalid = [];

for (const row of rows) {
  const label = String(row.label || "")
    .trim()
    .toUpperCase();
  if (label === "") blank.push(row.id);
  else if (VALID.includes(label)) counts[label]++;
  else invalid.push(row.id + ' ("' + row.label + '")');
}

console.log("File:", file);
console.log("Prompts:", rows.length);
console.log(
  "HOLD:",
  counts.HOLD,
  " PASS:",
  counts.PASS,
  " UNSURE:",
  counts.UNSURE
);
if (blank.length)
  console.log("Still to label (" + blank.length + "):", blank.join(", "));
if (invalid.length)
  console.log(
    "Not a valid label (use HOLD, PASS or UNSURE):",
    invalid.join(", ")
  );

const decided = counts.HOLD + counts.PASS;
if (decided > 0) {
  const holdShare = Math.round((counts.HOLD / decided) * 100);
  console.log("Of the decided prompts, " + holdShare + "% are HOLD.");
  if (holdShare < 25 || holdShare > 75) {
    console.log(
      "Warning: the classes are quite unbalanced; accuracy alone will be misleading."
    );
  }
}
if (counts.UNSURE > rows.length * 0.2) {
  console.log(
    "Warning: more than 20% UNSURE. Re-read the decision rule in the guide."
  );
}

const done = blank.length === 0 && invalid.length === 0 && rows.length > 0;
console.log(done ? "OK: every prompt has a valid label." : "NOT DONE YET.");
process.exit(done ? 0 : 1);
