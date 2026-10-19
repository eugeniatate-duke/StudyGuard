# StudyGuard: Evaluation Plan

*v0.3 draft. Written before the ML and study work so the build answers fixed questions. Numeric targets are goals for judging results honestly, not promises. Items marked `[TODO]` need a decision.*

## 1. Purpose and scope

This plan defines how StudyGuard will be evaluated against the research questions in `project-plan.md`. There are five evaluations:

| ID | Evaluates | RQ | Type |
|---|---|---|---|
| E1 | Classifier accuracy and failure modes | RQ1 | Offline benchmark |
| E2 | Explanation fidelity, stability, agreement, counterfactual quality | RQ2, RQ3 | Offline experiments |
| E3 | Effect on prompting behavior and answer leakage | RQ4 | Small within-subjects study |
| E4 | Understandability and usefulness of explanations | RQ4 | Survey and think-aloud |
| E5 | Gaming and evasion | RQ5 | Red-team |

**Non-claims.** No claim of improved learning or exam performance. No claim that the classifier measures effort or intent. No claim of generalization beyond English study prompts in the sampled subjects.

## 2. Data

### 2.1 Task definitions

- **T1, question intent:** `answer_seeking` vs. `learning_seeking`, label of the student's question.
- **T2, attempt engagement:** `low` / `medium` / `high`, label of the student's attempt text (empty attempts are handled by a rule, not the model).

### 2.2 Annotation guide (to be written in `ml/data/ANNOTATION_GUIDE.md`)

- Definitions with 4-6 positive and negative examples per label and per subject.
- Decision rules for borderline cases (for example, "explain the solution to X" is `learning_seeking` only if it asks for reasoning rather than the final result).
- Engagement rubric for attempts: restates the problem only (low), names an approach or first step (medium), shows reasoning with a specific stuck point (high).
- Instruction to label from the text alone, without guessing the student's motive.

### 2.3 Dataset construction

- **Target size:** 600 to 1,000 question examples and 300 to 500 attempt examples. `[TODO: adjust to the time available]`
- **Subjects:** math, writing, programming, science, roughly balanced.
- **Sources, kept separate with a `source` column:** (a) hand-written by me, (b) LLM-generated from templates and then human reviewed, (c) examples contributed by classmates with consent and no personal data. Real student text is preferred; synthetic text is flagged.
- **Splits:** train / validation / test, stratified by label and subject, **grouped by template/source** so near-duplicates never straddle splits. A separate **hand-written-only test set** measures transfer away from synthetic style.
- **Quality control:** a second annotator labels at least 100 examples. Report Cohen's kappa and a confusion matrix between annotators. Disagreements are resolved by discussion, and the original labels are kept in the repo.
- **Data statement:** sources, annotator count, label definitions, known gaps, consent and privacy handling.

## 3. E1: Classifier benchmark (RQ1)

**Models compared**

1. Majority class (floor).
2. Keyword/regex rules (the "no ML" baseline from the earlier design).
3. TF-IDF + logistic regression (ships in the extension).
4. Gradient boosting on TF-IDF and handcrafted features (notebook only).
5. Optional: fine-tuned small transformer (notebook only), if time allows `[TODO]`.

**Metrics.** Macro-F1 (primary), per-class precision and recall, PR-AUC, expected calibration error and a reliability plot (the UI shows a confidence, so calibration matters), 95% bootstrap confidence intervals.

**Slices.** By subject, by prompt length, by source (synthetic vs. hand-written), and on a small set of hard cases (paraphrased answer requests, polite phrasing, code and math symbols).

**Error analysis.** At least 30 misclassified examples read and categorized (for example, ambiguous wording, subject cues, label noise). Report what the model cannot see.

**Decision rule for what ships.** Ship the linear model if its macro-F1 is within an agreed margin of the black box (target: within 0.05) or if the black box is not meaningfully better on the hand-written test set. Report the tradeoff either way.

## 4. E2: Explanation evaluation (RQ2, RQ3)

All explanation methods are applied to the same held-out examples.

### 4.1 Methods

- **Exact linear attributions** (weight × feature value, relative to a background) for the linear model. For a linear model with independent features this equals SHAP, which gives a built-in correctness check.
- **SHAP** (Lundberg & Lee, 2017) on the linear model (sanity check) and on the black-box model.
- **LIME** (Ribeiro et al., 2016) on both models.

### 4.2 Metrics

| Property | Measure |
|---|---|
| **Fidelity (deletion)** | Remove or mask the top-k attributed words and measure the drop in predicted probability. Compare against removing k random words. A good explanation shows a clearly larger drop. |
| **Fidelity (insertion)** | Start from a neutral baseline and add the top-k words back, measuring the rise. |
| **Method agreement** | Spearman rank correlation and top-k overlap (k = 3, 5) between SHAP and LIME, per model. |
| **Stability** | Re-run LIME with different random seeds and with light paraphrases (synonym swaps, punctuation changes). Report top-k overlap across runs. |
| **Implementation parity** | The in-browser JavaScript attribution must match Python on the same inputs to a tolerance (for example, 1e-6). Automated test in the repo. |
| **Cost** | Time per explanation in the browser, for the linear and grouped-feature cases. |

### 4.3 Counterfactual evaluation

Counterfactuals search only over **actionable** inputs (the student's attempt: presence, length, reasoning terms), never the question or anything the student cannot reasonably change.

| Property | Measure |
|---|---|
| **Validity** | Share of counterfactuals that actually flip or lower the model's output when re-scored. |
| **Sparsity / minimality** | Number and size of changes required. |
| **Actionability** | Manual rating on a sample (can a student do this in under a minute? is it a genuine learning behavior and not just typing filler?). |
| **Gaming check** | Whether the counterfactual can be satisfied with meaningless text (links to E5). |

Counterfactuals follow the "smallest change to obtain a different outcome" framing of Wachter et al. (2017/2018).

## 5. E3: Behavioral study (RQ4)

**Design.** Within-subjects, counterbalanced order. Each participant does two short study sessions with comparable problem sets: one in **plain ChatGPT** and one with **StudyGuard on**. `[TODO: decide participant count; target 6 to 10 classmates]`

**Tasks.** Four to six problems per session across math, programming and short-answer science or writing, matched in difficulty by two pilot readers. Problem sets are counterbalanced across conditions.

**Measures**

| Measure | How |
|---|---|
| Attempt-first rate | Share of problems where the participant wrote an attempt before requesting help (counted from the StudyGuard log and from a screen-recorded or self-reported plain condition). |
| Hint level used | Distribution across levels in the StudyGuard condition. |
| Answer-seeking requests | Share of first prompts labeled `answer_seeking` by two human raters (not by the model, to avoid circularity). |
| **Solution leakage** | Rate each ChatGPT response on a 0 to 3 rubric (0 = conceptual pointer, 1 = names the approach, 2 = works most steps, 3 = full solution). Two raters, report agreement. |
| Time and effort | Time per problem, self-reported effort (single Likert item). |
| Optional quick check | A 2 to 3 question, no-AI mini quiz on the same concepts at the end of each session. Reported descriptively, not as evidence of learning. |

**Analysis.** Paired comparisons (Wilcoxon signed-rank) with effect sizes and confidence intervals. With so few participants the analysis is descriptive and exploratory; I will say so and show individual-level data rather than only means.

**Ethics.** Check with the instructor whether the course requires IRB review or an exemption for classroom projects `[TODO]`. Informed consent, voluntary participation, no personal identifiers, no collection of coursework from other classes, participants can withdraw and have their data deleted. The extension stores data locally; participants export their own logs.

## 6. E4: Explanation usefulness (RQ4)

- **Short survey** after the StudyGuard session (five-point Likert items): the explanation was understandable, helped me decide what to do next, made me trust the tool more or less, felt fair, felt intrusive. Items adapted from common XAI and usability scales `[TODO: choose and cite a scale]`.
- **Think-aloud with three to five participants**: observe whether they actually use the word highlights and counterfactuals, or ignore them.
- **Comprehension check**: ask participants to predict how the estimate would change if they edited their attempt in a given way, then compare with the model. This tests whether explanations support a correct mental model.
- **Open comments**, coded thematically.

## 7. E5: Red-team (RQ5)

Course topic: red-teaming. Adversarial cases, each run through the classifiers and the unlock logic:

| Attack | Example | Measure |
|---|---|---|
| Filler attempt | Meaningless or copied text to unlock levels 2 to 3 | Share that unlock |
| Paraphrased answer-seeking | "Walk me through the final result" | Detection rate vs. blunt phrasing |
| Embedded instruction | Question text that tries to override the hint rules | Whether the generated request still contains the safeguards (the extension only builds text, so this tests prompt construction) |
| Obfuscation | Typos, unusual spacing, mixed language, symbols | Detection drop |
| Over-flagging | Legitimate conceptual questions phrased tersely | False positive rate |
| Counterfactual gaming | Following a counterfactual literally with low-value text | Whether the estimate drops without real engagement |

Report evasion rates with examples and describe mitigations tried and what remains open. Also document that students can bypass the tool entirely.

## 8. Success criteria

Stated now so results are not rationalized later. These are targets; missing them is a finding, not a failure of the project.

- **E1:** Linear model macro-F1 clearly above the keyword baseline on the hand-written test set, with calibration reported.
- **E2:** Top-k deletion drops probability significantly more than random deletion for the shipped model; JS/Python parity holds; SHAP/LIME agreement and stability reported honestly, including disagreements.
- **E3:** Direction and size of change in attempt-first rate and leakage reported with confidence intervals, whatever they show.
- **E4:** Majority of participants can correctly predict the direction of at least one counterfactual change.
- **E5:** Evasion rates reported with mitigations; no claim of robustness.

## 9. Threats to validity

- **Small N, classmates as participants:** not representative; selection and demand effects.
- **Novelty effect:** a new tool changes behavior briefly.
- **Rater subjectivity:** leakage rubric and labels are judgments; mitigated by two raters and agreement statistics.
- **Synthetic data:** model may learn generation artifacts; mitigated by grouped splits and a hand-written test set.
- **Circularity:** the model labels behavior that the tool itself changes; mitigated by human raters in E3.
- **ChatGPT variability:** responses differ across runs and model versions; record date, model name shown, and conversation settings.
- **Context limits:** English only, selected subjects, one chat interface.

## 10. Reproducibility

- Fixed random seeds, pinned `requirements.txt`, notebooks that run end to end.
- `ml/data/` holds the dataset (consented and de-identified), annotation guide, data statement, and a README listing sources and licenses.
- `make` or documented commands to retrain, evaluate and regenerate `model.js`.
- Automated tests for `buildHintRequest`, model inference parity and counterfactual validity.
- Study materials (task sets, rubric, survey, consent text) in `docs/study/`.
- No API keys, remote datasets or model downloads are required to run the extension; Python dependencies are needed only to retrain.

## 11. Timeline

| Version | Evaluation work |
|---|---|
| v0.4 | Rule-based counterfactual tests; define E5 attack list |
| v0.5a | Annotation guide, dataset, inter-annotator agreement |
| v0.5b | E1 benchmark and error analysis |
| v0.5c | E2 fidelity, agreement, stability |
| v0.5d | Parity tests, counterfactual validity |
| v0.7 | E3 study, E4 survey, E5 red-team, results write-up |
