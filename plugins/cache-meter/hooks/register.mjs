// Cache Meter: watches this session's prompt cache, keeps a big cache warm on
// request, and asks before a cold send. The cache part of Nate Herk's
// cache-keeper (nateherkai/claude-code-mods), without its board, its handoff
// and its recording mode.
//
// Why: each request re-reads the whole context. From the cache that costs about
// a tenth of normal input. Once the cache expires (1 hour idle on a subscription,
// 5 minutes on the default API TTL), the next message writes the whole context
// again at 1.25x to 2x input. A cache read also restarts the timer, so a tiny
// ping before expiry costs a fraction of a rewrite.
//
// Other mods read this one's state (`cache-meter.cache`, see types/index.d.ts);
// it never depends on them. When a /handoff command exists in the session, the
// cold-send question offers it.

import { atom, read, update } from 'claude-code'
import { joinBand } from './band.mjs'
import { rewriteCost, requestCost, readCost, totalInput, cachedShare, priceFor, knownPrice, normalizeModel } from './pricing.mjs'
import { tokens, usd } from './fmt.mjs'
import { resolveLanguage, isLanguageKey } from './i18n.mjs'
import en from './locales/en.mjs'
import uk from './locales/uk.mjs'

const MIN = 60000
const TICK_EVERY = 30000
const CACHE = { plugin: 'cache-meter', key: 'cache' }
const HANDOFF = 'handoff'
const LOCALES = { en, uk }
// Keep warm stops, and does not start, once a plan limit window is this full
const KEEP_WARM_LIMIT = 90
// The words the person sees, in the language the `language` option picks (auto: Claude's own)
let L = en
let language = 'auto'
let isLanguagePicked = false

async function pickLanguage($) {
  isLanguagePicked = true
  let rows = []
  if (language !== 'en' && language !== 'uk') {
    try {
      rows = await $.config.list()
    } catch {
      rows = [] // no /config here (a test, a -p run): English
    }
  }
  L = LOCALES[resolveLanguage(language, rows)]
}

// This session, kept by the host in $.state so a reload of the code keeps it.
// The shape tag declines a value an older version of this code wrote.
const FRESH = {
  model: '',
  lastActivity: 0, // last main-loop request or keep-warm ping that touched the cache
  ctx: 0,
  costUsd: 0,
  // How the account pays: 'subscription' once the engine reports plan limits,
  // 'api' when a main-loop answer came without them
  plan: 'unknown',
  ttlMin: 60,
  // Where ttlMin came from: default, subscription, api, measured or engine
  ttlSource: 'default',
  // /cache ttl 5|60, for this session only; 0 is auto
  manualTtlMin: 0,
  coldRestarts: [],
  working: false,
  keepWarm: false,
  keepWarmUntil: 0,
  pings: 0,
  pingTokens: 0,
  pingUsd: 0,
  rateLimits: [],
  justCompacted: false,
  alerted: '',
}
const SESSION = atom({ plugin: 'cache-meter', key: 'session' }, FRESH, { shape: 'v1' })

async function session($) {
  return { ...FRESH, ...(await read($, SESSION)) }
}

function change($, fn) {
  return update($, SESSION, (s) => fn({ ...FRESH, ...s }))
}

function minutes(ms) {
  return L.minutes(Math.round((Number(ms) || 0) / 60000))
}

function clock(ts) {
  const d = new Date(ts)
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')
}

function pings(n) {
  return L.pings(n)
}

// Preferences kept across sessions in $.store. The cache lifetime is not one of them:
// /cache ttl holds for the session it was typed in.
const settings = { bigTokens: 150000, guard: true, alerts: true, keepWarmHours: 4 }
const names = { cache: 'cache', keepwarm: 'keepwarm' }

let now = 0
let published = ''

function ttlMin(s) {
  return s.manualTtlMin || s.ttlMin
}

function ttlSource(s) {
  return s.manualTtlMin ? 'manual' : s.ttlSource
}

// five_hour and seven_day are a subscription's windows; a gateway's spend_limit is not
function isSubscription(limits) {
  return limits.some((l) => l.kind === 'five_hour' || l.kind === 'seven_day')
}

// The plan decides the cache lifetime until a measurement or the engine says otherwise
function withPlan(s, limits, hasAnswered) {
  const plan = isSubscription(limits) ? 'subscription' : hasAnswered && s.plan === 'unknown' ? 'api' : s.plan
  if (plan === s.plan) return s
  const next = { ...s, plan }
  if (s.ttlSource === 'default' || s.ttlSource === 'subscription' || s.ttlSource === 'api') {
    next.ttlMin = plan === 'subscription' ? 60 : 5
    next.ttlSource = plan
  }
  return next
}

// Dollars only where they are real: on the API, for a model with known prices.
// A subscription pays in plan limits, so it sees tokens.
function showsUsd(s) {
  return s.plan === 'api' && Boolean(knownPrice(s.model))
}

// An amount in the band, the footer and the toasts: dollars on the API, tokens elsewhere
function amount(s, tok, dollars) {
  return showsUsd(s) ? usd(dollars) : L.tok(tokens(tok))
}

// An amount in /cache: on a subscription the tokens, with the dollars as the API equivalent
function statusAmount(s, tok, dollars) {
  if (showsUsd(s)) return usd(dollars)
  if (s.plan === 'subscription' && knownPrice(s.model)) return `${L.tok(tokens(tok))} (${L.apiEquivalent(usd(dollars))})`
  return L.tok(tokens(tok))
}

function rewrite(s) {
  return { tokens: s.ctx, usd: rewriteCost(s.ctx, s.model, ttlMin(s)) }
}

function restarts(s) {
  return {
    times: L.times(s.coldRestarts.length),
    tokens: s.coldRestarts.reduce((a, c) => a + c.tokens, 0),
    usd: s.coldRestarts.reduce((a, c) => a + c.usd, 0),
  }
}

// Plan limit windows as the API reports them: five_hour, seven_day, spend_limit
function limitsText(limits) {
  return limits.map((l) => `${L.limit[l.kind] || l.kind} ${Math.round(l.percentUsed)}%`).join(', ')
}

function limitsFrom(s, percent) {
  return s.rateLimits.filter((l) => (l.percentUsed || 0) >= percent)
}

function limitTone(limits, extra) {
  const top = Math.max(...limits.map((l) => l.percentUsed || 0))
  if (top >= 95) return { ...extra, color: 'red', bold: true }
  if (top >= 80) return { ...extra, color: 'yellow' }
  return { ...extra, dimColor: true }
}

function msLeft(lastActivity, ttl) {
  if (!lastActivity) return null
  return ttl * MIN - (now - lastActivity)
}

function cacheState(s) {
  const left = msLeft(s.lastActivity, ttlMin(s))
  if (left === null) return { kind: 'unknown', left: 0 }
  if (s.keepWarm) return { kind: 'kept', left }
  if (left <= 0) return { kind: 'cold', left }
  // Cooling: the last 5 minutes of an hour's cache, the last 2 of a 5-minute one
  if (left <= Math.min(5 * MIN, ttlMin(s) * MIN * 0.4)) return { kind: 'cooling', left }
  return { kind: 'warm', left }
}

function isBig(s) {
  return s.ctx >= settings.bigTokens
}

// What other mods read: the cache's state, the context and the price of a rewrite.
// Fields are only ever added, so a reader written for an older version keeps working.
function snapshot(s) {
  const ttl = ttlMin(s)
  return {
    kind: cacheState(s).kind,
    ctx: s.ctx,
    isBig: isBig(s),
    rewriteUsd: Math.round(rewriteCost(s.ctx, s.model, ttl) * 100) / 100,
    ttlMin: ttl,
    model: priceFor(s.model).id,
    rewriteTokens: s.ctx,
    unit: showsUsd(s) ? 'usd' : 'tokens',
  }
}

// Writes only on a change, so the readers redraw when the cache turns, not every tick
async function publish($) {
  const value = snapshot(await session($))
  const json = JSON.stringify(value)
  if (json === published) return
  published = json
  try {
    await $.state.set(CACHE, value)
  } catch {
    published = '' // try again on the next change or tick
  }
}

async function registerCommand($, name, description, argumentHint, immediate) {
  const spec = immediate ? { name, description, argumentHint, immediate: true } : { name, description, argumentHint }
  try {
    await $.command.register(spec)
    return name
  } catch {
    try {
      await $.command.register({ ...spec, name: 'cm-' + name })
      return 'cm-' + name
    } catch {
      return null
    }
  }
}

// The session's /handoff, if there is one (a skill, a plugin's command): never required
async function handoffCommand($) {
  try {
    const commands = await $.command.list()
    // The person's own /handoff first; else one a plugin brings, which may carry its prefix (handoff-relay:handoff)
    if (commands.some((c) => c.name === HANDOFF)) return HANDOFF
    const plugin = commands.find((c) => c.name.endsWith(':' + HANDOFF))
    return plugin ? plugin.name : null
  } catch {
    return null
  }
}

// How long after the last touch a keep-warm ping goes out
function pingAfter(ttl) {
  return ttl * MIN - (ttl >= 60 ? 8 * MIN : 90000)
}

// About how many pings keep the cache warm until `until`: one each time the cache nears expiry
function pingsUntil(s, until) {
  const period = pingAfter(ttlMin(s))
  const first = (s.lastActivity || now) + period
  return first > until ? 0 : Math.floor((until - first) / period) + 1
}

async function startKeepWarm($, hours) {
  const s = await session($)
  const full = limitsFrom(s, KEEP_WARM_LIMIT)
  if (full.length) {
    $.ui.toast(L.notKeeping(limitsText(full)), { timeoutMs: 8000 })
    return
  }
  const until = now + hours * 60 * MIN
  await change($, (x) => ({ ...x, keepWarm: true, keepWarmUntil: until }))
  // Each ping re-reads the whole context: on a subscription that comes out of the plan limits
  const each = showsUsd(s) ? L.eachCosts(usd(readCost(s.ctx, s.model))) : L.eachReads(L.tok(tokens(s.ctx)))
  const count = pingsUntil(s, until)
  // Over before the cache nears expiry: no ping will go out, so there is nothing to estimate
  $.ui.toast(count ? L.keepingUntil(clock(until), pings(count), each) : L.keepingNoPing(clock(until)), { timeoutMs: 8000 })
}

async function stopKeepWarm($, why) {
  const s = await session($)
  if (!s.keepWarm) return
  await change($, (x) => ({ ...x, keepWarm: false }))
  $.ui.toast(L.stoppedKeeping(why, pings(s.pings), amount(s, s.pingTokens, s.pingUsd)), { timeoutMs: 8000 })
}

async function keepWarmStep($) {
  const s = await session($)
  if (!s.keepWarm) return
  if (now >= s.keepWarmUntil) return stopKeepWarm($, L.whyTimeUp)
  const full = limitsFrom(s, KEEP_WARM_LIMIT)
  if (full.length) return stopKeepWarm($, L.whyLimit(limitsText(full)))
  if (s.working || !s.lastActivity) return
  const ttl = ttlMin(s)
  if (now - s.lastActivity < pingAfter(ttl)) return
  let reply = null
  try {
    reply = await $.model.fork({ prompt: 'cache-meter keep-alive ping. Reply with only: ok' })
  } catch {
    reply = null
  }
  if (!reply || !reply.usage) {
    return stopKeepWarm($, L.whyNoReply)
  }
  const u = reply.usage
  // A ping that writes instead of reading did not hit the cache: stop paying for it
  const isMiss = (u.cache_creation_input_tokens || 0) > 0.1 * Math.max(1, u.cache_read_input_tokens || 0)
  const at = now
  await change($, (x) => ({
    ...x,
    pings: x.pings + 1,
    pingTokens: x.pingTokens + totalInput(u),
    pingUsd: x.pingUsd + requestCost(u, x.model, ttl),
    lastActivity: isMiss ? x.lastActivity : at,
  }))
  if (isMiss) return stopKeepWarm($, L.whyWrote(tokens(u.cache_creation_input_tokens)))
}

async function warnStep($) {
  const s = await session($)
  if (!settings.alerts || s.keepWarm || !isBig(s)) return
  const st = cacheState(s)
  if (st.kind !== 'cooling') return
  const key = 'cool:' + s.lastActivity
  if (s.alerted === key) return
  await change($, (x) => ({ ...x, alerted: key }))
  const r = rewrite(s)
  $.ui.toast(L.coolingAlert(tokens(s.ctx), minutes(st.left), amount(s, r.tokens, r.usd), names.keepwarm), { timeoutMs: 15000 })
}

async function tick($) {
  now = await $.clock.now()
  await keepWarmStep($)
  await warnStep($)
  await publish($)
  $.ui.invalidate('ui.render')
}

async function loadSettings($) {
  const saved = await $.store.get('settings')
  if (!saved || typeof saved !== 'object') return
  // Up to 0.2.0 /cache ttl was saved for every later session; it now holds for one
  const { ttlMin: _dropped, ...rest } = saved
  Object.assign(settings, rest)
  if ('ttlMin' in saved) await $.store.set('settings', settings)
}

function modelLabel(s) {
  const price = knownPrice(s.model)
  return price ? price.id : L.unpricedModel(normalizeModel(s.model) || '?')
}

function statusText(s) {
  const st = cacheState(s)
  const ttl = ttlMin(s)
  const lines = []
  const source = L.ttlSource[ttlSource(s)] || ttlSource(s)
  lines.push(L.statusHead(tokens(s.ctx), modelLabel(s), ttl, source))
  if (st.kind === 'unknown') lines.push(L.statusUnknown)
  if (st.kind === 'warm' || st.kind === 'cooling') lines.push(L.statusWarm(minutes(st.left)))
  const r = rewrite(s)
  if (st.kind === 'cold') lines.push(L.statusCold(minutes(-st.left), statusAmount(s, r.tokens, r.usd)))
  if (s.keepWarm) lines.push(L.statusKept(clock(s.keepWarmUntil), pings(s.pings), statusAmount(s, s.pingTokens, s.pingUsd)))
  if (s.rateLimits.length) lines.push(L.statusLimits(limitsText(s.rateLimits)))
  const re = restarts(s)
  const times = s.coldRestarts.length ? `${re.times} (≈ ${statusAmount(s, re.tokens, re.usd)})` : re.times
  // The session's cost as the engine totals it: real on the API, an equivalent on a subscription
  const cost = !knownPrice(s.model) || s.plan === 'unknown' ? null : s.plan === 'api' ? usd(s.costUsd) : L.apiEquivalent(usd(s.costUsd))
  lines.push(cost ? L.statusCost(cost, times) : L.statusRestarts(times))
  lines.push(L.statusGuard(L.onOff(settings.guard), tokens(settings.bigTokens), L.onOff(settings.alerts)))
  lines.push(L.statusSettings(names.cache, names.keepwarm))
  return lines.join('\n')
}

function parseTokens(text) {
  const m = String(text || '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([km]?)$/)
  if (!m) return null
  return Math.round(Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1))
}

export function register(on, options) {
  language = options && options.language
  if (language === 'en' || language === 'uk') L = LOCALES[language]

  on('session.start', async ($, e, next) => {
    now = await $.clock.now()
    await pickLanguage($)
    const model = await $.session.model()
    await change($, (s) => ({ ...s, model: s.model || model }))
    await loadSettings($)
    names.cache = (await registerCommand($, 'cache', L.cacheDescription, '[ttl 5|60|auto] [guard on|off] [big 150k] [alerts on|off]')) || names.cache
    names.keepwarm = (await registerCommand($, 'keepwarm', L.keepwarmDescription, L.keepwarmHint, true)) || names.keepwarm
    $.clock.every(TICK_EVERY, () => tick($).catch(() => {}))
    await publish($)
    return next(e)
  })

  // Claude's language changed in /config: under auto, the mods follow it
  on('config.set', async ($, e, next) => {
    const r = await next(e)
    if (isLanguageKey(e.key)) {
      await pickLanguage($)
      $.ui.invalidate('ui.render')
    }
    return r
  })

  // /clear, /resume and /branch start from an unknown cache. The process goes
  // on under a new session id, and no session.start fires for it.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await change($, (s) => ({ ...s, lastActivity: 0, keepWarm: false }))
    await publish($)
    return next(e)
  })

  // The engine names the cache lifetime when the model changes: the surest source there is
  on('classic.PostModelSwitch', async ($, e, next) => {
    const ttl = e.cache_ttl === '5m' ? 5 : e.cache_ttl === '1h' ? 60 : 0
    if (ttl) await change($, (s) => ({ ...s, ttlMin: ttl, ttlSource: 'engine', model: e.to_model || s.model }))
    await publish($)
    return next(e)
  })

  // A cold send of a big context: ask first
  on('prompt.submit', async ($, e, next) => {
    now = await $.clock.now()
    const s = await session($)
    const left = msLeft(s.lastActivity, ttlMin(s))
    const isCold = left !== null && left <= 0
    const fromUser = e.origin && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')
    if (!settings.guard || !fromUser || !isCold || !isBig(s) || e.turnId) return next(e)
    const r = rewrite(s)
    const cost = amount(s, r.tokens, r.usd)
    const handoff = await handoffCommand($)
    const handoffLabel = L.runHandoff(handoff || HANDOFF)
    const choices = [L.send, L.compact, ...(handoff ? [handoffLabel] : []), L.cancel]
    let answer = L.send
    try {
      // The question already names the tokens; it adds dollars only where they are real
      answer = await $.ui.ask(L.coldQuestion(minutes(-left), tokens(s.ctx), showsUsd(s) ? cost : null), choices)
    } catch {
      // nobody to ask (a -p run, or the dialog was dismissed): send as typed
      return next(e)
    }
    if (answer === L.compact) {
      try {
        await $.session.compact()
      } catch {
        // compaction refused or failed: send anyway
      }
      return next(e)
    }
    if (answer === L.send) return next(e)
    if (handoff && answer === handoffLabel) {
      // Off the hook: a command started inside a hook the session waits on is refused
      $.clock.after(50, () =>
        $.command.run({ command: handoff, args: '' }).catch((err) => {
          $.ui.toast(L.handoffFailed(handoff, String((err && err.message) || err).slice(0, 100)), { timeoutMs: 8000 })
        }),
      )
      // The handoff turn still reads the whole context, so it pays this rewrite once;
      // what it saves is every later turn in a context this big
      return { drop: L.droppedForHandoff(handoff, cost) }
    }
    $.ui.toast(L.droppedToast, { timeoutMs: 8000 })
    return { drop: L.dropped }
  })

  on('turn.start', async ($, e, next) => {
    await change($, (s) => ({ ...s, working: true }))
    return next(e)
  })

  // Each main-loop request: did it read the cache, or rewrite it?
  on('turn.step', async function* ($, e, next) {
    const startedAt = await $.clock.now()
    const result = yield* next(e)
    if (e.agentId || !result || !result.usage) return result
    now = await $.clock.now()
    const u = result.usage
    const total = totalInput(u)
    const written = u.cache_creation_input_tokens || 0
    const at = now
    await change($, (s) => {
      const x = { ...s, model: u.model || s.model, justCompacted: false, ctx: total, lastActivity: at }
      const gap = s.lastActivity ? startedAt - s.lastActivity : 0
      if (s.justCompacted) {
        // the first request after a compaction writes the new, shorter context: expected
      } else if (s.lastActivity && total > 30000 && written / total > 0.5) {
        // A rewrite after 5-60 idle minutes means this session runs on the 5-minute TTL
        if (gap > 5.5 * MIN && gap < s.ttlMin * MIN) {
          x.ttlMin = 5
          x.ttlSource = 'measured'
        }
        x.coldRestarts = [...s.coldRestarts, { at, tokens: written, usd: rewriteCost(written, x.model, ttlMin(x)), gapMin: Math.round(gap / MIN) }]
      } else if (s.lastActivity && total > 30000 && gap > 5.5 * MIN && cachedShare(u) > 0.8) {
        // A hit after more than 5 idle minutes proves the 1-hour TTL
        x.ttlMin = 60
        x.ttlSource = 'measured'
      }
      return x
    })
    await publish($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    now = await $.clock.now()
    let usage = null
    try {
      usage = await $.session.usage()
    } catch {
      // usage unavailable: keep the per-request figures
    }
    await change($, (s) => {
      let x = { ...s, working: false }
      if (!usage) return x
      if (usage.context && usage.context.tokens) x.ctx = usage.context.tokens
      if (usage.cost) x.costUsd = usage.cost.usd
      const limits = Array.isArray(usage.rateLimits) ? usage.rateLimits : []
      if (limits.length) x.rateLimits = limits
      // After an answer the engine has had its say on plan limits: none means the API
      return withPlan(x, limits, Boolean(x.lastActivity))
    })
    await publish($)
    $.ui.invalidate('ui.render')
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    await change($, (s) => ({ ...s, justCompacted: true }))
    return r
  })

  on('session.measure', async ($, e, next) => {
    await change($, (s) => {
      const x = { ...s }
      if (e.context && e.context.tokens) x.ctx = e.context.tokens
      if (e.cost) x.costUsd = e.cost.usd
      if (Array.isArray(e.rateLimits) && e.rateLimits.length) x.rateLimits = e.rateLimits
      return withPlan(x, x.rateLimits, false)
    })
    await publish($)
    return next(e)
  })

  on('command.run', { command: ['cache', 'cm-cache'] }, async ($, e) => {
    now = await $.clock.now()
    const [key, value] = String(e.args || '').trim().toLowerCase().split(/\s+/)
    if (key === 'ttl') {
      const ttl = value === '5' ? 5 : value === '60' ? 60 : 0
      await change($, (s) => ({ ...s, manualTtlMin: ttl }))
    } else if (key === 'guard' || key === 'alerts') {
      settings[key] = value !== 'off'
      await $.store.set('settings', settings)
    } else if (key === 'big') {
      const n = parseTokens(value)
      if (n) settings.bigTokens = n
      await $.store.set('settings', settings)
    }
    if (key) {
      await publish($)
      $.ui.invalidate('ui.render')
    }
    return { text: statusText(await session($)) }
  })

  on('command.run', { command: ['keepwarm', 'cm-keepwarm'] }, async ($, e) => {
    now = await $.clock.now()
    const arg = String(e.args || '').trim().toLowerCase()
    const s = await session($)
    if (arg === 'off' || (arg === '' && s.keepWarm)) {
      await stopKeepWarm($, L.whyOff)
    } else {
      const hours = Number(arg) > 0 ? Math.min(24, Number(arg)) : settings.keepWarmHours
      await startKeepWarm($, hours)
    }
    await publish($)
    $.ui.invalidate('ui.render')
    return {}
  })

  // The band above the prompt: this session's cache at a glance
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props && e.props.hasSurvey) return below
    const s = await session($)
    if (!s.lastActivity && !s.keepWarm) return below
    if (!isLanguagePicked) await pickLanguage($)
    now = await $.clock.now()
    const { Box, Text, Button } = $.ui.resolve(e)
    const st = cacheState(s)
    const big = isBig(s)
    const parts = []
    if (st.kind === 'kept') parts.push(Text({ color: 'cyan', children: [L.kept(clock(s.keepWarmUntil), pings(s.pings), amount(s, s.pingTokens, s.pingUsd))] }))
    // All is well, so only the dot is green and the words stay dim
    else if (st.kind === 'warm') parts.push(Text({ children: [Text({ color: 'green', children: ['●'] }), Text({ dimColor: true, children: [L.warm(minutes(st.left))] })] }))
    else if (st.kind === 'cooling') parts.push(Text({ color: 'yellow', bold: true, children: [L.cooling(minutes(st.left))] }))
    else if (st.kind === 'cold') parts.push(Text(big ? { color: 'red', bold: true, children: [L.cold(minutes(-st.left))] } : { dimColor: true, children: [L.cold(minutes(-st.left))] }))
    const r = rewrite(s)
    const cost = amount(s, r.tokens, r.usd)
    parts.push(st.kind === 'cold' && big
      ? Text({ color: 'red', children: [L.nextRewrites(cost)] })
      : Text({ dimColor: true, children: [L.rewriteWouldCost(cost)] }))
    if (s.coldRestarts.length) {
      const re = restarts(s)
      parts.push(Text({ dimColor: true, children: [L.rewritten(re.times, amount(s, re.tokens, re.usd))] }))
    }
    // Plan limits only when one is close to running out
    const high = limitsFrom(s, 80)
    if (high.length) parts.push(Text(limitTone(high, { children: [L.limits(limitsText(high))] })))
    // Keep warm is on offer whenever there is a warm cache to keep: quiet while there is time,
    // loud once a big cache is about to cool. A real button like Handoff's; the letter only on the
    // terminal, since a desktop draws a hotkey as a chip in front of the label
    const key = e.surface === 'terminal' ? { hotkey: 'k' } : {}
    const redraw = async (fn) => {
      now = await $.clock.now()
      await fn()
      await publish($)
      $.ui.invalidate('ui.render')
    }
    if (st.kind === 'warm' || st.kind === 'cooling') {
      const isUrgent = st.kind === 'cooling' && big
      parts.push(Button({ key: 'keepwarm', label: L.keepWarm, ...key, ...(isUrgent ? {} : { dimColor: true }), onPress: () => redraw(() => startKeepWarm($, settings.keepWarmHours)) }))
    } else if (st.kind === 'kept') {
      parts.push(Button({ key: 'keepwarm', label: L.stopKeeping, ...key, onPress: () => redraw(() => stopKeepWarm($, L.whyOff)) }))
    }
    // Every part, the button too, is set off from the next by the same dim bar
    const row = parts.flatMap((p, i) => i ? [Text({ key: `bar${i}`, dimColor: true, children: ['│'] }), p] : [p])
    const mine = Box({ key: 'cache-meter', flexDirection: 'row', columnGap: 1, children: row })
    // Its own place in the band the mods of this repo share, whatever order they loaded in
    return joinBand(Box, 'cache-meter', mine, below)
  })

  // A short label in the footer, only when there's something to act on
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const label = footerLabel(await session($))
    if (!label) return next(e)
    const modes = Array.isArray(e.props && e.props.modes) ? e.props.modes : []
    return next({ ...e, props: { ...e.props, modes: [...modes, label] } })
  })
}

function footerLabel(s) {
  const parts = []
  const st = cacheState(s)
  const big = isBig(s)
  if (st.kind === 'kept') parts.push(L.footerKept)
  else if (st.kind === 'cooling' && big) parts.push(L.footerCooling(minutes(st.left), names.keepwarm))
  else if (st.kind === 'cold' && big) {
    const r = rewrite(s)
    parts.push(L.footerCold(amount(s, r.tokens, r.usd)))
  }
  const high = limitsFrom(s, 80)
  if (high.length) parts.push(L.footerLimits(limitsText(high)))
  return parts.join(', ')
}
