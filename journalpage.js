/**
 * journalpage.js - the Learning Journal page (Step 8)
 *
 * WHAT THIS FILE DOES
 * Runs on the extension's own journalpage.html. It reads the saved journal,
 * builds the report with journalexport.js, shows it on screen, and offers:
 *   - Download Markdown (a .md file for submission or notes)
 *   - Print / Save as PDF (the browser's print dialog)
 * The student can type their name and assignment; the report updates live.
 *
 * Everything stays on this device. All text is added with textContent (never
 * innerHTML), so prompt text can never run as code.
 */
(function () {
  const root = document.getElementById("report");
  const nameInput = document.getElementById("student-name");
  const assignmentInput = document.getElementById("assignment");
  const journal = StudyGuardJournal.createJournal(chrome.storage.local);
  const version = chrome.runtime.getManifest().version;

  let entries = [];
  const fmt = (t) => new Date(t).toLocaleString();

  function currentReport() {
    return StudyGuardJournalExport.buildReport(entries, {
      studentName: nameInput.value.trim(),
      assignment: assignmentInput.value.trim(),
      version,
    });
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function labelled(label, text) {
    const p = el("p", "");
    p.append(el("strong", "", label + " "), document.createTextNode(text));
    return p;
  }

  function quoteBlock(text) {
    return el("blockquote", "", String(text || "").trim() || "(nothing)");
  }

  function stepTitle(step) {
    const score = step.score === null ? "?" : step.score;
    const need = step.threshold === null ? "?" : step.threshold;
    if (step.action === "passed")
      return "Step " + step.n + ": Sent (score " + score + ")";
    if (step.action === "held")
      return (
        "Step " + step.n + ": Held (score " + score + ", needs " + need + ")"
      );
    return (
      "Step " +
      step.n +
      ": Sent anyway (score " +
      score +
      ", needs " +
      need +
      ")"
    );
  }

  function render() {
    const report = currentReport();
    const parts = [];

    parts.push(el("h1", "", report.title));
    const meta = [];
    if (report.studentName) meta.push("Student: " + report.studentName);
    if (report.assignment) meta.push("Assignment: " + report.assignment);
    meta.push("Exported: " + fmt(report.exportedAt));
    meta.push("Tool: StudyGuard v" + report.version);
    parts.push(el("p", "meta", meta.join("  \u00B7  ")));

    const s = report.summary;
    parts.push(el("h2", "", "Summary"));
    const list = el("ul");
    [
      "Messages recorded: " + s.total + " across " + s.sessions + " session(s)",
      "Sent without a hold: " + s.passed,
      "Held for more effort: " + s.held,
      "Chose to send anyway: " + s.sentAnyway,
      "Held, then revised and sent: " + s.recoveries,
    ].forEach((line) => list.append(el("li", "", line)));
    parts.push(list);

    if (report.sessions.length === 0) {
      parts.push(
        el(
          "p",
          "empty",
          'No journal entries yet. Turn on "Keep a learning journal" in the StudyGuard popup, then ask something on ChatGPT or Claude.'
        )
      );
    }

    report.sessions.forEach((session) => {
      parts.push(
        el(
          "h2",
          "",
          "Session " + session.number + " \u2013 " + fmt(session.start)
        )
      );
      session.steps.forEach((step) => {
        const box = el("section", "step");
        box.append(el("h3", "", stepTitle(step)));
        box.append(
          el(
            "p",
            "meta",
            fmt(step.time) + (step.site ? " on " + step.site : "")
          )
        );
        box.append(el("p", "label", "What I asked"), quoteBlock(step.question));
        box.append(el("p", "label", "My attempt"), quoteBlock(step.attempt));
        if (step.intent || step.effort) {
          box.append(
            labelled(
              "How StudyGuard read it:",
              (step.intent || "unknown") +
                "; my visible effort: " +
                (step.effort || "unknown")
            )
          );
        }
        if (step.redWords.length) {
          box.append(
            labelled(
              "Words that pushed the score toward needing more effort:",
              step.redWords.join(", ")
            )
          );
        }
        if (step.advice.length) {
          box.append(el("p", "label", "Advice shown"));
          const adviceList = el("ul");
          step.advice.forEach((a) => adviceList.append(el("li", "", a)));
          box.append(adviceList);
        }
        box.append(labelled("What happened next:", step.outcome));
        parts.push(box);
      });
    });

    parts.push(el("h2", "", "My reflection"));
    report.reflectionPrompts.forEach((prompt) => {
      parts.push(el("p", "label", prompt));
      parts.push(
        el(
          "div",
          "reflect",
          "(write your answer here, after you print or download)"
        )
      );
    });
    parts.push(el("p", "caveat", report.caveat));

    root.replaceChildren(...parts);
  }

  function downloadMarkdown() {
    const md = StudyGuardJournalExport.toMarkdown(currentReport(), {
      formatTime: fmt,
    });
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      "xai-learning-journal-" + new Date().toISOString().slice(0, 10) + ".md";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document
    .getElementById("download-md")
    .addEventListener("click", downloadMarkdown);
  document
    .getElementById("print")
    .addEventListener("click", () => window.print());
  nameInput.addEventListener("input", render);
  assignmentInput.addEventListener("input", render);

  journal
    .getAll()
    .then((all) => {
      entries = all;
      render();
    })
    .catch((error) => {
      root.replaceChildren(el("p", "empty", "Could not load the journal."));
      console.error("StudyGuard could not load the journal:", error);
    });
})();
