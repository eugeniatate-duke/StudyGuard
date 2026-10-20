#!/usr/bin/env python3
"""
python/explain_shap_lime.py - run the real SHAP and LIME libraries on StudyGuard's model

    pip install -r python/requirements.txt
    python3 python/explain_shap_lime.py
    python3 python/explain_shap_lime.py --out docs/python-explanations.md

WHAT IT DOES
  1. Re-trains the scikit-learn model on eval/train.csv (same settings as
     python/train_sklearn.py) and checks it matches model/model.sklearn.json.
  2. SHAP:  shap.LinearExplainer gives exact values for a linear model.
     The script checks them against the closed form  w_i * (x_i - mean_i).
  3. LIME:  lime.lime_text.LimeTextExplainer fits a local linear surrogate.
  4. Occlusion: remove a word everywhere, re-run the model (same idea as the
     rule engine's perturbation.js).
  5. Compares the three on the dev and held-out prompts that the model holds
     (no labels used): rank agreement, top-word agreement, LIME stability.
  6. Writes python/shap_parity.json: per-word SHAP values that
     tests/shap_parity.test.js checks the JavaScript implementation against.

Values are "toward HOLD" when positive, "toward PASS" when negative.
Units differ (SHAP: log-odds, LIME and occlusion: probability) so only RANKS
are compared, never raw sizes.
"""
import argparse
import json
import os
import re
import sys

import numpy as np
from scipy.stats import spearmanr

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from studyguard_features import pack  # noqa: E402
from train_sklearn import make_vectorizer, read_rows, ROOT  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402

WORD_RE = re.compile(r"[A-Za-z0-9à-ÿ'‘’]+")  # same as explain.js
LIME_SPLIT = r"[^a-z0-9à-ÿ']+"


def norm(w):
    return w.lower().replace("‘", "'").replace("’", "'")


def need(module):
    try:
        return __import__(module, fromlist=["x"])
    except ImportError:
        sys.exit(f"Missing package '{module}'. Run: pip install -r python/requirements.txt")


# ---------------------------------------------------------------- model
def load_model():
    rows = read_rows("train.csv")
    texts = [pack(r["prompt"], r["attempt"]) for r in rows]
    y = np.array([1 if r["label"].upper() == "HOLD" else 0 for r in rows])
    with open(os.path.join(ROOT, "model", "model.sklearn.json"), encoding="utf-8") as fh:
        saved = json.load(fh)
    vec = make_vectorizer()
    X = vec.fit_transform(texts)
    clf = LogisticRegression(C=saved["options"]["C"], max_iter=5000, tol=1e-10).fit(X, y)
    diff = float(np.max(np.abs(clf.coef_[0] - np.array(saved["weights"]))))
    if diff > 1e-6:
        sys.exit(f"Retrained weights differ from model.sklearn.json by {diff:.2e}. Re-run train_sklearn.py.")
    return vec, clf, X


def p_hold(vec, clf, prompt, attempt=""):
    return float(clf.predict_proba(vec.transform([pack(prompt, attempt)]))[0, 1])


# ---------------------------------------------------------------- SHAP
def shap_feature_values(shap, clf, X_train_dense, x_dense):
    """Exact SHAP values for a linear model (one value per TF-IDF feature).

    NOTE: shap.maskers.Independent keeps only 100 background rows by default
    (max_samples=100), which silently changes the background mean. We pass
    every training row so the result equals w_i * (x_i - mean_i) exactly.
    """
    masker = shap.maskers.Independent(X_train_dense, max_samples=X_train_dense.shape[0])
    explainer = shap.LinearExplainer((clf.coef_[0], clf.intercept_[0]), masker)
    vals = explainer.shap_values(x_dense)
    vals = np.asarray(vals[1] if isinstance(vals, list) else vals)
    return vals.reshape(-1)


def closed_form_shap(clf, mean, x_dense):
    return clf.coef_[0] * (x_dense.reshape(-1) - mean)


def shap_per_occurrence(prompt, terms, phi):
    """Spread feature values over the words that carry them (mirrors explain.js)."""
    words = [m.group(0) for m in WORD_RE.finditer(prompt)]
    idx = {}
    for i, w in enumerate(words):
        idx.setdefault(norm(w), []).append(i)
    values = [0.0] * len(words)
    for term, value in zip(terms, phi):
        if term.startswith("a_"):
            continue
        holders = [i for part in term.split(" ") for i in idx.get(part, [])]
        for h in holders:
            values[h] += float(value) / len(holders)
    return words, values


def unique_word_values(words, values):
    out = {}
    for w, v in zip(words, values):
        out[norm(w)] = out.get(norm(w), 0.0) + v
    return out


# ---------------------------------------------------------------- LIME & occlusion
def lime_values(lime_text, vec, clf, prompt, seed, samples=500):
    text = norm(prompt)
    explainer = lime_text.LimeTextExplainer(
        class_names=["PASS", "HOLD"], split_expression=LIME_SPLIT, bow=True,
        feature_selection="none", random_state=seed)

    def predict(strings):
        return clf.predict_proba(vec.transform([pack(s) for s in strings]))

    n_words = len(set(re.findall(r"[a-z0-9à-ÿ']+", text)))
    exp = explainer.explain_instance(text, predict, labels=(1,), num_features=n_words, num_samples=samples)
    return {w: float(v) for w, v in exp.as_list(label=1)}


def occlusion_values(vec, clf, prompt):
    """p(HOLD) minus p(HOLD) with the word removed everywhere."""
    base = p_hold(vec, clf, prompt)
    out = {}
    for w in {norm(m.group(0)) for m in WORD_RE.finditer(prompt)}:
        stripped = " ".join(t for t in re.findall(r"\S+", norm(prompt))
                            if norm("".join(WORD_RE.findall(t))) != w)
        out[w] = base - p_hold(vec, clf, stripped)
    return out


# ---------------------------------------------------------------- comparison
def top(d, k):
    return [w for w, _ in sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))[:k]]


def compare(a, b):
    """Rank agreement between two {word: value} dicts."""
    words = sorted(set(a) & set(b))
    if len(words) < 3:
        return None
    va, vb = [a[w] for w in words], [b[w] for w in words]
    rho = spearmanr(va, vb).correlation if len(set(va)) > 1 and len(set(vb)) > 1 else float("nan")
    t1 = top(a, 1)[0] == top(b, 1)[0] if max(va) > 0 and max(vb) > 0 else None
    t3 = len(set(top(a, 3)) & set(top(b, 3))) / 3
    return rho, t1, t3


def summarise(results):
    rhos = [r[0] for r in results if r and not np.isnan(r[0])]
    t1 = [r[1] for r in results if r and r[1] is not None]
    t3 = [r[2] for r in results if r]
    return (len(rhos), float(np.median(rhos)) if rhos else float("nan"),
            float(np.mean(t1)) if t1 else float("nan"), float(np.mean(t3)) if t3 else float("nan"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", help="write the markdown report here")
    ap.add_argument("--samples", type=int, default=500, help="LIME samples per prompt")
    args = ap.parse_args()

    shap = need("shap")
    lime_text = need("lime.lime_text")

    vec, clf, X = load_model()
    terms = list(vec.get_feature_names_out())
    Xd = X.toarray()
    mean = Xd.mean(axis=0)

    prompts = [r["prompt"] for name in ("prompts.csv", "heldout.csv") for r in read_rows(name) if r["prompt"].strip()]
    held = [p for p in prompts if p_hold(vec, clf, p) >= 0.5 and len(set(norm(w) for w in WORD_RE.findall(p))) >= 3]
    print(f"{len(prompts)} prompts, model holds {len(held)} with >= 3 distinct words")

    # --- SHAP: library vs closed form, and parity file for the JavaScript test ---
    worst = 0.0
    parity = []
    shap_by_prompt = {}
    for p in held:
        x = vec.transform([pack(p)]).toarray()
        phi = shap_feature_values(shap, clf, Xd, x)
        worst = max(worst, float(np.max(np.abs(phi - closed_form_shap(clf, mean, x)))))
        words, values = shap_per_occurrence(p, terms, phi)
        shap_by_prompt[p] = unique_word_values(words, values)
    print(f"SHAP library vs closed form w*(x-mean): max difference {worst:.2e}")
    if worst > 1e-6:
        sys.exit("shap.LinearExplainer disagrees with the closed form; check the background set "
                 "(see the note in shap_feature_values) before trusting any SHAP numbers.")
    for p in held[:12]:
        x = vec.transform([pack(p)]).toarray()
        phi = shap_feature_values(shap, clf, Xd, x)
        words, values = shap_per_occurrence(p, terms, phi)
        parity.append({"prompt": p, "attempt": "", "words": words, "values": values})
    with open(os.path.join(ROOT, "python", "shap_parity.json"), "w", encoding="utf-8") as fh:
        json.dump(parity, fh, indent=1, ensure_ascii=False)
    print("Wrote python/shap_parity.json")

    # --- LIME and occlusion, then compare ---
    pairs = {("shap", "lime"): [], ("shap", "occlusion"): [], ("lime", "occlusion"): [], ("lime seed1", "lime seed2"): []}
    for i, p in enumerate(held, 1):
        s = shap_by_prompt[p]
        l1 = lime_values(lime_text, vec, clf, p, seed=1, samples=args.samples)
        l2 = lime_values(lime_text, vec, clf, p, seed=2, samples=args.samples)
        o = occlusion_values(vec, clf, p)
        pairs[("shap", "lime")].append(compare(s, l1))
        pairs[("shap", "occlusion")].append(compare(s, o))
        pairs[("lime", "occlusion")].append(compare(l1, o))
        pairs[("lime seed1", "lime seed2")].append(compare(l1, l2))
        if i % 10 == 0:
            print(f"  explained {i}/{len(held)} prompts")

    lines = ["# SHAP and LIME libraries vs occlusion (Python)", "",
             "Generated by `python3 python/explain_shap_lime.py`. No labels used.", "",
             f"Prompts the model holds (>= 3 distinct words): {len(held)}. LIME samples per prompt: {args.samples}.", "",
             f"`shap.LinearExplainer` matches the closed form `w_i (x_i - mean_i)`: max difference {worst:.1e}.", "",
             "| Pair | Prompts | Median Spearman | Top-1 agree | Top-3 overlap |", "|---|---|---|---|---|"]
    for (a, b), res in pairs.items():
        n, rho, t1, t3 = summarise(res)
        lines.append(f"| {a} vs {b} | {n} | {rho:.2f} | {t1 * 100:.0f}% | {t3 * 100:.0f}% |")
    lines += ["", "Words are unique lower-case words; SHAP values are summed over repeated words.",
              "Only ranks are compared (SHAP is in log-odds, LIME and occlusion in probability).", ""]
    md = "\n".join(lines)
    print("\n" + md)
    if args.out:
        with open(os.path.join(ROOT, args.out), "w", encoding="utf-8") as fh:
            fh.write(md)
        print("Written to", args.out)


if __name__ == "__main__":
    main()
