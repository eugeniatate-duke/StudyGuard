# Limitations, risks and responsible use

This document states what StudyGuard does **not** do, who it affects, how it can fail, and how it could be misused. It is written to be read alongside the results in `docs/v2-results.md`, `docs/model-results.md` and `docs/explanation-fidelity.md`.

## 1. What the tool claims and does not claim

**It measures** the *wording* of a prompt: whether it asks for finished work with no sign of the student's own thinking.

**It does not measure** what the student intends, whether they are cheating, whether an attempt is correct or sincere, or whether they will learn. "Cheating vs attempting" in the project brief is a simplification; the tool's honest framing is **answer-seeking wording vs effort-showing wording**. Scores are rule points, not probabilities. The trained model's number is an uncalibrated model score (Brier 0.11, expected calibration error 0.06 on 115 labelled prompts; bins hold only 12-40 prompts each).

It is a **coaching nudge**, not an integrity detector. It should never be used to accuse, grade or discipline a student.

## 2. Stakeholders

| Stakeholder | Interest | Main risk | How the design responds |
|---|---|---|---|
| **Students** | Get useful help; keep control | Being wrongly blocked; feeling policed; learning to game the tool | Soft block with "Send anyway"; every decision explained; hints say how to unlock; fails open |
| **Instructors** | Students who learn, not just submit | Treating output as proof of honesty or dishonesty | Journal is student-controlled and opt-in; documentation states it is not proof either way |
| **Institutions** | Academic integrity policy | Using it for surveillance or enforcement | No server, no reporting channel, no identity; event log has no prompt text |
| **AI providers** | Smooth product use | Page integration breaks when their pages change | Selectors isolated in `sites.js`; fail-open behaviour |
| **Students with different language backgrounds or writing styles** | Fair treatment | Terse, non-native or non-English phrasing scored as "answer-seeking" or missed | Not evaluated; listed as a known gap (section 4) |
| **Researchers / graders** | Reproducible, honest evaluation | Over-claiming from small samples | Confidence intervals, held-out set, frozen labels, stated limitations |

## 3. Failure modes

**False positives (honest student held)**
- Rules v2: 0 of 16 honest held-out prompts held (interval is wide: the true rate could be higher).
- Trained model: 6 of 16 held-out and 7 of 36 dev honest prompts wrongly held (e.g. "Summarize this chapter for me", because "for me" correlated with answer-seeking in the synthetic training data). This is why the model is not the default.
- Terse or blunt phrasing by a student who has in fact worked on the problem can look identical to a lazy request.
- Impact: friction and loss of trust. Mitigation: "Send anyway", explanations, and a visible way to see what to change.

**False negatives (answer-seeking prompt passes)**
- Rules v2 recall on the held-out set was 85% (17 of 20); 3 answer-seeking prompts passed.
- Known evasions: paraphrase and indirection ("print it", "make it work"), role-play ("act as my tutor and do the whole assignment"), other languages beyond a few Spanish phrases, multi-turn requests, pasting a whole assignment as context.
- **Gaming:** padding a prompt with effort-sounding filler can raise the score without any real effort; filler in the attempt box earns no credit in v2, but this is a heuristic, not a guarantee.

**Explanation failure modes**
- **Explanations are only faithful to the system they explain.** Perturbation highlights from the rule engine agree with the rules (deleting the top words unlocks 84-91% of prompts) but barely transfer to the trained model (rank correlation about 0.37). If both engines were ever shown, each highlight must be labelled with its source.
- Word removal can create unnatural text; importance for repeated or redundant phrases can be understated.
- **Over-trust:** a clear explanation can make a wrong decision look authoritative. Counter-measures: wording stresses "signals in your wording", the override is one click, and the scores are labelled as rule points.
- No user study was run, so we do not know whether the explanations help students understand, change behaviour, or simply annoy them.

**Technical and deployment failure modes**
- ChatGPT and Claude change their pages often; a layout change can stop interception (the tool then fails open, i.e. does nothing) or place the card badly.
- Chrome-only (side panel needs Chrome 116+); not tested on other browsers.
- Another extension or a page update could conflict with the event capture.

## 4. Fairness and equity (not evaluated)

The evaluation sets were written by one author, in English, and labelled by that author. No analysis was done across language background, dialect, disability, or writing style. Plausible harms that were **not** measured: students writing in a second language being held more often; terse prompts from students with different communication styles; students without a computer-science background not knowing what an "error log" or "attempt" should look like. Any real deployment would require a representative prompt collection and a subgroup analysis first.

## 5. Misuse risks

| Risk | Why it matters | Mitigation in the design | Remaining risk |
|---|---|---|---|
| Used by an instructor or institution to monitor or penalise students | A coaching tool becomes surveillance | Local-only; no reporting; no identity; event log excludes text | Someone could require students to hand over the journal or analytics |
| Journal treated as proof of honest work | A journal is easy to fabricate | Documentation states it is a reflection aid, not evidence | Over-interpretation by readers |
| Used to teach evasion | Visible rules show how to phrase a prompt to pass | Hints push toward real effort (attempt, error, stuck point); filler gets no credit in the attempt box | A motivated user can still learn to game wording |
| Stored prompt text on a shared computer | Journal holds the student's text | Off by default; local only; capped at 200 entries; one-click clear | Anyone with browser access can read it |
| Dependence on the tool's judgement | Students stop thinking for themselves | Explanations ask the student to articulate their approach | Not studied |

## 6. Privacy summary

No network requests; no accounts; no analytics sent anywhere. The event log stores time, site, action, score and rule identifiers (never prompt text; latest 500 events). The journal, when switched on, stores prompts and attempts locally (latest 200 entries, 4,000 characters each). Exports are created and saved by the student.

## 7. Evaluation limitations

- Small samples: 36 decided held-out prompts and 79 decided dev prompts; confidence intervals are wide (e.g. rules v2 held-out accuracy 92%, interval 78-97%).
- One annotator, no inter-rater agreement. Labels reflect one person's judgement; UNSURE prompts were excluded from scoring.
- Prompts were written by the project author, not collected from students; they may not match real student language.
- The dev set was used while designing rules v2, so its results are optimistic; the held-out set is the fair test and was not used to tune anything.
- The trained model's training data are templates; random cross-validation was inflated (100%) compared with leave-one-category-out (about 67-70%).
- Explanation-quality checks (agreement, deletion tests, stability) show consistency with the models, **not** usefulness to learners.

## 8. What would be needed before real classroom use

1. A user study with students (with ethics approval): do the explanations change behaviour and learning, and how do students feel about the soft block?
2. A larger, representative prompt collection with more than one annotator, and a subgroup (language, writing style) analysis.
3. An agreed instructor and institutional policy that the tool is a coaching aid and the journal is voluntary.
4. A maintenance plan for site changes, and a clear way for students to report wrong holds.
5. Calibration and monitoring of the model score if it is ever exposed to students.

## 9. Responsible AI principles, and where they show up

| Principle | In this project |
|---|---|
| **Transparency / explainability** | Rules with listed weights; word-level highlights; counterfactual hints verified by re-scoring; SHAP/LIME comparison for the trained model |
| **Human oversight and contestability** | Soft block with "Send anyway"; overrides logged for the student's own reflection |
| **Privacy** | Local only; text never in the event log; journal opt-in |
| **Fairness** | Acknowledged gap; not evaluated (section 4) |
| **Accountability / honest reporting** | Held-out set, frozen labels, confidence intervals, error analysis, stated limits |
| **Safety / robustness** | Fail-open design; evasion and gaming documented in section 3 (a fuller red-team write-up is future work) |
