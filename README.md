# chalkery

English | [Українська](README.uk.md)

A chalkery is where the chalk lives: a home for Claude Code mods that draw above the prompt.

Three Claude Code mods that draw a band above the prompt, in the terminal and in the desktop app's Code tab.

| Mod | What it does |
| --- | --- |
| `handoff-relay` | A Handoff button that runs `/handoff`. It lights up from 180k tokens of context. The mod brings its own `handoff` skill, so the button works out of the box. |
| `cache-meter` | Shows how long the prompt cache stays warm and what a re-cache would cost. Keep warm stops it from going cold. Before you send into a big cold cache, it asks first. |
| `next-steps` | A What next? button that suggests up to three next prompts. The one you pick becomes a draft in the input box; you press Enter. |

Install them one by one or all at once. In any combination they form one band, always in the same order: Handoff, cache, What next?

## Install

Add the marketplace first:

```bash
claude plugin marketplace add drdickgraysonjr/chalkery
```

All three mods in one command. The pack is called primaries: three mods, like three primary colours.

```bash
claude plugin install primaries@chalkery
```

Or just the one you need:

```bash
claude plugin install cache-meter@chalkery
```

In the desktop app the same is under Plugins → Add plugin: the Marketplaces tab, then Add marketplace. The mods start working from the next session.

When a new version is out, refresh the catalog, then each installed mod:

```bash
claude plugin marketplace update chalkery
```

```bash
claude plugin update cache-meter@chalkery
```

To remove the pack: `claude plugin uninstall primaries@chalkery`. The three mods it installed stay; `claude plugin prune` removes them too.

## Language

The mods speak English and Ukrainian. Each has a `language` option: `auto` (the default), `en` or `uk`. With `auto`, the mods follow Claude's response language from `/config`, so one setting covers all three; a language the mods do not have, or none, gives English. To set it explicitly, change the option in `/config`, or pass it at install time:

```bash
claude plugin install cache-meter@chalkery --config language=uk
```

## The handoff skill

`handoff-relay` ships a `handoff` skill. It writes a handoff document for the next session into `.claude/handoffs/` under the project root; if the project's CLAUDE.md names another folder, it uses that. Handoffs form chains: the session that picks one up is titled `<name> H<N>`, and each phase gets its own file. In the desktop app the skill also creates a card that starts the next session; in the terminal it prints the start prompt to paste. If you already have your own `/handoff`, the button runs yours.

## next-steps options

After install the CLI says that some options are not set. All of them have defaults, so setting them is optional.

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `auto`, `en` or `uk`, as above |
| `minAnswerChars` | `80` | No button after shorter answers |
| `suggestSkills` | `true` | A suggestion may be one of the session's skills or slash commands |

## For authors

```
.claude-plugin/marketplace.json   the catalog: the pack and three mods
plugins/<mod>/                    each mod stands alone and installs on its own
plugins/<mod>/hooks/locales/      en.mjs and uk.mjs: every word the mod shows a person
plugins/handoff-relay/skills/     the handoff skill and its phase script (python3, with tests)
plugins/primaries/              the pack: only dependencies on the three mods
shared/band.mjs                   the shared band contract
shared/i18n.mjs                   picking the language for the language option
scripts/sync-shared.sh            copies shared/*.mjs into each mod's hooks/
```

**The shared band.** The order in which the engine chains different plugins' `ui.render` hooks is not documented and depends on how they were installed. So a mod does not put its row above or below what `next(e)` returned. It places its row into the shared `prompt-band` column at its own spot: Handoff 10, cache 20, What next? 30. Anything foreign, such as the engine's own row or a mod from elsewhere, goes below them. A mod may be installed without its neighbours, so `band.mjs` and `i18n.mjs` are copied into each one. Edit `shared/`, then run `scripts/sync-shared.sh`; `scripts/sync-shared.sh --check` confirms the copies match.

**Languages.** A mod's code holds no text a person sees: it reads it from `locales/<language>.mjs`. A new language is one more file in each mod, a line in `LOCALES` and a pattern in `shared/i18n.mjs`. Each mod's tests check that every locale has the same keys.

**Checks.** For each mod:

```bash
claude plugin validate plugins/cache-meter && claude plugin test plugins/cache-meter
```

The band tests load the neighbouring mods as separate plugins in both orders. The language tests cover `en`, `auto` without `/config` and `auto` with Ukrainian in `/config`.

**Live development.** To work on your checkout rather than the installed version, add the mod folders to `CLAUDE_CODE_PLUGIN_DIRS` (colon-separated). A plugin loaded from there shadows an installed one of the same name.

**Release.** Bump `version` in `plugins/<mod>/.claude-plugin/plugin.json`. Without it, `claude plugin update` will not see the change.

## Licenses

`handoff-relay`, `prompt-band` and the shared code: MIT, Yehor Hunia. `cache-meter` is a fork of the cache part of cache-keeper from [nateherkai/claude-code-mods](https://github.com/nateherkai/claude-code-mods), MIT, Nate Herk. `next-steps` is a fork of [anthropics/claude-plugins-community/next-steps](https://github.com/anthropics/claude-plugins-community/tree/main/next-steps), Apache 2.0. Each mod's license is in its folder.
