# next-steps (on demand)

English | [Українська](README.uk.md)

A fork of [next-steps](https://github.com/anthropics/claude-plugins-community/tree/main/next-steps) from `anthropics/claude-plugins-community@87c843d` (by Thariq Shihipar). Upstream suggested the next prompts after every turn, and each turn cost one extra model request. Here the band above the prompt shows only a What next? button, and the model is asked when you press it.

Pressing 1, 2 or 3 in an empty input box (or clicking) puts a prompt into the box as a draft: edit it if you like, you press Enter. 0 hides the suggestions and brings the button back. The first suggestion also appears as grey text in the box, and Tab takes it. The mod never sends anything itself, and it takes the digits only while suggestions are on screen.

## How it works

`hooks/register.tsx`, function hooks:

- `turn.complete`: after a main-loop answer (not a subagent's) longer than `minAnswerChars`, the button appears. The model is not asked yet.
- Pressing the button: `$.model.fork` with the same context, so the prefix is read from the prompt cache. The fork gets the session's skills and slash commands (`$.command.list`); a suggestion naming a command that does not exist is dropped.
- With [cache-meter](../cache-meter) installed and a big cache gone cold, the button shows what re-caching the context would cost.
- `turn.start` hides everything.
- The band's state lives in `$.state` (`next-steps.view`), so a hot reload keeps it.

Suggestions are output of a model that read untrusted text, so before they are shown they are stripped of escape sequences and invisible and control characters (upstream's `clean`, unchanged).

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `auto` follows Claude's response language from `/config`; `en` or `uk` set it |
| `minAnswerChars` | `80` | No button after shorter answers |
| `suggestSkills` | `true` | Give the suggester the session's skills and slash commands |

## Checks

```
claude plugin validate .
claude plugin test .
```
