# handoff-relay

English | [Українська](README.uk.md)

A Handoff button above the prompt. Pressing it runs `/handoff`: the session writes a handoff document for the next session. From 180k tokens of context the button lights up, because by then a fresh session is usually cheaper and sharper than this one.

If you have your own `/handoff`, the button runs yours. Otherwise it runs the `handoff` skill this mod brings.

## How it works

`hooks/register.tsx`, function hooks:

- `session.start` and `session.measure`: track how many tokens the context holds.
- The button: `$.command.run` with `/handoff`. While the handoff turn runs, the band says it is writing the document.
- When the handoff creates the next session's card (`spawn_task` in the desktop app), the button gives way to "Handoff created: <title>", so a second press does not overwrite the document just written.
- With [cache-meter](../cache-meter) installed, the button also lights up when a big cache is about to go cold or already has, with a hint on what that means for the handoff.

## The handoff skill

`skills/handoff/` writes the document into `.claude/handoffs/` under the project root, or into the folder the project's CLAUDE.md names. Handoffs form chains: the session that picks one up is titled `<name> H<N>`, and each phase gets its own file. `scripts/phase.py` (python3, standard library only) works out the names; without python3 the skill applies the same rules itself. In the desktop app the skill creates a card that starts the next session; in the terminal it prints the start prompt to paste.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `auto` follows Claude's response language from `/config`; `en` or `uk` set it |

## Checks

```
claude plugin validate .
claude plugin test .
python3 -m unittest discover -s skills/handoff/scripts
```
