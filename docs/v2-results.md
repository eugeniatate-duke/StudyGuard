# Rule set v1 vs v2: results

Positive class = HOLD. UNSURE prompts are excluded (not counted right or wrong).
Intervals are Wilson 95% confidence intervals. Produced with
`node eval/benchmark.js --set <dev|heldout> --rules <v1|v2>`.

## Held-out set (40 prompts, 36 decided) - the fair test

v2 was designed from the dev-set mistakes only. These prompts were written and
labelled before v2 existed and were not used to tune it.

| Metric | v1 | v2 | Keyword baseline |
|---|---|---|---|
| Accuracy | 67% (24/36) [50-80] | **92% (33/36) [78-97]** | 78% (28/36) [62-88] |
| Precision | 100% (8/8) | 100% (17/17) [82-100] | - |
| Recall | 40% (8/20) [22-61] | **85% (17/20) [64-95]** | - |
| Missed / wrongly held | 12 / 0 | 3 / 0 | - |

## Dev set (90 prompts, 79 decided) - optimistic

v2 rules were written after reading the dev-set errors, so these numbers are
expected to be inflated.

| Metric | v1 | v2 |
|---|---|---|
| Accuracy | 65% (51/79) [54-74] | 91% (72/79) [83-96] |
| Precision | 89% (17/19) | 100% (36/36) |
| Recall | 40% (17/43) [26-54] | 84% (36/43) [70-92] |
| Missed / wrongly held | 26 / 2 | 7 / 0 |

## Reading the results

- v1 was precise but missed most answer-seeking prompts (recall 40% on both sets).
  The gap was vocabulary coverage, not the scoring idea.
- v2 roughly doubled recall on both sets (40% to 85% held-out, 40% to 84% dev).
  Held-out and dev agree closely, which suggests the gain is not just fitting the dev set.
- No student prompt was wrongly held on the held-out set (precision 100%).
  The interval is still wide: the true precision could be as low as 82%.
- v2 beats the naive keyword baseline on held-out accuracy (92% vs 78%), but the
  intervals overlap (78-97 vs 62-88). With 36 decided prompts we cannot claim a
  significant difference.

## Limitations of this evaluation

- Small sample: 36 decided held-out prompts; intervals are wide.
- One annotator, no inter-rater agreement; labels reflect one person's judgement.
- Prompts were written by the project team, not collected from real students.
- Dev results are optimistic because v2 was tuned on them. Held-out results are
  fair only while the held-out set stays untouched; the rules must not be tuned further on it.
- Known unfixable by pattern rules: other languages beyond a few Spanish phrases,
  role-play, indirection ("print it"), padding a prompt with filler phrases.
- Precision is high partly because v2 rules only fire on explicit request wording.
  Recall of 85% means about 1 in 7 answer-seeking prompts still slips through.

## Next

Inspect the 3 held-out misses and 7 dev misses (`--out` report, "Missed" section)
and list them in docs/error-analysis.md as known gaps rather than adding rules.
