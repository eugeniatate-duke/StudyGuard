#!/usr/bin/env node
/**
 * eval/explanation_eval.js - how good are the explanations? (Phase B3)
 *
 *     node eval/explanation_eval.js
 *     node eval/explanation_eval.js --out docs/explanation-fidelity.md
 *
 * Needs model/model.json (node train/train_model.js). Uses the prompts in
 * eval/prompts.csv and eval/heldout.csv but NOT their labels: explanation
 * quality is measured against the model and the rules themselves, not against
 * human labels, so nothing here can leak into or tune on the benchmark.
 *
 * Methods compared (positive value = word pushes toward HOLD)
 *   rules-perturb  one-word-removal on the rule engine (perturbation.js)
 *   model-occl     one-word-removal on the trained model
 *   model-shap     exact SHAP for the linear model
 *   model-lime     LIME-style local surrogate on the trained model
 *
 * Measures
 *   AGREEMENT   do two methods rank the words similarly?
 *               Spearman rank correlation, top-1 agreement, top-3 overlap.
 *   FAITHFULNESS deletion test: remove the k words a method calls most
 *               HOLD-ward, re-run the model. A faithful explanation makes
 *               p(HOLD) drop and the decision flip more than deleting k random words.
 *   STABILITY   does LIME give the same answer with a different random seed?
 *
 * Automatic checks like these replace a user study, which this project does not
 * have. They show whether explanations are consistent with the model; they do
 * NOT show that students understand or benefit from them.
 */
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./csv.js");
const Engine = require("../engine.js");
const Model = require("../model.js");
const Explain = require("../explain.js");
const Perturb = require("../perturbation.js");

const root = path.join(__dirname, "..");
const outFlag = process.argv.indexOf("--out");
const outPath = outFlag > -1 ? process.argv[outFlag + 1] : null;
const modelPath = path.join(root, "model", "model.json");
if (!fs.existsSync(modelPath)) {
  console.error("model/model.json not found. Run: node train/train_model.js");
  process.exit(1);
}
const model = JSON.parse(fs.readFileSync(modelPath, "utf8"));
const read = (f) => parseCsv(fs.readFileSync(path.join(root, "eval", f), "utf8"));
const trainRows = read("train.csv");
const prompts = [...read("prompts.csv"), ...read("heldout.csv")].filter((r) => r.prompt && r.prompt.trim());
const background = Explain.backgroundMean(model, trainRows);

// ---------- small stats helpers ----------
function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}
const spearman = (x, y) => pearson(ranks(x), ranks(y));
const median = (a) => { const s = a.filter((v) => !Number.isNaN(v)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const topK = (vals, k) => vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, k).map((x) => x[1]);
const f2 = (x) => (Number.isNaN(x) ? "n/a" : x.toFixed(2));
const pct = (x) => (Number.isNaN(x) ? "n/a" : Math.round(x * 100) + "%");

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- compute explanations for every usable prompt ----------
const items = [];
for (const r of prompts) {
  const attempt = r.attempt || "";
  const words = Explain.tokenizeWords(r.prompt);
  if (words.length < 3) continue;
  const mp = Model.predict(model, r.prompt, attempt).pHold;
  const rulesDecision = Engine.analyzePrompt(r.prompt, { attempt }).decision;
  const rp = Perturb.explainPrompt(r.prompt, { attempt });
  const aligned = rp.tokens.length === words.length &&
    rp.tokens.every((t, i) => t.text.toLowerCase() === words[i].text.toLowerCase());
  items.push({
    prompt: r.prompt, attempt, words, mp,
    modelHolds: mp >= 0.5, rulesHold: rulesDecision === "needs_effort",
    aligned,
    rules: aligned ? rp.tokens.map((t) => t.delta) : null,
    occl: Explain.occlusion(model, r.prompt, attempt).map((w) => w.value),
    shap: Explain.shapWords(model, r.prompt, attempt, background).words.map((w) => w.value),
    lime: Explain.limeWords(model, r.prompt, attempt, { seed: 1 }).map((w) => w.value),
    lime2: Explain.limeWords(model, r.prompt, attempt, { seed: 2 }).map((w) => w.value),
  });
}

// ---------- agreement ----------
function agreement(set, A, B) {
  const sp = [], t1 = [], t3 = [];
  for (const it of set) {
    const a = it[A], b = it[B];
    if (!a || !b) continue;
    sp.push(spearman(a, b));
    if (Math.max(...a) > 0 && Math.max(...b) > 0) t1.push(topK(a, 1)[0] === topK(b, 1)[0] ? 1 : 0);
    const ta = new Set(topK(a, 3)), tb = topK(b, 3);
    t3.push(tb.filter((i) => ta.has(i)).length / 3);
  }
  return { n: sp.filter((v) => !Number.isNaN(v)).length, spearman: median(sp), top1: mean(t1), top3: mean(t3) };
}
const bothHold = items.filter((it) => it.modelHolds && it.rulesHold && it.aligned);
const modelHold = items.filter((it) => it.modelHolds);
const pairs = [
  ["model-shap", "shap", "model-lime", "lime", modelHold],
  ["model-shap", "shap", "model-occl", "occl", modelHold],
  ["model-lime", "lime", "model-occl", "occl", modelHold],
  ["rules-perturb", "rules", "model-shap", "shap", bothHold],
  ["rules-perturb", "rules", "model-occl", "occl", bothHold],
  ["rules-perturb", "rules", "model-lime", "lime", bothHold],
].map(([an, a, bn, b, set]) => ({ a: an, b: bn, ...agreement(set, a, b) }));

// ---------- faithfulness (deletion test on the model) ----------
function deletion(set, key, k, trials) {
  const drops = [], flips = [];
  const R = rng(590 + k);
  for (const it of set) {
    if (it.words.length <= k) continue;
    const runs = [];
    if (key === "random") {
      for (let t = 0; t < trials; t++) {
        const pool = it.words.map((_, i) => i);
        const pick = [];
        while (pick.length < k) pick.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
        runs.push(pick);
      }
    } else {
      if (!it[key]) continue;
      runs.push(topK(it[key], k));
    }
    for (const pick of runs) {
      const keep = it.words.map((_, i) => !pick.includes(i));
      const p2 = Model.predict(model, Explain.maskWords(it.prompt, it.words, keep), it.attempt).pHold;
      drops.push(it.mp - p2);
      flips.push(p2 < 0.5 ? 1 : 0);
    }
  }
  return { n: drops.length, drop: mean(drops), flip: mean(flips) };
}
const faithSet = modelHold.filter((it) => it.aligned);
const faith = {};
for (const k of [1, 2, 3]) {
  faith[k] = {
    "model-shap": deletion(faithSet, "shap", k),
    "model-lime": deletion(faithSet, "lime", k),
    "model-occl": deletion(faithSet, "occl", k),
    "rules-perturb": deletion(faithSet, "rules", k),
    random: deletion(faithSet, "random", k, 30),
  };
}

// rules-on-rules deletion
function rulesDeletion(k) {
  const set = items.filter((it) => it.rulesHold && it.aligned);
  const R = rng(7 + k);
  let flipTop = 0, flipRand = 0, n = 0, nr = 0;
  for (const it of set) {
    if (it.words.length <= k) continue;
    const tryDelete = (pick) => {
      const keep = it.words.map((_, i) => !pick.includes(i));
      return Engine.analyzePrompt(Explain.maskWords(it.prompt, it.words, keep), { attempt: it.attempt }).decision === "pass";
    };
    flipTop += tryDelete(topK(it.rules, k)) ? 1 : 0; n++;
    for (let t = 0; t < 30; t++) {
      const pool = it.words.map((_, i) => i), pick = [];
      while (pick.length < k) pick.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
      flipRand += tryDelete(pick) ? 1 : 0; nr++;
    }
  }
  return { n, top: flipTop / n, random: flipRand / nr };
}
const rulesFaith = [1, 2, 3].map(rulesDeletion);

// ---------- stability ----------
const stabSp = items.filter((it) => it.modelHolds).map((it) => spearman(it.lime, it.lime2));
const stabTop1 = items.filter((it) => it.modelHolds && Math.max(...it.lime) > 0 && Math.max(...it.lime2) > 0)
  .map((it) => (topK(it.lime, 1)[0] === topK(it.lime2, 1)[0] ? 1 : 0));

// ---------- report ----------
const L = [];
L.push("# Explanation quality: agreement, faithfulness, stability", "");
L.push("Generated by `node eval/explanation_eval.js`. No human labels are used; this measures how the", "explanations relate to the model and rules themselves.", "");
L.push(`Prompts analysed: ${items.length} (dev + held-out, at least 3 words). Model holds ${modelHold.length}; rules hold ${items.filter((i) => i.rulesHold).length}; both hold ${bothHold.length}.`, "");
L.push("## 1. Agreement between methods", "");
L.push("Spearman = median rank correlation of per-word values within a prompt (1 = same ranking).", "Top-1 = how often both methods pick the same most HOLD-ward word. Top-3 = average overlap of top-3 sets.", "");
L.push("| Method A | Method B | Prompts | Median Spearman | Top-1 agree | Top-3 overlap |", "|---|---|---|---|---|---|");
pairs.forEach((p) => L.push(`| ${p.a} | ${p.b} | ${p.n} | ${f2(p.spearman)} | ${pct(p.top1)} | ${pct(p.top3)} |`));
L.push("");
L.push("## 2. Faithfulness: deletion test", "");
L.push(`For prompts the model holds (n=${faithSet.length}), delete the k words a method ranks most HOLD-ward and re-run the model.`, "Larger p(HOLD) drop and higher flip rate = more faithful. Random = k random words (30 draws).", "Note: occlusion's top-1 is the best single deletion by construction, so it is an upper bound at k=1.", "");
L.push("| k | Method | Mean p(HOLD) drop | Decision flips to PASS |", "|---|---|---|---|");
for (const k of [1, 2, 3]) {
  for (const name of ["model-shap", "model-lime", "model-occl", "rules-perturb", "random"]) {
    const r = faith[k][name];
    L.push(`| ${k} | ${name} | ${f2(r.drop)} | ${pct(r.flip)} |`);
  }
}
L.push("", "Rule-engine check (prompts the rules hold, deletion re-scored by the rules): how often deleting the top-k words from `rules-perturb` unlocks the prompt versus random words.", "");
L.push("| k | Prompts | rules-perturb flips to pass | Random flips to pass |", "|---|---|---|---|");
rulesFaith.forEach((r, i) => L.push(`| ${i + 1} | ${r.n} | ${pct(r.top)} | ${pct(r.random)} |`));
L.push("");
L.push("## 3. Stability", "");
L.push(`LIME run twice with different random seeds on ${stabSp.length} model-held prompts: median Spearman ${f2(median(stabSp))}, same top-1 word ${pct(mean(stabTop1))}.`, "SHAP (exact for a linear model), occlusion and rule perturbation are deterministic: identical results on every run.", "");
L.push("## Limitations", "");
L.push("- These checks show consistency with the model, not that students understand or benefit; no user study was run.");
L.push("- Prompts are the project team's own dev/held-out prompts; short prompts have few words, so rankings are coarse.");
L.push("- Deleting words can create ungrammatical text the model never saw; deletion-test numbers are indicative.");
L.push("- SHAP here uses the training prompts as background; a different background changes values (not the ranking much).");
L.push("- Prompts where rules and model tokens could not be aligned (e.g. accented letters) are skipped in rule-vs-model comparisons.");
const md = L.join("\n") + "\n";
console.log(md);
if (outPath) { fs.writeFileSync(outPath, md); console.log("Written to", outPath); }
