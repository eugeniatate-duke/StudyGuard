/**
 * sidepanel.js - draws the Prompt Breakdown Map (Step 5)
 *
 * WHAT THIS FILE DOES
 * Runs inside Chrome's side panel. It shows the "map" that content.js builds
 * for the most recent message on the active ChatGPT or Claude tab.
 *
 * HOW THE DATA ARRIVES (and why nothing is stored)
 *  1. When the panel opens, it asks the active tab's content script for the
 *     latest map ("studyguard:getMap").
 *  2. Afterwards, content.js pushes a fresh map after every analysis
 *     ("studyguard:map").
 * The map contains the words of the student's prompt, so it is kept only in
 * the page's memory and in this panel. It is never written to storage.
 *
 * All text is added with textContent (never innerHTML), so prompt text can
 * never be run as code.
 */
(function () {
  const root = document.getElementById("map");

  // Small helper: make an element with optional class and text.
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function card(title) {
    const box = el("section", "card");
    box.append(el("h2", "", title));
    return box;
  }

  function bar(colour, percent) {
    const outer = el("div", "bar " + colour);
    const inner = document.createElement("div");
    inner.style.width = percent + "%";
    outer.append(inner);
    return outer;
  }

  function showEmpty(message) {
    root.replaceChildren(el("p", "empty", message));
  }

  function render(map) {
    if (!map) {
      showEmpty(
        "Nothing to show yet. Open ChatGPT or Claude, turn on study mode, " +
          "type a message and press Enter or Prepare a hint request."
      );
      return;
    }
    const parts = [];

    // 1. Score vs threshold
    const score = card("Effort score");
    const headline = el("p", "big", map.score + " / 100  ");
    headline.append(
      el(
        "span",
        "badge " + (map.passed ? "pass" : "hold"),
        map.passed ? "Would send" : "Held (needs " + map.threshold + ")"
      )
    );
    const meter = el("div", "meter");
    const fill = el("div", "fill" + (map.passed ? " pass" : ""));
    fill.style.width = map.score + "%";
    const mark = el("div", "mark");
    mark.style.left = map.threshold + "%";
    mark.title = "Pass mark: " + map.threshold;
    meter.append(fill, mark);
    score.append(
      headline,
      meter,
      el("p", "note", "The black line is the pass mark.")
    );
    parts.push(score);

    // 2. Intent
    const intent = card("What you asked for");
    intent.append(
      el("p", "big", map.intent.label),
      bar("red", map.intent.bar),
      el("p", "tag", map.intent.points + " request points"),
      el("p", "", map.intent.explanation)
    );
    parts.push(intent);

    // 3. Effort
    const effort = card("Your own effort");
    effort.append(
      el("p", "big", map.effort.level),
      bar("green", map.effort.bar),
      el("p", "tag", map.effort.points + " effort points"),
      el("p", "", map.effort.explanation)
    );
    parts.push(effort);

    // 4. Word effects
    if (map.words.length) {
      const words = card("Which words moved your score");
      const line = el("p", "words");
      map.words.forEach((w) => {
        const chip = el("span", w.effect, w.text);
        if (w.effect !== "neutral") {
          chip.title =
            w.effect === "answer_seeking"
              ? "Removing this word raises the score by " + w.delta + "."
              : "Removing this word lowers the score by " +
                Math.abs(w.delta) +
                ".";
        }
        line.append(chip, " ");
      });
      words.append(
        line,
        el(
          "p",
          "note",
          "Red, solid underline: pushes toward needing more effort. " +
            "Green, dotted underline: shows your own thinking. " +
            "Found by removing each word and re-scoring."
        )
      );
      parts.push(words);
    }

    // 5. Signals
    if (map.signals.length) {
      const sig = card("Rules that fired");
      const list = el("ul");
      map.signals.forEach((s) => {
        const sign = s.kind === "request" ? "-" : "+";
        const item = el(
          "li",
          "",
          s.label + " (" + sign + Math.abs(s.weight) + ")"
        );
        if (s.quotes.length) {
          item.append(" matched ");
          s.quotes.forEach((q, i) => {
            item.append(el("span", "quote", "\u201C" + q + "\u201D"));
            if (i < s.quotes.length - 1) item.append(", ");
          });
        }
        list.append(item);
      });
      sig.append(list);
      parts.push(sig);
    }

    // 6. What would unlock it
    if (map.unlock) {
      const un = card("What would unlock it");
      const list = el("ul");
      map.unlock.steps.forEach((s) => {
        list.append(el("li", "", s.advice + " (about +" + s.gain + ")"));
      });
      un.append(list);
      if (map.unlock.reword) un.append(el("p", "", map.unlock.reword));
      un.append(
        el(
          "p",
          "note",
          "Following these steps would give about " +
            map.unlock.projectedScore +
            "."
        )
      );
      parts.push(un);
    }

    parts.push(el("p", "note", map.caveat));
    root.replaceChildren(...parts);
  }

  // Ask the active tab's content script for its latest map.
  async function refresh() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (!tab || tab.id === undefined) return render(null);
      const reply = await chrome.tabs.sendMessage(tab.id, {
        type: "studyguard:getMap",
      });
      render(reply && reply.map);
    } catch (error) {
      // No content script on this tab (not ChatGPT/Claude, or page not reloaded).
      showEmpty(
        "Open a ChatGPT or Claude tab (and refresh it once) to see the map."
      );
    }
  }

  // Live updates pushed by content.js after each analysis.
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (
      message &&
      message.type === "studyguard:map" &&
      sender.tab &&
      sender.tab.active
    ) {
      render(message.map);
    }
  });

  chrome.tabs.onActivated.addListener(refresh);
  chrome.tabs.onUpdated.addListener((id, change) => {
    if (change.status === "complete") refresh();
  });

  refresh();
})();
