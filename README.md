StudyGuard is a privacy-preserving browser intervention that adds productive friction to AI-assisted studying.

## Can transparent, explainable friction reduce answer-seeking in AI study sessions?

## Status
Working prototype. With study mode on, a panel appears above ChatGPT's
message box where students write an attempt, choose a hint level (1-3),
and copy a structured hint request. Higher hint levels unlock only after
an attempt is written. Nothing is sent automatically, and no data leaves
the browser.

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
