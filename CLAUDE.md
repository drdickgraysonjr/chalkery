# chalkery

Claude Code mods built on function hooks that draw a band above the prompt, plus the `primaries` pack that installs all three. README.md, section "For authors", has the layout and the conventions.

## Language

This repository is public, so commit messages and code comments are in English. The only Ukrainian comments left are in the `locales/uk.mjs` files; do not add new ones elsewhere. Text a person sees lives in `hooks/locales/en.mjs` and `uk.mjs`, and every README comes in a pair, `README.md` and `README.uk.md`, which change together.

## Licences

Every code file starts with an `SPDX-License-Identifier` comment, after a shebang or JSX pragmas. Files of `next-steps` are Apache-2.0 and also carry the line `Modified by Yehor Hunia, 2026, from anthropics/claude-plugins-community@87c843d (next-steps).`, as Apache-2.0 section 4(b) requires; its copies of the shared files stay MIT. Everything else is MIT.

## Before a pull request

- Run `scripts/check.sh`. CI runs the same checks on every push and pull request against the oldest Claude Code the README promises, and weekly against the newest.
- Edit shared code in `shared/`, then run `scripts/sync-shared.sh`; never edit the copies in `plugins/<mod>/hooks/`.
- A mod that changed since its last release tag (`<mod>--v<version>`) needs a higher `version` in its `plugin.json`; CI fails otherwise.
- The marketplace installs each mod from its release tag, not from `main`; `main` takes changes only through a pull request with passing CI. A change to how a mod behaves is checked live through `CLAUDE_CODE_PLUGIN_DIRS` before it is merged.
- A release is: raise `version`, merge, `claude plugin tag --push` in the mod's folder, then `scripts/pin-releases.sh` and a pull request with the new `marketplace.json`.
