StudyGuard is a privacy-preserving browser intervention that adds productive friction to AI-assisted studying.

## Can transparent, explainable friction reduce answer-seeking in AI study sessions?

## Status
Working prototype. With study mode on, a panel appears above ChatGPT's
message box where students write an attempt, choose a hint level (1-3),
and copy a structured hint request. Higher hint levels unlock only after
an attempt is written. Nothing is sent automatically, and no data leaves
the browser.

## How the word highlighting works
When a prompt scores below 50, StudyGuard removes each word in turn, re-scores
the prompt, and colors the words by how much the score changed. Red words
pushed the score down (e.g. "write", "function"); green words helped (e.g.
"stuck", "error"). This is a perturbation (occlusion) explanation, the same idea
as LIME, applied to a transparent rule-based scorer. Limits: single-word
removal misses redundant phrases, and importance reflects this scorer, not a
human judgment.

## How the "what would unlock this" advice works
When a prompt scores below 50, StudyGuard searches for the smallest set of
additions that would raise it to a pass (for example, writing an attempt or
naming where you are stuck). This is a counterfactual explanation: the smallest
change that would have led to a different outcome (Wachter, Mittelstadt &
Russell, 2017). Each tip is verified by re-scoring the prompt with an example of
that content added, so the advice is tested, not guessed. Only changes a student
can make are suggested. Limit: a student can type filler that matches the
patterns, so the tool cannot tell sincere effort from gaming.

## Requirements
- Google Chrome
- No build dependencies, dataset, API key, or model download required.

## Load locally
1. Open chrome://extensions.
2. Enable Developer mode.
3. Select Load unpacked.
4. Choose this repository folder.
5. Open StudyGuard from the extensions menu.

## Run the tests
Requires Node.js 18 or newer. From the repo root:

    node --test

The analysis engine (`engine.js`) has no browser code, so its tests run
directly in Node with no installs.

## Project documentation
- [Project plan](docs/project-plan.md)
- [Evaluation plan](docs/evaluation-plan.md)


---
by Eugenia Tate
for AIPI 590 XAI Project 1 Duke University
