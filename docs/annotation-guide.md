# Annotation guide: HOLD or PASS

This guide explains how the evaluation set (`eval/prompts.csv`) is labelled, so
that the labels are consistent, can be repeated by someone else, and are made
**without seeing what StudyGuard's scorer says**.

## The question

For each message, imagine a thoughtful instructor who wants the student to
learn. Ask:

> Would that instructor want the student to do more of their own thinking
> **before** sending this to an AI?

## The labels

| Label | Use it when |
|---|---|
| **HOLD** | The message mainly asks the AI to produce the finished work or the final answer to the student's own assignment, and shows little or no effort of the student's own. |
| **PASS** | The message is a reasonable request for help. For example it shows the student's own attempt or reasoning, asks for a hint or a check, asks to understand a concept, or asks for something that is not the student's graded work. |
| **UNSURE** | You still cannot decide after about 30 seconds. Use sparingly (under 10%). UNSURE rows are reported separately and left out of accuracy. |

## Rules for the hard cases

1. **Judge the message as written.** Do not guess the student's motive. Wording
   that plainly asks for finished work is HOLD even when it is polite.
2. **Real effort counts; padding does not.** Filler ("ok", "asdf asdf") or a
   token "I tried" followed by a demand for the answer is not effort.
3. **The `attempt` column is the student's attempt box.** Judge the message and
   the attempt together. A real attempt counts; filler does not.
4. **Concept questions are PASS** unless they ask for the answer to an assigned
   problem.
5. **Would stopping this help the student learn?** If not (a formula, a trivial
   fact), label PASS.
6. **Judge meaning, not spelling or language.** Typos and other languages are
   labelled by what they ask for.
7. **Topic does not matter.** An essay request and a code request follow the
   same rules.

## Procedure (please follow it exactly)

1. **Label blind.** Do not run the scorer, read its rules, or open
   `eval/prompt_types.csv` until every row is labelled.
2. Work in one sitting, in file order. Budget 30 to 45 minutes.
3. Open `eval/prompts.csv` in a spreadsheet or VS Code. Type HOLD, PASS or
   UNSURE in the `label` column. Do not change other columns or reorder rows.
4. Save as **CSV UTF-8**. (Google Sheets: File, Download, CSV.)
5. Run `node eval/check-labels.js` to check the file is complete.
6. **Labels are frozen** once you see any scorer result. If you change one
   later, record the id, old label, new label and the reason in
   `docs/label-changes.md`, and report it in the write-up.

## Second annotator (recommended; NOT done in this project)

*Status: no second annotator was available, so no inter-rater agreement is reported. The text below is the protocol that would be followed.*

Ask one classmate to label rows **P01 to P30** using only this guide. In Step 14
we report Cohen's kappa between your labels and theirs on those 30. If they
disagree with you often, the guide needs tightening and the write-up should say
so.

## Where the prompts came from

- All prompts are **synthetic**. They were drafted by an AI assistant (Claude)
  from category descriptions, to cover plain, polite, evasive, genuine-effort,
  conceptual and borderline cases. No real student data was collected or
  scraped, so there is no privacy concern.
- The labels are by the project author, who is a single annotator.

## Known limitations of this dataset

- **Small:** 84 prompts. Any accuracy figure has a wide confidence interval and
  should be read as a rough indication.
- **Synthetic and clean:** real student prompts are messier, longer and more
  varied. Performance on real data is likely to be lower.
- **Shared blind spots:** the prompts and the scorer were drafted with the same
  AI assistant, so they may share assumptions. Adding your own prompts (ids
  P85 onward, type `own` in `prompt_types.csv`) before labelling reduces this.
- **Single annotator:** the second-annotator check above measures how subjective
  the labels are.
- **Difficulty is chosen, not natural:** the share of tricky prompts is higher
  than in real use, so do not read the HOLD rate as a real-world rate.
- **Mostly English and mostly single-line:** code was written on one line to
  keep the CSV simple.
