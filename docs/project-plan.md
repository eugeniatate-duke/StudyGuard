# StudyGuard: Project Plan

*Eugenia Tate, AIPI 590 XAI, Duke University. Status: v0.3 draft. Items marked `[TODO]` need your input or verification.*

## 1. One-paragraph summary

StudyGuard is a privacy-preserving Chrome extension that adds *explainable friction* to AI-assisted studying. Before a student sends a question to ChatGPT, StudyGuard asks for their own attempt, offers graduated hints instead of full solutions, estimates how answer-seeking the request looks with a small on-device classifier, and explains every decision to the student (which words drove the estimate, which rule produced each line of the generated prompt, and what small change would lower the risk). Nothing leaves the browser. The project contributes a working tool, a labeled dataset and annotation guide, an evaluation of SHAP, LIME and exact linear attributions on a student-facing task, and a small behavioral study.

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

**Primary question.** Can a local, student-side tool that gates graduated hints behind the student's own attempt, and explains its decisions with faithful and actionable explanations, shift study prompts from answer-seeking toward attempt-first learning, and do students find those explanations understandable and useful?

| # | Sub-question | Evidence (see evaluation-plan.md) |
|---|---|---|
| RQ1 | How accurately can a small on-device text classifier detect answer-seeking requests and engaged attempts, and where does it fail? | E1 benchmark and error analysis |
| RQ2 | How faithful, stable and mutually consistent are SHAP and LIME attributions for this task, and how do they compare with exact linear-model attributions? | E2 explanation fidelity |
| RQ3 | Are counterfactual explanations valid, minimal and actionable for students? | E2 counterfactual metrics |
| RQ4 | Does the tool change prompting behavior and how much of a full solution ChatGPT reveals, and do students find the explanations understandable and useful? | E3 behavioral study, E4 survey |
| RQ5 | How easily can the system be gamed or evaded? | E5 red-teaming |

**Claims I will and will not make.** I will claim changes in *prompting behavior* and *perceived usefulness of explanations*. I will not claim improved learning outcomes unless a retention measure supports it, and a short study with a handful of participants cannot establish that.

## 4. Contribution

1. **A new interface/workflow**: student-side explainable friction around a general-purpose chatbot, with local-only operation and no API key, account or subscription.
2. **A dataset and annotation guide** for "answer-seeking vs. learning-seeking" study prompts and attempt engagement, with documented limits.
3. **An XAI evaluation on a human-centered task**: exact attribution vs. SHAP vs. LIME on a transparent model, and SHAP/LIME on a more accurate black-box model, with fidelity, stability, agreement and deletion tests.
4. **A recourse-style counterfactual generator** restricted to actionable inputs (what the student can change: their attempt), not inputs they cannot or should not change.
5. **A red-team report** on gaming and evasion of an educational friction tool.

## 5. Course concepts demonstrated

Explainable AI (SHAP, LIME, counterfactuals, glass-box design), Interpretable ML (linear model vs. black box tradeoff), Human-AI Interaction (friction, scaffolding, trust calibration), AI Harms (overreliance, cognitive offloading), AI Evaluation (benchmarks, user study), Red-Teaming (gaming tests), AI Governance (student-facing accountability artifact, equal access by design).

## 6. Stakeholders

| Group | Interest | Risk from this tool |
|---|---|---|
| Students | Learn without losing skill; clarity about acceptable use | Annoyance, false accusations of "answer-seeking", feeling surveilled, being nudged by an imperfect model |
| Instructors | Evidence of reasoning and effort | Over-trusting the journal export as proof of authorship |
| Institutions | Integrity, clear policy | Treating a heuristic as an integrity detector |
| Students with fewer resources | Free, no-account access | Language and subject coverage may be uneven |
| AI providers | Responsible use of their products | Page changes break the extension |

Per Enriquez et al. (2026), policy ambiguity drives integrity anxiety, so StudyGuard is explicitly **not** a cheating detector and never reports anything to anyone.

## 7. System design

### 7.1 Layers

1. **Friction layer (built in v0.2).** Student writes an attempt. Hint levels 1-3 (conceptual nudge, point to the step, one worked step). Levels 2-3 unlock only after an attempt. The generated request always forbids a complete solution.
2. **Glass-box layer (v0.4).** `buildHintRequest` returns tagged segments, each with a rule ID and the inputs it used, so the panel can show "Why this prompt?" with an exact mapping from each line to its rule.
3. **Model layer (v0.5).** On-device classifiers: (a) answer-seeking vs. learning-seeking question, (b) attempt engagement low/medium/high. A TF-IDF + logistic regression model ships inside the extension as JSON weights. A gradient-boosted or small transformer model is trained in Python for comparison only.
4. **Explanation layer (v0.5).** Student-facing: highlighted words that pushed the estimate, plain-language reasons, and counterfactuals ("a 15-word attempt that names your first step lowers the estimate from X to Y"). Researcher-facing: SHAP summaries, LIME comparisons, fidelity metrics in notebooks.
5. **Reflection layer (v0.6).** Opt-in local learning journal (attempt, hint level, optional "how I checked this" note), Markdown export, delete-all, and a small analytics popup.

### 7.2 Architecture and privacy

```
ml/ (Python, offline)                    extension (JavaScript, in browser)
  data/  annotation guide, labeled CSV     model.js     weights + vocabulary
  notebooks/ train, explain, evaluate ───► content.js   inference + explanations
  export_model.py → model.js               popup.*      settings, analytics
```

- No network calls, no API keys, no remote scripts. Storage is `chrome.storage.local` only.
- Counters (hint level, attempt present) are stored by default. Journal text is **off by default**, local, visible, exportable and deletable.
- The extension never sends anything to ChatGPT. It prepares a request the student reviews, edits, copies and sends.

### 7.3 Helpful / Honest / Harmless mapping

| Worksheet principle | Feature |
|---|---|
| Helpful: hint, quiz, explain | Hint ladder; "Quiz me instead" prompt template (planned v0.4) |
| Honest: admit uncertainty | Always-visible note that AI can be wrong; classifier confidence shown with its error rate; "How I checked this" journal field |
| Harmless: guardrails, accountability | Never-full-solution rule; attempt-gated levels; student-owned reasoning journal that can be shared with an instructor voluntarily |
| Equal access | No account, key, subscription or model download needed |

## 8. Limitations, failure modes and misuse

Stated up front because they shape the evaluation:

- **Labels are my definition.** "Answer-seeking" is subjective. The classifier learns the annotation guide, not ground truth. Mitigation: written guide, a second annotator on a subset, report agreement.
- **Synthetic data artifacts.** If training examples are LLM-generated, the model may learn generation style. Mitigation: split by source and template, include real or hand-written examples, test on a held-out hand-written set.
- **Gaming.** Filler text can unlock hint levels. Mitigation: engagement classifier plus red-team (E5), but a determined user can always type directly in ChatGPT. The tool is voluntary and cannot enforce anything.
- **False positives and chilling effects.** Legitimate "just explain this" questions may be flagged. The UI must present estimates as advice, never as verdicts.
- **Subject and language bias.** Math, writing and code prompts differ. English only in v1. Report per-subject metrics.
- **It does not check ChatGPT's answers.** Hallucinations remain possible. The tool reminds students to verify but cannot.
- **Fragile integration.** ChatGPT's page structure changes. Selectors may break. The extension should fail quietly and say so.
- **Privacy of the journal.** Stored in plain text on the device. Anyone with access to the browser profile could read it. Documented, opt-in.
- **Misuse as surveillance.** Someone could pressure students to share the journal or counters. Documented as a non-goal, and the export is student-initiated only.

## 9. Roadmap

Each version is demoable. The earliest versions are enough for an early presentation.

| Version | Contents | Branch |
|---|---|---|
| v0.2 (done) | Hint ladder, cleanup | merged |
| v0.3 | This plan, evaluation plan, annotation guide draft | `docs/plans` |
| v0.4 | Rule-tagged segments, "Why this prompt?", rule-based counterfactuals, quiz mode, honesty notice | `feature/glass-box-view` |
| v0.5a | Dataset and labeling | `ml/dataset` |
| v0.5b | Training and benchmark notebook | `ml/training` |
| v0.5c | SHAP/LIME analysis and fidelity metrics | `ml/explanations` |
| v0.5d | `model.js` export, JS inference, parity tests, word highlights, counterfactuals | `feature/model-inference` |
| v0.6 | Opt-in journal, export, analytics popup | `feature/journal-and-analytics` |
| v0.7 | Behavioral study, survey, red-team, results write-up | `docs/evaluation-results` |
| v1.0 | Polish, README with screenshots, demo video, release | `release/v1.0.0` |

## 10. Future work

- Multilingual support and per-subject models.
- Support for other chat interfaces (Claude, Gemini) and for in-class deployment under instructor control.
- Reading the chatbot's response to measure solution leakage automatically (needs semantic judgment and raises privacy questions).
- A longitudinal study with a retention measure to test learning effects.
- Instructor-facing, student-consented summaries that support assessment of reasoning rather than detection.

## 11. References

Verified against the pages I could open on 2026-10-19. Fill in or correct anything marked `[verify]`.

- Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. *Proceedings of the National Academy of Sciences, 122*, e2422633122.
- Cena, E., McParland, A., Toivo, W., Dalton, B., Mundy, M., O'Connor, P. A., Robertson, A. E., Swingler, M., Wilson, P., & Duncan, C. (2026). Studying with GenAI: Student views on the opportunities and risks of GenAI in higher education. *Education and Information Technologies*. https://doi.org/10.1007/s10639-026-13923-3
- Enriquez, P., Lin, H.-Y., & Baciu, C. (2026). Artificial intelligence in higher education: Student use, perceived benefits, and emerging risks. *Frontiers in Education, 11*, 1812390. https://doi.org/10.3389/feduc.2026.1812390
- Kazemitabaar, M., Chow, J., Ma, C. K. T., et al. (2023). Studying the effect of AI code generators on supporting novice learners in introductory programming. *CHI 2023*. https://doi.org/10.1145/3544548.3580919 `[TODO: complete the author list from the ACM page]`
- Kosmyna, N., Hauptmann, E., Yuan, Y. T., Situ, J., Liao, X.-H., Beresnitzky, A. V., Braunstein, I., & Maes, P. (2025). Your brain on ChatGPT: Accumulation of cognitive debt when using an AI assistant for essay writing task. arXiv:2506.08872 (preprint).
- Lundberg, S. M., & Lee, S.-I. (2017). A unified approach to interpreting model predictions. *Advances in Neural Information Processing Systems 30*.
- Ribeiro, M. T., Singh, S., & Guestrin, C. (2016). "Why should I trust you?": Explaining the predictions of any classifier. *KDD 2016*. arXiv:1602.04938.
- Wachter, S., Mittelstadt, B., & Russell, C. (2017/2018). Counterfactual explanations without opening the black box: Automated decisions and the GDPR. *Harvard Journal of Law & Technology, 31*. arXiv:1711.00399.
- Randomized experiment on AI tools, learning outcomes and over-reliance, Corvinus University of Budapest. arXiv:2510.16019. `[verify authors and year before citing]`
- "When thinking is outsourced: Cognitive offloading and the heterogeneity of critical thinking among Chinese university students using generative AI." *Journal of Intelligence, 14*(7), 116. https://doi.org/10.3390/jintelligence14070116 `[verify authors]`
- `[TODO]` K-12 risks article from *Computers and Education: AI* (your ScienceDirect link, pii S2666920X26000226): add full citation.

Background reading to consider, not yet checked: a 2023 systematic review of AI risks in school education (*Bulletin of Science, Technology and Society*, 43(3-4), 67-85, titled "Potential Risks of Artificial Intelligence Integration into School Education: A Systematic Review") and the Brookings Institution's "premortem" report on generative AI in K-12 education, which I only saw through news coverage.
