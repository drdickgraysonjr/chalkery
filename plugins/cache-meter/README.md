# cache-meter

English | [Українська](README.uk.md)

A fork of the cache part of cache-keeper from [nateherkai/claude-code-mods](https://github.com/nateherkai/claude-code-mods) (`33a936f`, by Nate Herk), without its board, its handoff and its recording mode.

Every request re-reads the whole context. From the prompt cache that costs about a tenth of normal input. Once the cache expires (1 hour idle on a subscription, 5 minutes on the default API TTL), the next message writes the whole context again at 1.25x to 2x input. This mod shows where the cache stands and what a re-cache would cost.

## What you see

- A row above the prompt: the cache is warm, cooling or cold, and what re-caching would cost. On the API that is in dollars. On a subscription it is in tokens, since a subscription pays in plan limits rather than dollars; so is a model the mod has no prices for. `/cache` adds the dollars as the API equivalent. Plan limits appear once one passes 80%.
- **Keep warm**, a button (`k` in the terminal) or `/keepwarm [hours|off]`: see [Keep warm](#keep-warm) for what it does and what it uses.
- A question before you send into a big cold cache (150k tokens by default): Send anyway, Compact and send, Run `/handoff` (if the session has one) or Cancel.
- A toast when a big cache is about to cool.

How long the cache lives: 60 minutes on a subscription and 5 on the API, which the mod tells apart by whether Claude Code reports plan limits after the first answer. What it measures later corrects that, and so does Claude Code itself when the model changes. `/cache` says where the figure came from.

## Keep warm

Keep warm stops the cache from going cold while you are away. Before each expiry it sends a tiny request that re-reads the cache, which restarts its timer. It runs for 4 hours by default and 24 at most; `/keepwarm off` or Stop keeping ends it sooner.

It is not free. Each ping re-reads the whole context: on the API that is a fraction of the input price, ≈ $0.04 for 200k tokens of Opus 5.5; on a subscription the same tokens count against your plan limits. A subscription's one-hour cache takes a ping every 52 minutes, about 4 in 4 hours; the API's 5-minute cache takes one every 3.5 minutes, about 70. When it starts, a toast estimates how many pings it will send and what each reads.

It stops by itself when the time is up, when a ping writes the cache instead of reading it (the cache had gone cold anyway), when a ping gets no reply, and once any plan limit window reaches 90%: pings should not use up the limit your next real message needs. At 90% or more it does not start.

## Commands

| Command | What it does |
| --- | --- |
| `/cache` | The cache status and the settings |
| `/cache ttl 5\|60\|auto` | The cache lifetime for this session only; `auto` goes back to what the session shows |
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
