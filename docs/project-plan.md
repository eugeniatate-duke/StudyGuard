# StudyGuard: Project Plan

*Eugenia Tate, AIPI 590 XAI, Duke University. Status: **v1.0, as built**. This document began as the v0.3 plan; sections 1, 3, 4, 7, 8, 9 and 10 now describe what was actually delivered and where it differs from the plan. Items marked `[TODO]` need the author's input or verification.*

## 1. One-paragraph summary

StudyGuard is a privacy-preserving Chrome extension (Manifest V3, plain JavaScript, no server, no account, no paid service) that adds *explainable friction* to AI-assisted studying on ChatGPT and Claude. When a student presses Send, a local rule engine scores the prompt for answer-seeking versus effort-showing wording. If the score is below the pass mark, a soft-block card explains why: a Prompt Breakdown Map in the Chrome side panel, the exact words that moved the score (found by removing each word and re-scoring), and a counterfactual hint naming the smallest thing the student could add to unlock the prompt. The student can always choose "Send anyway". An opt-in local Learning Journal can be exported as Markdown or PDF, and a privacy-safe analytics dashboard summarises behaviour without ever storing prompt text.

The project contributes (1) the working tool; (2) blind-labelled evaluation sets with an annotation guide and a held-out test set; (3) a benchmark of the rule engine (v1 and v2) and a trained TF-IDF + logistic regression model; (4) an evaluation of exact SHAP, LIME and perturbation explanations (agreement, faithfulness, stability); (5) a check that counterfactual hints are valid and minimal; (6) a red-team stress test; and (7) a reproducible Python and JavaScript pipeline with parity tests. **No user study was run**; claims about behaviour and learning are therefore not made.

## 2. Problem and motivation

My case-study worksheet (Overreliance on AI in Education) identified the core harm: generative AI makes cognitive offloading far cheaper than earlier tools did, so students can look successful without retaining skills, while instructors cannot tell genuine effort from AI assistance. The worksheet's redesign asked for a system that is **helpful** (hints, quizzing, scaffolding instead of copy-paste answers), **honest** (states that outputs can be wrong and that it is uncertain) and **harmless** (guardrails, and a way for students to show their reasoning).

The literature supports taking this seriously, and also says the picture is mixed:

- **Unguarded AI can hurt learning, guardrails can mitigate it.** In a field experiment with nearly a thousand high school math students, a standard ChatGPT-style tutor improved practice performance but, per secondary summaries, led to about 17% lower scores on a later unassisted exam than having no AI. A tutor prompted to give hints rather than answers largely avoided that harm (Bastani et al., 2025). `[TODO: confirm the 17% figure against the paper itself]`
- **Cognitive cost.** A preprint using EEG and essay tasks reports weaker neural connectivity and lower self-reported ownership in the LLM group (Kosmyna et al., 2025). It is a small, not-yet-peer-reviewed study, so I cite it as suggestive.
- **Students feel the tension themselves.** In UK focus groups (N = 28), students valued AI for summarizing and clarifying but worried about reduced critical thinking and unclear boundaries (Cena et al., 2026). A US survey of 467 students found 72% saw efficiency or understanding gains while 46% worried about reduced independent thinking, and nearly half had unclear understanding of AI policies (Enriquez, Lin & Baciu, 2026).
- **The evidence is not one-sided.** In a controlled study of novice programmers, AI code generation raised performance without hurting later manual code modification (Kazemitabaar et al., 2023). Design and context matter, which is exactly why a configurable, transparent intervention is interesting.
- **K-12 risks.** `[TODO: add 2-3 sentences from your ScienceDirect source, "Potential Risks of Generative AI Integration into K-12 Education" (Computers and Education: AI). I could not open the page automatically, so I have not summarized it.]`

**Gap this project targets.** Most guardrail work (including Bastani et al.) changes the tutor's behavior inside a provider-controlled system. Students mostly use general-purpose chatbots they control. StudyGuard puts the guardrail on the *student's side of the interface*, and, because the student is the one being nudged, it must explain itself in a way the student can understand and act on. That makes explanation quality a central design question, not a decoration.

## 3. Research questions

**Primary question (as delivered).** Can a small, fully transparent, student-side classifier separate answer-seeking prompts from effort-showing prompts well enough to nudge students, while explaining every decision with explanations that are faithful to the system and actionable?

| # | Sub-question | Status | Evidence |
|---|---|---|---|
| RQ1 | How accurately can transparent rules and a small trained model detect answer-seeking requests, and where do they fail? | **Answered** | `docs/evaluation-results.md`, `docs/v2-results.md`, `docs/model-results.md`, `docs/error-analysis.md` |
| RQ2 | How faithful, stable and mutually consistent are SHAP, LIME and perturbation explanations for this task? | **Answered** | `docs/explanation-fidelity.md`, `docs/python-explanations.md` |
| RQ3 | Are counterfactual hints valid and minimal? | **Answered for validity and minimality** (actionability not rated by people) | `docs/counterfactual-results.md` |
| RQ4 | Does the tool change prompting behaviour, and do students find the explanations understandable and useful? | **Not carried out** (no participants); proposed protocol kept in `docs/evaluation-plan.md` | n/a |
| RQ5 | How easily can the system be gamed or evaded? | **Answered with a stress test** (author-side, small) | `docs/redteam-results.md` |

**Claims made and not made.** The project claims measured behaviour of the scorer and models on small labelled sets, and measured consistency of explanations with those systems. It does **not** claim changed prompting behaviour, improved learning, understandability to students, or fairness across language backgrounds; none of these was studied.

## 4. Contribution

1. **A working student-side tool**: explainable soft friction around general-purpose chatbots, local-only, with no API key, account or subscription.
2. **Evaluation data and method**: an annotation guide, a blind-labelled dev set, a separate held-out test set with frozen labels, Wilson confidence intervals (Wilson, 1927), baselines, and a documented error analysis. Prompts are drafted mostly by an AI assistant and labelled by one annotator (see limitations).
3. **An XAI evaluation on a human-centred task**: exact SHAP, LIME and perturbation compared on the same model, with rank agreement, deletion-test faithfulness and seed stability (a *functionally grounded* evaluation in the sense of Doshi-Velez and Kim, 2017, which involves no human subjects), and the finding that explanations transfer poorly between the rule engine and the trained model.
4. **A recourse-style counterfactual generator** restricted to actionable inputs (what the student can change), verified by re-scoring, with measured validity and minimality.
5. **A red-team stress test** of evasion and gaming, reported with its limits.
6. **A reproducible pipeline**: JavaScript and Python implementations kept in step by parity tests (scikit-learn probabilities and `shap` values reproduced in JavaScript), pinned dependencies, and 145 automated tests.

## 5. Course concepts demonstrated

Explainable AI (SHAP, LIME, counterfactuals, glass-box design), Interpretable ML (linear model vs. black box tradeoff), Human-AI Interaction (friction, scaffolding, trust calibration), AI Harms (overreliance, cognitive offloading), AI Evaluation (blind labelling, held-out benchmark, confidence intervals, error analysis), Red-Teaming (gaming tests), AI Governance (student-facing accountability artifact, equal access by design).

## 6. Stakeholders

| Group | Interest | Risk from this tool |
|---|---|---|
| Students | Learn without losing skill; clarity about acceptable use | Annoyance, false accusations of "answer-seeking", feeling surveilled, being nudged by an imperfect model |
| Instructors | Evidence of reasoning and effort | Over-trusting the journal export as proof of authorship |
| Institutions | Integrity, clear policy | Treating a heuristic as an integrity detector |
| Students with fewer resources | Free, no-account access | Language and subject coverage may be uneven |
| AI providers | Responsible use of their products | Page changes break the extension |

Per Enriquez et al. (2026), policy ambiguity drives integrity anxiety, so StudyGuard is explicitly **not** a cheating detector and never reports anything to anyone.

## 7. System design (as built)

### 7.1 Layers

1. **Interception and gating** (`sites.js`, `interceptor.js`, `gate.js`): per-site adapters for ChatGPT and Claude; capture-phase handling of Send; a hold is decided locally; any failure falls open so the prompt is sent normally.
2. **Scoring** (`engine.js`): transparent rules. A prompt starts at 50; request signals subtract points, effort signals add points; 50 or more passes. Rules v2 is the default; v1 is kept so results stay comparable.
3. **Explanation layer** (`perturbation.js`, `counterfactual.js`, `breakdownmap.js`, side panel): word-level importance by removal, a verified minimal hint, and a Prompt Breakdown Map with intent, effort and a plain-language explanation.
4. **Reflection layer** (`journal.js`, `journalexport.js`, `eventlog.js`, `analytics.js`): opt-in journal with Markdown and print-to-PDF export; a privacy-safe event log feeding an analytics dashboard with CSV and PDF export.
5. **Research layer** (`model.js`, `explain.js`, `python/`, `eval/`): a TF-IDF + logistic regression model trained in Python (scikit-learn; Pedregosa et al., 2011) or JavaScript and run in JavaScript, exact SHAP, LIME-style and occlusion explanations, and the evaluation scripts. This layer supports the study of explanations; the model is **not** the default decision-maker because it wrongly holds too many honest prompts.

### 7.2 Architecture and privacy

See the diagram and folder map in the README. No network calls, no remote scripts, no API keys. Storage is `chrome.storage.local` only. The event log never stores prompt text; journal text is off by default, local, visible, exportable and deletable.

### 7.3 Helpful / Honest / Harmless mapping

| Worksheet principle | Feature |
|---|---|
| Helpful: hint, explain | Hint levels (levels 2-3 unlock after an attempt), counterfactual advice that says what to add |
| Honest: admit uncertainty | The card says "advice, not a verdict"; scores are labelled rule points, not probabilities; limits documented in `docs/limitations-and-ethics.md` |
| Harmless: guardrails, accountability | Soft block with a logged override; fail-open design; local-only data; student-owned journal |
| Equal access | No account, key, subscription or model download needed |

Planned but **not built**: a "quiz me instead" template and a persistent "AI can be wrong" notice.

## 8. Limitations, failure modes and misuse

The full analysis is in `docs/limitations-and-ethics.md`. In brief:

- **Labels are one person's definition.** "Answer-seeking" is subjective; one annotator labelled everything. A planned second annotator was **not** used, so no inter-rater agreement is reported.
- **Prompts are not real student data.** The dev and held-out prompts were drafted mostly by an AI assistant that also helped build the rules, and the training set is template-generated, so shared blind spots and style artefacts are possible.
- **Small samples**: 79 decided dev prompts and 36 decided held-out prompts; confidence intervals are wide.
- **Gaming and evasion**: padding, paraphrase, role-play, other languages and look-alike characters defeat wording-based rules (see `docs/redteam-results.md`); a student can always type into the chatbot directly. The tool is voluntary and enforces nothing.
- **False positives**: the trained model wrongly held many honest prompts; rules v2 held none on the held-out set but the sample is small.
- **No user study**: whether the explanations help, annoy or mislead students is unknown.
- **Fairness not evaluated** across language background, dialect or writing style.
- **It does not check the chatbot's answers.**
- **Fragile integration**: site changes can break selectors; the tool fails open.
- **Journal privacy and misuse as surveillance**: documented; opt-in and student-initiated only.

## 9. Delivery history

Each step was built on its own branch and merged only with passing tests.

| Milestone | Contents |
|---|---|
| v0.2 | Hint levels and cleanup |
| v0.3 | Project plan, evaluation plan, annotation guide draft |
| Engine and explainers | Rule engine, perturbation word importance, counterfactual hints (with tests) |
| Page integration | Per-site adapters, interceptor, soft-block gate, event log |
| v0.5 | Prompt Breakdown Map in the Chrome side panel |
| v0.6-0.7 | Opt-in journal; Markdown and PDF export |
| v0.8 | Analytics dashboard with CSV and PDF export |
| Evaluation | Dev set and benchmark (v1); held-out set; rules v2 and v1-vs-v2 results |
| Trained model | Synthetic training set, JavaScript and scikit-learn models, parity tests |
| Explanation evaluation | SHAP, LIME and perturbation compared; `shap` and `lime` libraries run in Python; figures and notebook |
| Hardening | Red-team stress test, counterfactual validity check, limitations and ethics, README, pinned requirements |

Deviations from the v0.3 roadmap: the trained model is a research companion rather than the shipped classifier; the behavioural study, survey and think-aloud (E3, E4) were not carried out; the second annotator was not used; gradient boosting and a transformer were not trained; quiz mode was not built.

## 10. Future work

- **A user study** with consent and ethics approval: attempt-first rate, solution leakage, comprehension of explanations (protocol in `docs/evaluation-plan.md`).
- **A second annotator** and inter-rater agreement; a larger, representative prompt collection from real students; subgroup analysis by language and writing style.
- **A better model**: calibration, more varied training data, and hybrid rules plus model evaluated on fresh data.
- **Inline highlights** in the chat text box and a model "second opinion" in the side panel.
- Multilingual support; other chat interfaces; in-class deployment under instructor control.
- Measuring solution leakage in the chatbot's reply (needs semantic judgement and raises privacy questions).

## 11. References

Verified against the pages I could open on 2026-10-19. Fill in or correct anything marked `[verify]`.

- Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. *Proceedings of the National Academy of Sciences, 122*, e2422633122.
- Cena, E., McParland, A., Toivo, W., Dalton, B., Mundy, M., O'Connor, P. A., Robertson, A. E., Swingler, M., Wilson, P., & Duncan, C. (2026). Studying with GenAI: Student views on the opportunities and risks of GenAI in higher education. *Education and Information Technologies*. https://doi.org/10.1007/s10639-026-13923-3
- Enriquez, P., Lin, H.-Y., & Baciu, C. (2026). Artificial intelligence in higher education: Student use, perceived benefits, and emerging risks. *Frontiers in Education, 11*, 1812390. https://doi.org/10.3389/feduc.2026.1812390
- Doshi-Velez, F., & Kim, B. (2017). Towards a rigorous science of interpretable machine learning. arXiv:1702.08608.
- Pedregosa, F., et al. (2011). Scikit-learn: Machine learning in Python. *Journal of Machine Learning Research, 12*, 2825-2830.
- Wilson, E. B. (1927). Probable inference, the law of succession, and statistical inference. *Journal of the American Statistical Association, 22*(158), 209-212. (Confidence intervals used throughout the evaluation.)
- Kazemitabaar, M., Chow, J., Ma, C. K. T., et al. (2023). Studying the effect of AI code generators on supporting novice learners in introductory programming. *CHI 2023*. https://doi.org/10.1145/3544548.3580919 `[TODO: complete the author list from the ACM page]`
- Kosmyna, N., Hauptmann, E., Yuan, Y. T., Situ, J., Liao, X.-H., Beresnitzky, A. V., Braunstein, I., & Maes, P. (2025). Your brain on ChatGPT: Accumulation of cognitive debt when using an AI assistant for essay writing task. arXiv:2506.08872 (preprint).
- Lundberg, S. M., & Lee, S.-I. (2017). A unified approach to interpreting model predictions. *Advances in Neural Information Processing Systems 30*.
- Ribeiro, M. T., Singh, S., & Guestrin, C. (2016). "Why should I trust you?": Explaining the predictions of any classifier. *KDD 2016*. arXiv:1602.04938.
- Wachter, S., Mittelstadt, B., & Russell, C. (2017/2018). Counterfactual explanations without opening the black box: Automated decisions and the GDPR. *Harvard Journal of Law & Technology, 31*. arXiv:1711.00399.
- Randomized experiment on AI tools, learning outcomes and over-reliance, Corvinus University of Budapest. arXiv:2510.16019. `[verify authors and year before citing]`
- "When thinking is outsourced: Cognitive offloading and the heterogeneity of critical thinking among Chinese university students using generative AI." *Journal of Intelligence, 14*(7), 116. https://doi.org/10.3390/jintelligence14070116 `[verify authors]`
- `[TODO]` K-12 risks article from *Computers and Education: AI* (your ScienceDirect link, pii S2666920X26000226): add full citation.

Background reading to consider, not yet checked: a 2023 systematic review of AI risks in school education (*Bulletin of Science, Technology and Society*, 43(3-4), 67-85, titled "Potential Risks of Artificial Intelligence Integration into School Education: A Systematic Review") and the Brookings Institution's "premortem" report on generative AI in K-12 education, which I only saw through news coverage.
