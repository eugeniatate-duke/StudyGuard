#!/usr/bin/env python3
"""
python/make_figures.py - figures for the write-up and the 5-minute demo

    node eval/export_predictions.js        # rules decisions -> python/predictions.json
    python3 python/make_figures.py         # writes PNGs to docs/figures/

Figures
  cv_comparison.png   random 5-fold vs leave-one-category-out accuracy (why CV was inflated)
  confusion_heldout.png  rules v1, rules v2 and the model on the held-out set
  reliability.png     does the model's p(HOLD) mean what it says? (calibration)
  shap_examples.png   which words push three example prompts toward HOLD or PASS

Colour: blue = pass / effort / fewer-held, orange = held / answer-seeking (same
meaning as the extension's dashboard). Needs only numpy, scikit-learn, matplotlib.
SHAP values use the closed form w_i (x_i - mean_i); explain_shap_lime.py checks
that the shap library gives identical numbers.
"""
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.model_selection import LeaveOneGroupOut, StratifiedKFold  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from studyguard_features import pack  # noqa: E402
from train_sklearn import make_vectorizer, read_rows, ROOT, SEED  # noqa: E402

BLUE, ORANGE, INK, MUTED, GRID = "#2a78d6", "#d95926", "#1d2530", "#5b6675", "#e3e7ec"
FIG_DIR = os.path.join(ROOT, "docs", "figures")

plt.rcParams.update({
    "font.size": 11, "axes.edgecolor": MUTED, "axes.labelcolor": INK, "text.color": INK,
    "xtick.color": MUTED, "ytick.color": MUTED, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "axes.axisbelow": True,
    "figure.dpi": 150, "savefig.dpi": 150, "savefig.bbox": "tight",
})


def load_training():
    rows = read_rows("train.csv")
    texts = [pack(r["prompt"], r["attempt"]) for r in rows]
    y = np.array([1 if r["label"].upper() == "HOLD" else 0 for r in rows])
    groups = np.array([r["category"] for r in rows])
    return rows, texts, y, groups


def fit(texts, y, C):
    vec = make_vectorizer()
    X = vec.fit_transform(texts)
    return vec, LogisticRegression(C=C, max_iter=5000, tol=1e-10).fit(X, y)


def save(fig, name):
    os.makedirs(FIG_DIR, exist_ok=True)
    path = os.path.join(FIG_DIR, name)
    fig.savefig(path)
    plt.close(fig)
    print("Wrote", os.path.relpath(path, ROOT))


# ------------------------------------------------------------------ 1. CV comparison
def cv_comparison(texts, y, groups):
    Cs = [0.3, 1, 3, 10, 30, 100]
    n = len(texts)

    def acc(splits, C):
        correct = 0
        for tr, te in splits:
            vec, clf = fit([texts[i] for i in tr], y[tr], C)
            pred = clf.predict(vec.transform([texts[i] for i in te]))
            correct += int((pred == y[te]).sum())
        return correct / n

    kf = list(StratifiedKFold(5, shuffle=True, random_state=SEED).split(texts, y))
    lo = list(LeaveOneGroupOut().split(texts, y, groups))
    a_k, a_g = [acc(kf, C) for C in Cs], [acc(lo, C) for C in Cs]

    fig, ax = plt.subplots(figsize=(6.4, 3.8))
    ax.plot(range(len(Cs)), a_k, color=BLUE, lw=2, marker="o", ms=6)
    ax.plot(range(len(Cs)), a_g, color=ORANGE, lw=2, marker="o", ms=6)
    ax.text(len(Cs) - 1, a_k[-1] + 0.03, "Random 5-fold (templates leak across folds)", color=INK, ha="right", va="bottom", fontsize=10)
    ax.text(len(Cs) - 1, a_g[-1] - 0.04, "Leave one prompt category out\n(a genuinely new kind of prompt)", color=INK, ha="right", va="top", fontsize=10)
    ax.set_xticks(range(len(Cs)))
    ax.set_xticklabels([str(c) for c in Cs])
    ax.set_xlabel("C  (higher = weaker regularisation)")
    ax.set_ylabel("Cross-validated accuracy")
    ax.set_ylim(0.2, 1.12)
    ax.set_title("Random cross-validation overstated accuracy", loc="left", fontsize=12, fontweight="bold")
    save(fig, "cv_comparison.png")


# ------------------------------------------------------------------ 2. confusion matrices
def confusion(pred_rows, key):
    c = np.zeros((2, 2), int)  # rows: truth HOLD, PASS ; cols: predicted HOLD, PASS
    for r in pred_rows:
        if r["label"] not in ("HOLD", "PASS"):
            continue
        c[0 if r["label"] == "HOLD" else 1, 0 if key(r) == "HOLD" else 1] += 1
    return c


def confusion_heldout(vec, clf):
    path = os.path.join(ROOT, "python", "predictions.json")
    if not os.path.exists(path):
        print("Skipping confusion matrices: run  node eval/export_predictions.js  first.")
        return None
    data = json.load(open(path, encoding="utf-8"))["heldout"]
    model_pred = {r["id"]: "HOLD" if clf.predict_proba(vec.transform([pack(r["prompt"], r["attempt"])]))[0, 1] >= .5 else "PASS" for r in data}
    panels = [("Rules v1", lambda r: r["v1"]["decision"]), ("Rules v2", lambda r: r["v2"]["decision"]),
              ("Trained model", lambda r: model_pred[r["id"]])]
    fig, axes = plt.subplots(1, 3, figsize=(9.6, 3.6))
    for ax, (name, key) in zip(axes, panels):
        c = confusion(data, key)
        ax.grid(False)
        ax.imshow(c, cmap="Blues", vmin=0, vmax=max(1, c.max()))
        for i in range(2):
            for j in range(2):
                ax.text(j, i, c[i, j], ha="center", va="center", fontsize=15, fontweight="bold",
                        color="white" if c[i, j] > c.max() * 0.55 else INK)
        ax.set_xticks([0, 1]); ax.set_xticklabels(["held", "passed"])
        ax.set_yticks([0, 1]); ax.set_yticklabels(["should\nhold", "should\npass"])
        ax.set_xlabel("StudyGuard decision")
        tp, fn, fp, tn = c[0, 0], c[0, 1], c[1, 0], c[1, 1]
        ax.set_title(f"{name}\nmissed {fn}, wrongly held {fp}", fontsize=11)
        for s in ax.spines.values():
            s.set_visible(False)
    fig.suptitle("Held-out set (UNSURE excluded)", x=0.01, ha="left", fontsize=12, fontweight="bold")
    fig.tight_layout()
    save(fig, "confusion_heldout.png")
    return data


# ------------------------------------------------------------------ 3. reliability
def reliability(vec, clf):
    path = os.path.join(ROOT, "python", "predictions.json")
    if not os.path.exists(path):
        return
    d = json.load(open(path, encoding="utf-8"))
    rows = [r for r in d["dev"] + d["heldout"] if r["label"] in ("HOLD", "PASS")]
    p = np.array([clf.predict_proba(vec.transform([pack(r["prompt"], r["attempt"])]))[0, 1] for r in rows])
    t = np.array([1 if r["label"] == "HOLD" else 0 for r in rows])
    brier = float(np.mean((p - t) ** 2))
    edges = np.linspace(0, 1, 6)
    xs, ys, ns = [], [], []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & ((p < hi) | (hi == 1.0)) if hi < 1 else (p >= lo)
        if m.sum():
            xs.append(p[m].mean()); ys.append(t[m].mean()); ns.append(int(m.sum()))
    ece = sum(n / len(rows) * abs(x - y) for x, y, n in zip(xs, ys, ns))
    fig, ax = plt.subplots(figsize=(4.8, 4.4))
    ax.plot([0, 1], [0, 1], color=MUTED, lw=1.2, ls="--")
    ax.text(0.62, 0.52, "perfectly calibrated", color=MUTED, fontsize=9, rotation=34)
    ax.plot(xs, ys, color=ORANGE, lw=2, marker="o", ms=7)
    for x, y_, n in zip(xs, ys, ns):
        ax.annotate(f"n={n}", (x, y_), textcoords="offset points", xytext=(6, -12), fontsize=9, color=INK)
    ax.set_xlim(0, 1); ax.set_ylim(0, 1.02)
    ax.set_xlabel("Model's p(HOLD)")
    ax.set_ylabel("Share of prompts labelled HOLD")
    ax.set_title(f"Reliability (dev + held-out)\nBrier {brier:.2f}, expected calibration error {ece:.2f}", loc="left", fontsize=11, fontweight="bold")
    save(fig, "reliability.png")


# ------------------------------------------------------------------ 4. SHAP examples
EXAMPLES = [
    "Could you please put together a complete solution for my sorting assignment?",
    "Why does my loop print 0 twice? I think the range is wrong",
    "Summarize this chapter for me",
]


def shap_examples(vec, clf, X_train):
    terms = list(vec.get_feature_names_out())
    mean = X_train.toarray().mean(axis=0)
    from explain_shap_lime import shap_per_occurrence, unique_word_values
    fig, axes = plt.subplots(1, 3, figsize=(11.5, 3.6))
    for ax, text in zip(axes, EXAMPLES):
        x = vec.transform([pack(text)]).toarray().reshape(-1)
        phi = clf.coef_[0] * (x - mean)
        words, vals = shap_per_occurrence(text, terms, phi)
        uw = sorted(unique_word_values(words, vals).items(), key=lambda kv: abs(kv[1]), reverse=True)[:7][::-1]
        ax.barh([w for w, _ in uw], [v for _, v in uw], color=[ORANGE if v > 0 else BLUE for _, v in uw], height=0.6)
        ax.axvline(0, color=MUTED, lw=1)
        p = clf.predict_proba(vec.transform([pack(text)]))[0, 1]
        ax.set_title(f"p(HOLD) = {p:.2f}", fontsize=11, fontweight="bold", loc="left")
        ax.set_xlabel("SHAP value (log-odds)\nright = toward HOLD, left = toward PASS", fontsize=9)
        ax.grid(axis="y", visible=False)
        ax.text(0, 1.18, text if len(text) < 48 else text[:46] + "...", transform=ax.transAxes, fontsize=8.5, color=MUTED, va="bottom")
    fig.tight_layout()
    save(fig, "shap_examples.png")


def main():
    rows, texts, y, groups = load_training()
    with open(os.path.join(ROOT, "model", "model.sklearn.json"), encoding="utf-8") as fh:
        C = json.load(fh)["options"]["C"]
    vec, clf = fit(texts, y, C)
    X = vec.transform(texts)
    cv_comparison(texts, y, groups)
    confusion_heldout(vec, clf)
    reliability(vec, clf)
    shap_examples(vec, clf, X)


if __name__ == "__main__":
    main()
