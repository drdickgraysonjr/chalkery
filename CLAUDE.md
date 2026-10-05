# chalkery

Claude Code mods built on function hooks that draw a band above the prompt, plus the `primaries` pack that installs all three. README.md, section "For authors", has the layout and the conventions.

## Language

This repository is public, so commit messages and code comments are in English. Some older comments are still in Ukrainian; do not add new ones. Text a person sees lives in `hooks/locales/en.mjs` and `uk.mjs`, and every README comes in a pair, `README.md` and `README.uk.md`, which change together.

## Before a pull request

- Run `scripts/check.sh`. CI runs the same checks on every push and pull request against the oldest Claude Code the README promises, and weekly against the newest.
- Edit shared code in `shared/`, then run `scripts/sync-shared.sh`; never edit the copies in `plugins/<mod>/hooks/`.
- A mod that changed since its last release tag (`<mod>--v<version>`) needs a higher `version` in its `plugin.json`; CI fails otherwise.
- The marketplace installs from `main`. A change to how a mod behaves is checked live through `CLAUDE_CODE_PLUGIN_DIRS` before it is merged.
