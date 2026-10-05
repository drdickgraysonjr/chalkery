# cache-meter

English | [Українська](README.uk.md)

A fork of the cache part of cache-keeper from [nateherkai/claude-code-mods](https://github.com/nateherkai/claude-code-mods) (`33a936f`, by Nate Herk), without its board, its handoff and its recording mode.

Every request re-reads the whole context. From the prompt cache that costs about a tenth of normal input. Once the cache expires (1 hour idle on a subscription, 5 minutes on the default API TTL), the next message writes the whole context again at 1.25x to 2x input. This mod shows where the cache stands and what a re-cache would cost.

## What you see

- A row above the prompt: the cache is warm, cooling (under 5 minutes left) or cold, and what re-caching would cost. Plan limits appear once one passes 80%.
- **Keep warm**, a button (`k` in the terminal) or `/keepwarm [hours|off]`: before each expiry a tiny request re-reads the cache, for 4 hours by default and 24 at most. Each ping costs a little; it stops by itself when time is up, or when a ping writes the cache instead of reading it.
- A question before you send into a big cold cache (150k tokens by default): Send anyway, Compact and send, Run `/handoff` (if the session has one) or Cancel.
- A toast when a big cache is about to cool.

## Commands

| Command | What it does |
| --- | --- |
| `/cache` | The cache status and the settings |
| `/cache ttl 5\|60\|auto` | The cache lifetime; `auto` measures it from the session |
| `/cache guard on\|off` | The question before a cold send |
| `/cache big 150k` | From how many tokens a context counts as big |
| `/cache alerts on\|off` | The toast before the cache cools |
| `/keepwarm [hours\|off]` | Keep the cache warm, or stop |

If another plugin already has `/cache` or `/keepwarm`, the mod's commands are `/cm-cache` and `/cm-keepwarm`.

## For other mods

The mod publishes the cache state in `$.state` as `cache-meter.cache` (see `types/index.d.ts`). [handoff-relay](../handoff-relay) and [next-steps](../next-steps) read it to show what their button costs on a cold cache. cache-meter itself depends on no other mod.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `auto` follows Claude's response language from `/config`; `en` or `uk` set it |

## Checks

```
claude plugin validate .
claude plugin test .
```
