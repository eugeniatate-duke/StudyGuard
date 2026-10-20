#!/usr/bin/env python3
"""
python/train_sklearn.py - train StudyGuard's classifier with scikit-learn

    python3 python/train_sklearn.py

WHAT IT DOES
  1. Reads eval/train.csv (synthetic training prompts). The dev set
     (eval/prompts.csv) and held-out set (eval/heldout.csv) are NOT read.
  2. Builds TF-IDF features (same pipeline as model.js) and fits an L2-regularised
     logistic regression. The regularisation strength is chosen on the training
     set only, by leave-one-category-out cross-validation: train on seven prompt
     categories, test on the eighth (e.g. never-seen "essay requests"). Ordinary
     k-fold CV is also printed, but it is NOT used for the choice: the training
     prompts come from templates, so random folds share templates and reward
     memorising them (accuracy 100% at any setting).
  3. Writes model/model.sklearn.json in the format model.js reads, so the Chrome
     extension can run this model with no Python.
  4. Writes python/parity_cases.json: prompts with the probabilities Python
     produced. tests/parity.test.js checks that JavaScript reproduces them.

WHY PYTHON AND JAVASCRIPT
  Python is the research environment (training, cross-validation, SHAP, LIME).
  Chrome extensions run JavaScript, so the trained model is exported as plain
  JSON (a vocabulary, idf values, one weight per feature, a bias) and the
  browser only does the arithmetic.

REGULARISATION NOTE
  scikit-learn minimises  C x sum(log loss) + 0.5 x |w|^2.
  model.js (and docs) use  mean(log loss) + (lambda/2) x |w|^2.
  They are the same model when lambda = 1 / (C x n_train).
"""
import csv
import json
import os
import sys

import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, LeaveOneGroupOut
from sklearn.metrics import accuracy_score, log_loss

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from studyguard_features import pack, analyzer  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = 590


def read_rows(name):
    with open(os.path.join(ROOT, "eval", name), newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def make_vectorizer():
    # lowercase=False: the analyzer already lowercases. These settings match model.js:
    # sublinear tf (1 + ln tf), smoothed idf (ln((1+n)/(1+df)) + 1), L2 normalisation.
    return TfidfVectorizer(analyzer=analyzer, min_df=2, sublinear_tf=True,
                           smooth_idf=True, norm="l2", lowercase=False)


def main():
    rows = read_rows("train.csv")
    texts = [pack(r["prompt"], r["attempt"]) for r in rows]
    y = np.array([1 if r["label"].upper() == "HOLD" else 0 for r in rows])
    n = len(rows)
    print(f"Training rows: {n}  (HOLD {int(y.sum())}, PASS {n - int(y.sum())})")

    # --- choose C on training data only ---
    groups = np.array([r["category"] for r in rows])

    def cv_probs(splits, C):
        probs = np.zeros(n)
        for tr, te in splits:
            vec = make_vectorizer()
            Xtr = vec.fit_transform([texts[i] for i in tr])
            clf = LogisticRegression(C=C, max_iter=5000, tol=1e-10).fit(Xtr, y[tr])
            probs[te] = clf.predict_proba(vec.transform([texts[i] for i in te]))[:, 1]
        return probs

    kfold = list(StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED).split(texts, y))
    by_group = list(LeaveOneGroupOut().split(texts, y, groups))
    best = None
    print("C      lambda    5-fold acc/logloss     leave-one-category-out acc/logloss")
    for C in [0.3, 1, 3, 10, 30, 100]:
        pk, pg = cv_probs(kfold, C), cv_probs(by_group, C)
        print(f"{C:<6} {1 / (C * n):<9.5f} {accuracy_score(y, pk >= .5):.3f} / {log_loss(y, pk):.3f}"
              f"          {accuracy_score(y, pg >= .5):.3f} / {log_loss(y, pg):.3f}")
        if best is None or log_loss(y, pg) < best[1]:
            best = (C, log_loss(y, pg), accuracy_score(y, pg >= .5))
    C, cv_ll, cv_acc = best
    print(f"Chosen C = {C} (lowest leave-one-category-out log loss)")

    # --- fit on all training data ---
    vec = make_vectorizer()
    X = vec.fit_transform(texts)
    clf = LogisticRegression(C=C, max_iter=5000, tol=1e-10).fit(X, y)

    terms = vec.get_feature_names_out()
    model = {
        "type": "tfidf-logreg",
        "version": 1,
        "trainer": f"scikit-learn {sklearn.__version__}",
        "options": {"C": C, "lambda": 1 / (C * n), "minDf": 2},
        "vocab": {t: i for i, t in enumerate(terms)},
        "idf": [float(v) for v in vec.idf_],
        "weights": [float(w) for w in clf.coef_[0]],
        "bias": float(clf.intercept_[0]),
        "trainRows": n,
        "cv": {"scheme": "leave-one-category-out", "accuracy": float(cv_acc), "logLoss": float(cv_ll)},
    }
    out = os.path.join(ROOT, "model", "model.sklearn.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(model, fh)
    print(f"Vocabulary size: {len(terms)}\nWrote {os.path.relpath(out, ROOT)}")

    # --- parity cases: JavaScript must reproduce these probabilities ---
    cases = [(r["prompt"], r["attempt"]) for r in rows[:25]]
    cases += [
        ("Could you please write the full code for a binary search in Python?", ""),
        ("Dame el código completo para ordenar una lista", ""),
        ("Don’t give me the answer, just a hint for problem 3", ""),
        ("Why does my loop fail?", "I tried a for loop over the list and compare each item with the target"),
        ("Write a Python function for a binary search", "asdf asdf asdf asdf asdf"),
        ("", ""),
        ("hello", ""),
    ]
    parity = []
    for prompt, attempt in cases:
        p = float(clf.predict_proba(vec.transform([pack(prompt, attempt)]))[0, 1])
        parity.append({"prompt": prompt, "attempt": attempt, "pHold": p})
    with open(os.path.join(ROOT, "python", "parity_cases.json"), "w", encoding="utf-8") as fh:
        json.dump(parity, fh, indent=1, ensure_ascii=False)
    print(f"Wrote python/parity_cases.json ({len(parity)} cases)")

    order = np.argsort(clf.coef_[0])
    print("\nTop words pushing toward HOLD:")
    for i in order[::-1][:10]:
        print(f"  +{clf.coef_[0][i]:.2f}  {terms[i]}")
    print("Top words pushing toward PASS:")
    for i in order[:10]:
        print(f"  {clf.coef_[0][i]:.2f}  {terms[i]}")


if __name__ == "__main__":
    main()
