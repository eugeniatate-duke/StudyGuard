/**
 * explain.js - three word-level explanations of the trained model (Phase B3)
 *
 * Every method returns one number per word in the prompt:
 *     positive = the word pushes the prompt toward HOLD
 *     negative = the word pushes it toward PASS
 * so they can be compared directly (see eval/explanation_eval.js).
 *
 *   occlusion(model, prompt, attempt)      remove one word, re-run the model.
 *       attribution = p(HOLD) with the word - p(HOLD) without it.
 *       Same idea as perturbation.js, applied to the model.
 *
 *   shapWords(model, prompt, attempt, background)   exact SHAP values.
 *       For a linear model, the SHAP value of feature i is
 *       weight_i x (x_i - mean_i), where x is the TF-IDF vector and mean_i is
 *       the average of feature i over a background set (training prompts).
 *       This is exact, not sampled. Units: log-odds (logit). Word-pair
 *       features split their value equally between their two words.
 *       Efficiency property: the values sum to logit(prompt) - logit(background).
 *
 *   limeWords(model, prompt, attempt, opts)   LIME-style local surrogate.
 *       Randomly keeps/drops words, records p(HOLD) for each variant, then fits
 *       a distance-weighted ridge regression; a word's coefficient is its
 *       effect. Seeded, so results are reproducible; different seeds give a
 *       measure of LIME's instability.
 *
 * Words come from tokenizeWords(), with character positions, so a UI can
 * highlight them in the text box.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./model.js"));
  else root.StudyGuardExplain = factory(root.StudyGuardModel);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Model) {
  /** Words with positions: [{text, start, end}] (same word rule as model.js). */
  function tokenizeWords(text) {
    const out = [];
    for (const m of String(text || "").matchAll(/[A-Za-z0-9à-ÿ'‘’]+/g)) {
      out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  const norm = (w) => w.toLowerCase().replace(/[‘’]/g, "'");
  const maskWords = (text, words, keep) => {
    // Rebuild the text keeping only words whose keep[i] is true.
    let out = "";
    let pos = 0;
    words.forEach((w, i) => {
      out += text.slice(pos, w.start);
      if (keep[i]) out += text.slice(w.start, w.end);
      pos = w.end;
    });
    return out + text.slice(pos);
  };

  /** Occlusion: p(HOLD) with the word minus p(HOLD) without it. */
  function occlusion(model, prompt, attempt) {
    const words = tokenizeWords(prompt);
    const base = Model.predict(model, prompt, attempt).pHold;
    return words.map((w, i) => {
      const keep = words.map((_, j) => j !== i);
      const without = Model.predict(model, maskWords(prompt, words, keep), attempt).pHold;
      return { ...w, value: base - without };
    });
  }

  /** Mean TF-IDF vector over background rows (dense array). Used as SHAP's reference. */
  function backgroundMean(model, rows) {
    const mean = new Array(model.idf.length).fill(0);
    for (const r of rows) {
      for (const [i, v] of vectorOf(model, r.prompt, r.attempt)) mean[i] += v / rows.length;
    }
    return mean;
  }

  function vectorOf(model, prompt, attempt) {
    // Re-use model.js's pipeline through predict's contributions: value = w*x, so x = value/w.
    const tokens = Model.featureTokens(prompt, attempt);
    const counts = new Map();
    for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
    const entries = [];
    for (const [t, c] of counts) {
      const i = model.vocab[t];
      if (i !== undefined) entries.push([i, (1 + Math.log(c)) * model.idf[i]]);
    }
    const n = Math.sqrt(entries.reduce((s, [, v]) => s + v * v, 0)) || 1;
    return entries.map(([i, v]) => [i, v / n]);
  }

  /**
   * Exact SHAP values per feature, then per word.
   * @returns {{words: Array, features: Array, baseLogit: number, logit: number}}
   */
  function shapWords(model, prompt, attempt, background) {
    const mean = background || new Array(model.idf.length).fill(0);
    const names = Object.keys(model.vocab);
    const vec = new Map(vectorOf(model, prompt, attempt));
    const features = [];
    // Features present in the prompt, plus background-mean features absent from it.
    const idxs = new Set([...vec.keys()]);
    mean.forEach((m, i) => { if (m !== 0) idxs.add(i); });
    for (const i of idxs) {
      const phi = model.weights[i] * ((vec.get(i) || 0) - mean[i]);
      features.push({ term: names[i], value: phi });
    }
    const words = tokenizeWords(prompt);
    const values = new Array(words.length).fill(0);
    const wordIdx = {};
    words.forEach((w, i) => { (wordIdx[norm(w.text)] = wordIdx[norm(w.text)] || []).push(i); });
    for (const f of features) {
      if (f.term.startsWith("a_")) continue; // attempt-box features are not prompt words
      const parts = f.term.split(" ");
      const holders = parts.flatMap((p) => wordIdx[p] || []);
      if (holders.length === 0) continue;
      // split equally across the occurrences that carry this feature
      for (const h of holders) values[h] += f.value / holders.length;
    }
    const base = mean.reduce((s, m, i) => s + model.weights[i] * m, model.bias);
    const logit = [...vec].reduce((s, [i, v]) => s + model.weights[i] * v, model.bias);
    return { words: words.map((w, i) => ({ ...w, value: values[i] })), features, baseLogit: base, logit };
  }

  // ---- LIME-style surrogate ----
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Solve A x = b by Gaussian elimination with partial pivoting. */
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c] || 1e-12;
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / d;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / (M[r][r] || 1e-12);
    }
    return x;
  }

  /**
   * LIME-style explanation.
   * @param {object} [opts] {samples=200, kernelWidth=0.25, ridge=1, seed=1}
   */
  function limeWords(model, prompt, attempt, opts) {
    const o = { samples: 200, kernelWidth: 0.25, ridge: 1, seed: 1, ...(opts || {}) };
    const words = tokenizeWords(prompt);
    const m = words.length;
    if (m === 0) return [];
    const rand = mulberry32(o.seed);
    const Z = [[...new Array(m).fill(1)]];
    for (let s = 1; s < o.samples; s++) Z.push(words.map(() => (rand() < 0.5 ? 0 : 1)));
    const y = Z.map((z) => Model.predict(model, maskWords(prompt, words, z.map(Boolean)), attempt).pHold);
    const wts = Z.map((z) => {
      const kept = z.reduce((a, b) => a + b, 0);
      const d = 1 - Math.sqrt(kept / m); // cosine distance to the original
      return Math.exp((-d * d) / (o.kernelWidth * o.kernelWidth));
    });
    // weighted ridge with intercept (not regularised): columns = [1, z_1..z_m]
    const k = m + 1;
    const A = Array.from({ length: k }, () => new Array(k).fill(0));
    const b = new Array(k).fill(0);
    Z.forEach((z, s) => {
      const row = [1, ...z];
      for (let i = 0; i < k; i++) {
        b[i] += wts[s] * row[i] * y[s];
        for (let j = 0; j < k; j++) A[i][j] += wts[s] * row[i] * row[j];
      }
    });
    for (let i = 1; i < k; i++) A[i][i] += o.ridge;
    const beta = solve(A, b);
    return words.map((w, i) => ({ ...w, value: beta[i + 1] }));
  }

  return { tokenizeWords, maskWords, occlusion, backgroundMean, shapWords, limeWords };
});
