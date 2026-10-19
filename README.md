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

## Soft block on send
With study mode on, pressing Enter or clicking Send on ChatGPT or Claude runs
the effort scorer first. If the score is below 50, the message is paused and
the panel explains why, shows which words mattered, and says what would raise
the score. The student can add their own thinking or choose "Send anyway".
This is a soft block by design: a hard block would be bypassed and would punish
legitimate questions the scorer misjudges. If StudyGuard errors, the message is
sent normally.

StudyGuard keeps a small local log (time, site, outcome, score, signal names)
in `chrome.storage.local`. It never stores the text of your question or
attempt, and it never leaves your device.

Site selectors live in `sites.js`. Chat sites change their pages often; if
StudyGuard stops holding messages on a site, that file is the one to check.

## Prompt Breakdown Map (side panel)
Click the StudyGuard icon, then "Open Prompt Breakdown Map" (Chrome 116+).
After each analysis the panel shows the effort score against the pass mark,
what the prompt is asking for, how much of your own effort it shows, which
words pushed the score up or down (found by removing each word and
re-scoring), which rules fired, and what would unlock the prompt.

The numbers are rule points from a transparent scorer, not probabilities.
The map contains your prompt's words, so it is passed from the page to the
panel in memory and never written to storage.

## Learning journal (opt-in)
Off by default. When you tick "Keep a learning journal" in the popup,
StudyGuard saves each submit (your question, your attempt, the score, what the
scorer found, the words that pushed the score and the advice shown) in
`chrome.storage.local` on this device. Nothing is sent anywhere. It keeps the
newest 200 entries and "Clear journal" deletes them. Unticking the box stops
saving immediately. This is separate from the always-on analytics log, which
never stores any text. Step 8 exports the journal as Markdown or PDF.

## XAI Learning Journal (export)
With the learning journal switched on, click "Open Learning Journal (export)"
in the popup. The page shows your trial-and-error path: for each message, what
you asked, your attempt, how StudyGuard read it and why, the words that pushed
the score, the advice shown, and what you did next. It ends with reflection
questions. Use "Download Markdown" for a .md file, or "Print / Save as PDF" to
hand in with homework. You can type your name and assignment on the page.

The report says it was generated from your own saved log and that scores are
rule points, not probabilities. Your text is always quoted, so it cannot alter
the report's structure. Nothing leaves your device.

## Analytics dashboard
Click "Open Analytics Dashboard" in the popup. It reads the always-on event
log (time, site, outcome, score and rule names only, never your text) and
shows: attempts recorded, % held, % of holds sent anyway, % of holds revised
and sent within 30 minutes, outcomes by day (last 14 days), the spread of
effort scores around the pass mark of 50, and which rules fire most.
"Export CSV" downloads the raw log for a spreadsheet; "Print / Save as PDF"
saves the dashboard; "Show data tables" shows every chart's data as a table.

These numbers describe behaviour, not learning. A message that is held and
retried counts each time it is attempted. See docs/evaluation-plan.md for what
they can and cannot support.


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
