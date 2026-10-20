/**
 * model.js - StudyGuard's small trained classifier (Phase B2)
 *
 * WHAT IT IS
 * TF-IDF features + logistic regression, written in plain JavaScript so it
 * trains and runs with no downloads, no Python and no paid service.
 * It answers one question: how likely is it that this prompt asks for finished
 * work (HOLD) rather than showing effort (PASS)?
 *
 * WHY THIS MODEL (glass box by construction)
 * Logistic regression is linear: every word (or two-word phrase) has one
 * weight, and the score is the sum of the weights of the words present.
 * You can read exactly what it learned. That is also what makes exact
 * explanations (SHAP for linear models) and LIME comparisons possible later.
 *
 * PIPELINE
 *   text -> featureTokens (words, word pairs, attempt-box words prefixed "a_")
 *        -> TF-IDF vector (sublinear tf, smoothed idf, length-normalised)
 *        -> logistic regression -> p(HOLD) between 0 and 1
 *
 * IMPORTANT: p(HOLD) is a model output trained on synthetic data, NOT a
 * calibrated probability of cheating. Calibration is a later step (B4).
 *
 * API
 *   tokenize(text)
 *   featureTokens(prompt, attempt)
 *   train(rows, {lambda, iterations, learningRate, minDf}) -> model (plain JSON)
 *   predict(model, prompt, attempt) -> {pHold, logit, contributions[]}
 *   crossValidate(rows, options, folds) -> {accuracy, logLoss}
 *   createAnalyzer(model, threshold) -> function with the same output shape
 *       as engine.analyzePrompt, so the benchmark can score it unchanged.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyGuardModel = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULTS = { lambda: 0.01, iterations: 600, learningRate: 3, minDf: 2 };

  /** Lowercase words; curly quotes become straight so "don't" stays one word. */
  function tokenize(text) {
    return (String(text || "").toLowerCase().replace(/[‘’]/g, "'").match(/[a-z0-9à-ÿ']+/g) || []);
  }

  /** Words + two-word phrases from the prompt; attempt words get an "a_" prefix. */
  function featureTokens(prompt, attempt) {
    const words = tokenize(prompt);
    const out = words.slice();
    for (let i = 0; i < words.length - 1; i++) out.push(words[i] + " " + words[i + 1]);
    const att = tokenize(attempt);
    if (att.length >= 5) out.push("a_present");
    for (const w of att) out.push("a_" + w);
    return out;
  }

  /** Count tokens -> {term: count}. */
  function counts(tokens) {
    const c = new Map();
    for (const t of tokens) c.set(t, (c.get(t) || 0) + 1);
    return c;
  }

  /** Build vocabulary and idf from training rows (terms in >= minDf prompts). */
  function fitVocabulary(docs, minDf) {
    const df = new Map();
    for (const tokens of docs) for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
    const terms = [...df.entries()].filter(([, n]) => n >= minDf).map(([t]) => t).sort();
    const vocab = {};
    const idf = [];
    const n = docs.length;
    terms.forEach((t, i) => {
      vocab[t] = i;
      idf.push(Math.log((1 + n) / (1 + df.get(t))) + 1); // smoothed idf
    });
    return { vocab, idf };
  }

  /** Sparse TF-IDF vector as [[index, value], ...], length-normalised. */
  function vectorize(tokens, vocab, idf) {
    const entries = [];
    for (const [t, c] of counts(tokens)) {
      const i = vocab[t];
      if (i === undefined) continue;
      entries.push([i, (1 + Math.log(c)) * idf[i]]);
    }
    const norm = Math.sqrt(entries.reduce((s, [, v]) => s + v * v, 0)) || 1;
    return entries.map(([i, v]) => [i, v / norm]);
  }

  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  /** Full-batch gradient descent on L2-regularised log loss. */
  function fitWeights(X, y, size, opts) {
    const w = new Float64Array(size);
    let b = 0;
    const n = X.length;
    for (let it = 0; it < opts.iterations; it++) {
      const g = new Float64Array(size);
      let gb = 0;
      for (let k = 0; k < n; k++) {
        let z = b;
        for (const [i, v] of X[k]) z += w[i] * v;
        const err = sigmoid(z) - y[k];
        gb += err;
        for (const [i, v] of X[k]) g[i] += err * v;
      }
      for (let i = 0; i < size; i++) w[i] -= opts.learningRate * (g[i] / n + opts.lambda * w[i]);
      b -= opts.learningRate * (gb / n);
    }
    return { weights: Array.from(w), bias: b };
  }

  /** Train on rows [{prompt, attempt, label: "HOLD"|"PASS"}]. Returns a plain-JSON model. */
  function train(rows, options) {
    const opts = { ...DEFAULTS, ...(options || {}) };
    const docs = rows.map((r) => featureTokens(r.prompt, r.attempt));
    const { vocab, idf } = fitVocabulary(docs, opts.minDf);
    const X = docs.map((d) => vectorize(d, vocab, idf));
    const y = rows.map((r) => (String(r.label).toUpperCase() === "HOLD" ? 1 : 0));
    const { weights, bias } = fitWeights(X, y, idf.length, opts);
    return { type: "tfidf-logreg", version: 1, options: opts, vocab, idf, weights, bias, trainRows: rows.length };
  }

  /** p(HOLD) plus each present feature's contribution (weight x tf-idf value). */
  function predict(model, prompt, attempt) {
    const tokens = featureTokens(prompt, attempt);
    const vec = vectorize(tokens, model.vocab, model.idf);
    const names = Object.keys(model.vocab);
    let logit = model.bias;
    const contributions = [];
    for (const [i, v] of vec) {
      const c = model.weights[i] * v;
      logit += c;
      contributions.push({ term: names[i], value: c });
    }
    contributions.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    return { pHold: sigmoid(logit), logit, contributions };
  }

  /** k-fold cross-validation (deterministic folds). Optimistic: templates repeat across folds. */
  function crossValidate(rows, options, folds) {
    const k = folds || 5;
    let correct = 0;
    let loss = 0;
    for (let f = 0; f < k; f++) {
      const trainRows = rows.filter((_, i) => i % k !== f);
      const testRows = rows.filter((_, i) => i % k === f);
      const m = train(trainRows, options);
      for (const r of testRows) {
        const p = predict(m, r.prompt, r.attempt).pHold;
        const truth = String(r.label).toUpperCase() === "HOLD" ? 1 : 0;
        if ((p >= 0.5 ? 1 : 0) === truth) correct++;
        loss -= truth ? Math.log(Math.max(p, 1e-12)) : Math.log(Math.max(1 - p, 1e-12));
      }
    }
    return { accuracy: correct / rows.length, logLoss: loss / rows.length };
  }

  /**
   * Adapter so the benchmark can score the model like the rule engine.
   * score = 100 x (1 - p(HOLD)), so higher still means "more effort shown";
   * decision is "needs_effort" when p(HOLD) >= threshold.
   */
  function createAnalyzer(model, threshold) {
    const cut = threshold === undefined ? 0.5 : threshold;
    return function analyze(prompt, options) {
      const attempt = (options && options.attempt) || "";
      if (!String(prompt || "").trim()) {
        return { score: 0, decision: "empty", signals: [], pHold: null };
      }
      const r = predict(model, prompt, attempt);
      return {
        score: Math.round((1 - r.pHold) * 100),
        decision: r.pHold >= cut ? "needs_effort" : "pass",
        pHold: r.pHold,
        signals: r.contributions.slice(0, 5).map((c) => ({ id: c.term, kind: c.value > 0 ? "request" : "effort", value: c.value })),
      };
    };
  }

  return { tokenize, featureTokens, train, predict, crossValidate, createAnalyzer, DEFAULTS };
});
