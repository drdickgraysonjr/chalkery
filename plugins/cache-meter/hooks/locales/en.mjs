// Everything cache-meter shows a person, in English. Same keys as uk.mjs.

const plural = (n, one, many) => (n === 1 ? one : many)

export default {
  minutes: (m) => (m <= 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`),
  times: (n) => `${n} ${plural(n, 'time', 'times')}`,
  pings: (n) => `${n} ${plural(n, 'ping', 'pings')}`,
  ttlSource: { default: 'default', measured: 'measured', manual: 'set by hand' },
  limit: { five_hour: '5 h', seven_day: 'week', spend_limit: 'spend' },
  onOff: (on) => (on ? 'on' : 'off'),

  // The band above the prompt
  kept: (until, pings, usd) => `◆ Keeping the cache warm until ${until}, ${pings} ${usd}`,
  warm: (left) => ` Cache warm for ${left}`,
  cooling: (left) => `◐ Cache cools in ${left}`,
  cold: (ago) => `○ Cache went cold ${ago} ago`,
  nextRewrites: (usd) => `Next message re-caches ≈ ${usd}`,
  rewriteWouldCost: (usd) => `Re-caching would cost ≈ ${usd}`,
  rewritten: (times, usd) => `Re-cached ${times}: ${usd}`,
  limits: (text) => `Limits: ${text}`,
  keepWarm: 'Keep warm',
  stopKeeping: 'Stop keeping',

  // The footer label
  footerKept: 'keeping the cache warm',
  footerCooling: (left, command) => `cache cools in ${left}, /${command}`,
  footerCold: (usd) => `cache is cold, re-caching would cost ≈ ${usd}`,
  footerLimits: (text) => `limits: ${text}`,

  // Toasts
  keepingUntil: (until) => `Keeping the cache warm until ${until}: a tiny request re-reads it before each expiry.`,
  stoppedKeeping: (why, pings, usd) => `No longer keeping the cache warm: ${why}. That was ${pings} for ${usd}.`,
  whyTimeUp: 'time is up',
  whyOff: 'turned off',
  whyNoReply: 'a ping got no reply, so the cache has most likely gone cold',
  whyWrote: (tokens) => `a ping wrote ${tokens} tokens instead of reading the cache`,
  coolingAlert: (tokens, left, usd, command) =>
    `The ${tokens}-token cache cools in ${left}. Re-caching would cost ≈ ${usd}. Type /${command} or press Keep warm to keep it warm.`,

  // The question before a cold send
  send: 'Send anyway',
  compact: 'Compact and send',
  cancel: 'Cancel',
  runHandoff: (command) => `Run /${command}`,
  coldQuestion: (ago, tokens, usd) =>
    `The cache went cold ${ago} ago. Sending now writes ${tokens} tokens of context into the cache again (≈ ${usd}). What now?`,
  handoffFailed: (command, error) => `Could not run /${command}: ${error}`,
  droppedForHandoff: (command, usd) =>
    `Not sent: running /${command}. It re-caches the context once (≈ ${usd}), and the next session starts from a small context.`,
  droppedToast: 'Not sent. A new session with a short handoff skips this re-caching.',
  dropped: 'Cancelled: cache-meter stopped a re-cache',

  // /cache and /keepwarm
  cacheDescription: "Prompt cache status and cache-meter's settings",
  keepwarmDescription: "Keep this session's cache warm (4 h by default), or /keepwarm off",
  keepwarmHint: '[hours|off]',
  statusHead: (tokens, model, ttl, source) => `cache-meter: ${tokens} tokens in context, model ${model}, cache lives ${ttl} min (${source}).`,
  statusUnknown: 'No request in this session yet, so the cache state is unknown.',
  statusWarm: (left) => `Cache warm for ≈ ${left}.`,
  statusCold: (ago, usd) => `The cache went cold ${ago} ago. The next message re-caches it for ≈ ${usd}.`,
  statusKept: (until, pings, usd) => `Keeping the cache warm until ${until}: ${pings} so far for ${usd}.`,
  statusLimits: (text) => `Plan limits used: ${text}.`,
  statusCost: (usd, times) => `The session has cost ${usd} so far. Re-cached ${times}.`,
  statusGuard: (guard, tokens, alerts) =>
    `Question before a cold send: ${guard}, for contexts from ${tokens} tokens. Alerts: ${alerts}.`,
  statusSettings: (cache, keepwarm) =>
    `Settings: /${cache} ttl 5|60|auto, /${cache} guard on|off, /${cache} big 150k, /${cache} alerts on|off. Keep warm: /${keepwarm} [hours|off].`,
}
