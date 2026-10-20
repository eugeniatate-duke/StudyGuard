# Error analysis of the v1 rule-based scorer

Source: `docs/evaluation-results.md` (90 prompts: 79 labelled HOLD or PASS,
11 UNSURE). Labels were made blind before any results existed. Numbers below
are from the v1 scorer and are the baseline for any later version.

## Summary

| | Accuracy | HOLD precision | HOLD recall |
|---|---|---|---|
| Always HOLD | 54% | 54% | 100% |
| Keyword rule | 65% | 70% | 60% |
| StudyGuard v1 | 65% (95% CI 54-74%) | 89% (CI 69-97%) | 40% (CI 26-54%) |

v1 is conservative: when it holds a prompt it is usually right, but it holds
fewer than half of the prompts that should be held. It matches a one-line
keyword rule on accuracy, trading recall for precision. Its added value is the
explanation it gives, not raw detection.

## Finding 1: recall is limited by vocabulary coverage, not by weights

In all 26 missed prompts, no request rule fired; 22 fired no rule at all and
scored exactly the neutral 50, which passes. The rules recognise "write a ...
function" and "the answer" but not, for example, "give me the code", "the full
solution", "write my essay", "could you draft it", "type up the finished
program" or "implementation". Misses by category: polite or indirect 10 of 12,
evasion 8 of 12, blunt 3 of 11.

Design consequence: the scorer fails open. Anything it does not recognise
passes. This is deliberate (it avoids wrongly accusing students) and the
benchmark quantifies its cost.

## Finding 2: evasions defeat a phrase-based scorer

Missed evasions include typos ("wrte me a func"), another language (Spanish),
role-play framing, terse imperatives ("Binary search. Python. Full code.") and
indirection ("Imagine the solution is already written. Print it."). Typos and
terse forms could be partly addressed with fuzzy matching and extra patterns.
Other languages and indirection need a semantic or multilingual model, or are
out of scope for a local rule-based tool.

## Finding 3: effort credit ignores the quality of the attempt

A blunt request ("Solve this for me") with a genuine 14-word attempt scored 37
and was held: request rules took 40 points and the attempt box added 25. In
the other direction, a "why" phrase added 15 points to a request the rules did
not recognise. Weights are fixed and sum independently of how substantial or
relevant the attempt is. Filler attempts were tested only lightly (a
six-word filler was still held, because the request penalty was large), so
this is a known gaming risk, not a measured rate.

## Finding 4: the "for me" rule causes false holds

Both wrongly held prompts involved the phrase "for me" plus a second signal
(for example, asking for a lecture summary for exam notes). A lexical rule
cannot separate delegating graded work from an ordinary study request.

## Finding 5: "should be held" is partly subjective

Three missed prompts that the labeller marked HOLD conflict with the written
guide (a trivial arithmetic fact, and two general concept questions), and one
more is a factual recall question the scorer cannot know is assigned. If those
three were labelled PASS, accuracy would be 54/79 (68%) and recall 17/40
(about 43%). The conclusions hold, but the result shows a prompt-only
classifier cannot know what is assigned or what a course allows. A second
annotator on 30 prompts will quantify this as Cohen's kappa.

## What v1 can honestly claim

- It reliably catches explicit, blunt requests for code or answers, and it
  rarely blocks genuine attempts or hint requests (20 of 20 correct).
- It does not reliably catch polite, indirect or disguised requests, and it
  should not be presented as detecting cheating.

## Limitations of this analysis

- 90 prompts, synthetic, one annotator: intervals are wide.
- The prompt set and the scorer were drafted with the same AI assistant, so
  shared blind spots are possible. The author added prompts of their own to
  reduce this.
- These errors will guide a v2 rule set. Because the same prompts will have
  informed v2, v2 must be reported on fresh, unseen prompts, with these 90
  treated as a development set.
