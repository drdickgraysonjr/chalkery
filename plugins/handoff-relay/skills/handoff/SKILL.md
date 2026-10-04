---
name: handoff
description: Compacts the current conversation into a handoff document for another agent to pick up; use when the context is getting long, a phase of a multi-session chain ends, or the user presses the Handoff button or asks for a handoff.
argument-hint: "What will the next session be used for?"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Write it in the language of the conversation.

## Where it goes

Save it in the project's handoffs folder: `.claude/handoffs/` under the project root (the git root, or the working directory outside a repository). Create the folder if it does not exist. If the project's CLAUDE.md or the user names another handoffs folder, use that instead. Save one file there under the name the phase chain below gives; do not scatter copies into `/tmp` or other places.

## What goes in

- What the work is, what state it is in, and what is still open. Say what was verified and how; say what was not.
- A "Suggested skills" section: the skills the next agent should invoke, and when.
- References instead of copies: do not repeat what PRDs, plans, ADRs, issues, commits or diffs already hold; point to them by path or URL.
- No secrets: redact API keys, passwords, tokens and personal data.

If the user passed arguments, they describe what the next session is for; tailor the document to that.

## Phase chain

Every handoff is one phase of a chain: the session that receives it is titled `<base> H<N>`, and each phase gets its own file; a file is never rewritten for the next phase.

1. **Find the current phase.** If the conversation's first message has a chain line, it wins over everything else (the user may have renamed the session). The line reads `Chain: <base>, phase H<N>, previous: <path>`, or the same in Ukrainian: `Ланцюжок: <base>, фаза H<N>, попередній: <path>`. Otherwise take the session title: in the desktop app, `mcp__ccd_session_mgmt__get_session` with `session_id: "self"` gives it. With neither (a terminal session, no chain line), start a new chain: the base is a short name for the work, three to six words, and the current phase is H1.
2. **Compute the names.** Run
   `python3 "${CLAUDE_SKILL_DIR}/scripts/phase.py" --handoffs-dir "<handoffs folder>"` with `--title "<title>"`, or with `--chain "<base>" --phase <N>` from the chain line, or with `--chain "<base>" --phase 1` for a new chain.
   It prints `base`, `phase`, `next_phase`, `card_title`, `file`, `previous`, `previous_exists`. Use these values as given.
   If `python3` is not available, apply the same rules yourself: a title ending in ` H<N>` (a space, then H and a number) is phase N of the chain named by the rest of it, any other title is phase 1 of a chain with that name; `next_phase` = N + 1; `file` = `<base> — H<next_phase>.md`, with any of `* " \ / < > : | ? # ^ [ ]` in the base replaced by `-`; `previous` = `<base> — H<N>.md` when N ≥ 2, else none; `card_title` = `<base> H<next_phase>`, with the base shortened and ending in `…` so the whole title stays within 60 characters.
3. **Save** the document as `<handoffs folder>/<file>`. If that file already exists and this session did not write it, ask the user before touching it.
4. **Frontmatter.** Start the file with:
   ```yaml
   ---
   chain: <base>
   phase: <next_phase>
   previous: "[[<previous without .md>]]"   # when previous_exists; otherwise: previous: null
   ---
   ```
5. **When `phase` ≥ 2,** this session was itself a phase of the chain. Read the previous handoff first. Say at the top that this is phase H<phase> of the chain, carry over only the items that are still open, and point to the previous file for everything already closed instead of repeating it.
6. **End the document** with a section headed `Prompt to start H<next_phase>` (in a Ukrainian document: `Промпт для старту H<next_phase>`). Its first line is the chain line for the next session, in the document's language: `Chain: <base>, phase H<next_phase>, previous: <handoffs folder>/<file>`. Then say what the next session reads first and does first.
7. **Hand it over.** After the document is saved, if `spawn_task` is available (the desktop app), call it with `title` = `card_title`, `prompt` = that section's text verbatim, and a one-sentence `tldr`. Otherwise print the prompt in a fenced block so the user can paste it into a new session. Do not archive, rename or clear the current session.
