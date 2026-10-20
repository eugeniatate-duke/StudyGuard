# StudyGuard privacy policy

_Last updated: October 2026_

StudyGuard is a Chrome extension that runs entirely inside your browser.

**What it does with your text.** When study mode is on, StudyGuard reads the text in the ChatGPT or Claude message box, and the optional attempt box, at the moment you press Send. It scores that text on your own computer. The text is **never sent to any server**, to the developer, or to any third party. The extension makes no network requests of its own.

**What it stores (on this device only, in Chrome's local extension storage):**

| Data | When | Contains your prompt text? |
|---|---|---|
| Your settings (study mode on/off, journal on/off) | Always | No |
| Event log: time, site name, score, rule names, and whether the prompt was passed, held, or sent anyway | When study mode is on | **No** |
| Learning journal: your question, attempt and the explanation | **Only if you turn the journal on** (off by default) | Yes, by your choice |

**Your control.** Turn study mode or the journal off at any time from the extension popup. "Clear journal" deletes all journal entries. Removing the extension deletes everything it stored. Exports (Markdown, PDF, CSV) are created only when you ask and are saved wherever you choose.

**Permissions and why.**
- `storage`: save the settings, event log and optional journal above.
- `sidePanel`: show the Prompt Breakdown Map in Chrome's side panel.
- Access to `chatgpt.com` and `claude.ai`: place the StudyGuard panel next to the message box and read the text you are about to send.

**What it does not do.** No accounts, no analytics or tracking, no advertising, no selling or sharing of data, no remote code. StudyGuard is not affiliated with OpenAI or Anthropic. It gives advice about effort in a prompt; it is not an academic-integrity detector and should not be used to accuse anyone.

**Contact.** Open an issue at https://github.com/eugeniatate-duke/StudyGuard/issues.
