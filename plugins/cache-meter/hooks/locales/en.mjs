// SPDX-License-Identifier: MIT
// Everything cache-meter shows a person, in English. Same keys as uk.mjs.

const plural = (n, one, many) => (n === 1 ? one : many)

export default {
  minutes: (m) => (m <= 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`),
  times: (n) => `${n} ${plural(n, 'time', 'times')}`,
  pings: (n) => `${n} ${plural(n, 'ping', 'pings')}`,
  ttlSource: { default: 'default', subscription: 'subscription', api: 'API', measured: 'measured', engine: 'from the engine', manual: 'set by hand for this session' },
  // An amount in tokens, where dollars would not be real: on a subscription or for a model without prices.
  // Bare, as 200k: at these sizes tokens come in thousands, and no $ means they are not dollars
  tok: (tokens) => tokens,
  apiEquivalent: (usd) => `API equivalent ${usd}`,
  unpricedModel: (model) => `${model}, prices unknown`,
  limit: { five_hour: '5 h', seven_day: 'week', spend_limit: 'spend' },
  onOff: (on) => (on ? 'on' : 'off'),

  // The band above the prompt
  keptNoPings: (until) => `◆ Keeping the cache warm until ${until}`,
  kept: (until, pings, amount) => `◆ Keeping the cache warm until ${until}, ${pings} ${amount}`,
  warm: (left) => ` Cache warm for ${left}`,
  cooling: (left) => `◐ Cache cools in ${left}`,
  cold: (ago) => `○ Cache went cold ${ago} ago`,
  nextRewrites: (amount) => `Next message re-caches ≈ ${amount}`,
  rewriteWouldCost: (amount) => `Re-caching would cost ≈ ${amount}`,
  rewritten: (times, amount) => `Re-cached ${times}: ${amount}`,
  limits: (text) => `Limits: ${text}`,
  keepWarm: 'Keep warm',
  stopKeeping: 'Stop keeping',

  // The footer label
  footerKept: 'keeping the cache warm',
  footerCooling: (left, command) => `cache cools in ${left}, /${command}`,
  footerCold: (amount) => `cache is cold, re-caching would cost ≈ ${amount}`,
  footerLimits: (text) => `limits: ${text}`,

  // Toasts
  keepingUntil: (until, pings, each) => `Keeping the cache warm until ${until}: ≈ ${pings}, each ${each}.`,
  keepingNoPing: (until) => `Keeping the cache warm until ${until}: it stays warm that long without a ping.`,
  eachReads: (amount) => `reads ≈ ${amount}`,
  eachCosts: (usd) => `costs ≈ ${usd}`,
  notKeeping: (limits) => `Not keeping the cache warm: a plan limit is at 90% or more (${limits}), and each ping would use it further.`,
  stoppedKeepingNoPings: (why) => `No longer keeping the cache warm: ${why}.`,
  stoppedKeeping: (why, pings, amount) => `No longer keeping the cache warm: ${why}. That was ${pings} for ${amount}.`,
  whyTimeUp: 'time is up',
  whyOff: 'turned off',
  whyNoReply: 'a ping got no reply, so the cache has most likely gone cold',
  whyWrote: (tokens) => `a ping wrote ${tokens} tokens instead of reading the cache`,
  whyLimit: (limits) => `a plan limit reached 90% (${limits})`,
  coolingAlert: (tokens, left, amount, command) =>
    `The ${tokens}-token cache cools in ${left}. Re-caching would cost ≈ ${amount}. Type /${command} or press Keep warm to keep it warm.`,

  // The question before a cold send
  send: 'Send anyway',
  compact: 'Compact and send',
  cancel: 'Cancel',
  runHandoff: (command) => `Run /${command}`,
  // usd is null where dollars would not be real; the token count already says how much
  coldQuestion: (ago, tokens, usd) =>
    `The cache went cold ${ago} ago. Sending now writes ${tokens} tokens of context into the cache again${usd ? ` (≈ ${usd})` : ''}. What now?`,
  handoffFailed: (command, error) => `Could not run /${command}: ${error}`,
  droppedForHandoff: (command, amount) =>
    `Not sent: running /${command}. It re-caches the context once (≈ ${amount}), and the next session starts from a small context.`,
  droppedToast: 'Not sent. A new session with a short handoff skips this re-caching.',
  dropped: 'Cancelled: cache-meter stopped a re-cache',

  // /cache and /keepwarm
  cacheDescription: "Prompt cache status and cache-meter's settings",
  keepwarmDescription: "Keep this session's cache warm (4 h by default), or /keepwarm off",
  keepwarmHint: '[hours|off]',
  statusHead: (tokens, model, ttl, source) => `cache-meter: ${tokens} tokens in context, model ${model}, cache lives ${ttl} min (${source}).`,
  statusUnknown: 'No request in this session yet, so the cache state is unknown.',
  statusWarm: (left) => `Cache warm for ≈ ${left}.`,
  statusCold: (ago, amount) => `The cache went cold ${ago} ago. The next message re-caches it: ≈ ${amount}.`,
  statusKeptNoPings: (until) => `Keeping the cache warm until ${until}: no ping yet.`,
  statusKept: (until, pings, amount) => `Keeping the cache warm until ${until}: ${pings} so far, ≈ ${amount}.`,
  statusLimits: (text) => `Plan limits used: ${text}.`,
  statusCost: (cost, times) => `Session cost so far: ${cost}. Re-cached ${times}.`,
  statusRestarts: (times) => `Re-cached ${times}.`,
  statusGuard: (guard, tokens, alerts) =>
    `Question before a cold send: ${guard}, for contexts from ${tokens} tokens. Alerts: ${alerts}.`,
  statusSettings: (cache, keepwarm) =>
    `Settings: /${cache} ttl 5|60|auto, /${cache} guard on|off, /${cache} big 150k, /${cache} alerts on|off. Keep warm: /${keepwarm} [hours|off].`,
}
