# Trained model vs rule sets: results

Model = TF-IDF + logistic regression (`model.js`), trained on 400 synthetic prompts
(`eval/train.csv`), threshold p(HOLD) >= 0.5. Rules = `engine.js` v1 and v2.
Positive class = HOLD. UNSURE excluded. Brackets are Wilson 95% intervals.
Reproduce: `node eval/benchmark.js --set <dev|heldout> --rules <v1|v2|model>`.

## Held-out set (36 decided) - the fair test

| Metric | Rules v1 | Rules v2 | Trained model |
|---|---|---|---|
| Accuracy | 67% (24/36) | **92% (33/36)** [78-97] | 78% (28/36) [62-88] |
| Precision | 100% (8/8) | **100% (17/17)** [82-100] | 75% (18/24) [55-88] |
| Recall | 40% (8/20) | 85% (17/20) [64-95] | **90% (18/20)** [70-97] |
| Students wrongly held (of 16 PASS) | 0 | 0 | **6** (specificity 63% [39-82]) |

## Dev set (79 decided) - optimistic for the rules (tuned on it)

| Metric | Rules v1 | Rules v2 | Trained model |
|---|---|---|---|
| Accuracy | 65% | 91% [83-96] | 84% (66/79) [74-90] |
| Precision | 89% | 100% | 84% (37/44) [71-92] |
| Recall | 40% | 84% | 86% (37/43) [73-93] |
| Wrongly held | 2 | 0 | 7 |

(The model never saw the dev or held-out sets, so its dev numbers are not inflated.)

## What this shows

- The model catches slightly more answer-seeking prompts than v2 (recall 90% vs 85%
  held-out, 86% vs 84% dev), but the difference is 2 prompts - well within noise.
- Its real cost is false alarms: it wrongly held 6 of 16 legitimate held-out prompts
  (7 on dev), where v2 held none. For a tool meant to coach rather than punish,
  wrongly blocking honest students is the more serious failure.
- On held-out accuracy the model (78%) ties the naive keyword baseline (78%); v2 (92%)
  is higher, although the intervals overlap, so this is suggestive, not conclusive.
- The cross-validation score on the training data was 100%. The held-out result
  shows that number was inflated: template-generated data repeats its own
  patterns, so the model partly learned the templates (e.g. "for me" co-occurs with
  HOLD in the generated data, so study requests like "summarize this for me" get held).

## Interpretation and decision

Rule v2 stays the default decision engine. The trained model is kept for what it
adds that rules cannot: weights learned from data, exact explanations (SHAP for a
linear model), and a second, independent view to compare explanations against
(next step). The trade-off is a design finding worth presenting: more flexible
learned model = more false alarms when trained on synthetic data; hand-written
rules = more precise but only as good as the vocabulary we anticipated.

## Limitations

- 36 decided held-out prompts; intervals are wide, and a few prompts change a percentage.
- One annotator; prompts written by the project team, not real students.
- Training data is synthetic and templated; real student phrasing is more varied.
- Model comparison reports one trained model with one threshold. No tuning on held-out was done.
- A hybrid (e.g. hold only if rules and model agree) is a plausible improvement but must
  be evaluated on fresh data, not the held-out set already used here.
