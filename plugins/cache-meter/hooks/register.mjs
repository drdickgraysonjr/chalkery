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

import { joinBand } from './band.mjs'
import { rewriteCost, requestCost, totalInput, cachedShare, priceFor } from './pricing.mjs'
import { tokens, usd } from './fmt.mjs'
import { resolveLanguage, isLanguageKey } from './i18n.mjs'
import en from './locales/en.mjs'
import uk from './locales/uk.mjs'

const MIN = 60000
const TICK_EVERY = 30000
const CACHE = { plugin: 'cache-meter', key: 'cache' }
const HANDOFF = 'handoff'
const LOCALES = { en, uk }
// The words the person sees, in the language the `language` option picks (auto: Claude's own)
let L = en
let language = 'auto'

async function pickLanguage($) {
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

// This session
const S = {
  model: '',
  lastActivity: 0, // last main-loop request or keep-warm ping that touched the cache
  ctx: 0,
  window: 0,
  costUsd: 0,
  ttlMin: 60,
  ttlSource: 'default',
  coldRestarts: [],
  working: false,
  keepWarm: false,
  keepWarmUntil: 0,
  pings: 0,
  pingUsd: 0,
  lastPingAt: 0,
  rateLimits: [],
}

function minutes(ms) {
  return L.minutes(Math.round((Number(ms) || 0) / 60000))
}

function clock(ts) {
  const d = new Date(ts)
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')
}

// How many full re-caches this session had, and what they cost
function restarts() {
  return `${L.times(S.coldRestarts.length)}: ${usd(S.coldRestarts.reduce((a, c) => a + c.usd, 0))}`
}

function pings(n) {
  return L.pings(n)
}

const settings = { bigTokens: 150000, guard: true, ttlMin: 0, alerts: true, keepWarmHours: 4 }
const names = { cache: 'cache', keepwarm: 'keepwarm' }

let now = 0
let justCompacted = false
let alerted = ''
let published = ''

function ttlMin() {
  return settings.ttlMin || S.ttlMin
}

// Plan limit windows as the API reports them: five_hour, seven_day, spend_limit
function limitsText(limits) {
  return limits.map((l) => `${L.limit[l.kind] || l.kind} ${Math.round(l.percentUsed)}%`).join(', ')
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

function cacheState() {
  const left = msLeft(S.lastActivity, ttlMin())
  if (left === null) return { kind: 'unknown', left: 0 }
  if (S.keepWarm) return { kind: 'kept', left }
  if (left <= 0) return { kind: 'cold', left }
  if (left <= 5 * MIN) return { kind: 'cooling', left }
  return { kind: 'warm', left }
}

function isBig() {
  return S.ctx >= settings.bigTokens
}

// What other mods read: the cache's state, the context and the price of a rewrite
function snapshot() {
  const ttl = ttlMin()
  return {
    kind: cacheState().kind,
    ctx: S.ctx,
    isBig: isBig(),
    rewriteUsd: Math.round(rewriteCost(S.ctx, S.model, ttl) * 100) / 100,
    ttlMin: ttl,
    model: priceFor(S.model).id,
  }
}

// Writes only on a change, so the readers redraw when the cache turns, not every tick
async function publish($) {
  const value = snapshot()
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
    return commands.some((c) => c.name === HANDOFF) ? HANDOFF : null
  } catch {
    return null
  }
}

function startKeepWarm($, hours) {
  S.keepWarm = true
  S.keepWarmUntil = now + hours * 60 * MIN
  $.ui.toast(L.keepingUntil(clock(S.keepWarmUntil)))
}

function stopKeepWarm($, why) {
  if (!S.keepWarm) return
  S.keepWarm = false
  $.ui.toast(L.stoppedKeeping(why, pings(S.pings), usd(S.pingUsd)), { timeoutMs: 8000 })
}

async function keepWarmStep($) {
  if (!S.keepWarm) return
  if (now >= S.keepWarmUntil) return stopKeepWarm($, L.whyTimeUp)
  if (S.working || !S.lastActivity) return
  const ttl = ttlMin()
  const margin = ttl >= 60 ? 8 * MIN : 90000
  if (now - S.lastActivity < ttl * MIN - margin) return
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
  S.pings += 1
  S.lastPingAt = now
  S.pingUsd += requestCost(u, S.model, ttl)
  // A ping that writes instead of reading did not hit the cache: stop paying for it
  if ((u.cache_creation_input_tokens || 0) > 0.1 * Math.max(1, u.cache_read_input_tokens || 0)) {
    return stopKeepWarm($, L.whyWrote(tokens(u.cache_creation_input_tokens)))
  }
  S.lastActivity = now
}

function warnStep($) {
  if (!settings.alerts || S.keepWarm || !isBig()) return
  const st = cacheState()
  if (st.kind !== 'cooling') return
  const key = 'cool:' + S.lastActivity
  if (alerted === key) return
  alerted = key
  const cost = usd(rewriteCost(S.ctx, S.model, ttlMin()))
  $.ui.toast(L.coolingAlert(tokens(S.ctx), minutes(st.left), cost, names.keepwarm), { timeoutMs: 15000 })
}

async function tick($) {
  now = await $.clock.now()
  await keepWarmStep($)
  warnStep($)
  await publish($)
  $.ui.invalidate('ui.render')
}

async function loadSettings($) {
  const saved = await $.store.get('settings')
  if (saved && typeof saved === 'object') Object.assign(settings, saved)
}

function statusText() {
  const st = cacheState()
  const ttl = ttlMin()
  const lines = []
  const source = settings.ttlMin ? L.ttlSource.manual : L.ttlSource[S.ttlSource] || S.ttlSource
  lines.push(L.statusHead(tokens(S.ctx), priceFor(S.model).id, ttl, source))
  if (st.kind === 'unknown') lines.push(L.statusUnknown)
  if (st.kind === 'warm' || st.kind === 'cooling') lines.push(L.statusWarm(minutes(st.left)))
  if (st.kind === 'cold') lines.push(L.statusCold(minutes(-st.left), usd(rewriteCost(S.ctx, S.model, ttl))))
  if (S.keepWarm) lines.push(L.statusKept(clock(S.keepWarmUntil), pings(S.pings), usd(S.pingUsd)))
  if (S.rateLimits.length) lines.push(L.statusLimits(limitsText(S.rateLimits)))
  lines.push(L.statusCost(usd(S.costUsd), restarts()))
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

  on('session.start', async ($, e, next) => {
    now = await $.clock.now()
    await pickLanguage($)
    S.model = await $.session.model()
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
    S.lastActivity = 0
    S.keepWarm = false
    await publish($)
    return next(e)
  })

  // A cold send of a big context: ask first
  on('prompt.submit', async ($, e, next) => {
    now = await $.clock.now()
    const ttl = ttlMin()
    const left = msLeft(S.lastActivity, ttl)
    const isCold = left !== null && left <= 0
    const fromUser = e.origin && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')
    if (!settings.guard || !fromUser || !isCold || !isBig() || e.turnId) return next(e)
    const cost = usd(rewriteCost(S.ctx, S.model, ttl))
    const handoff = await handoffCommand($)
    const handoffLabel = L.runHandoff(HANDOFF)
    const choices = [L.send, L.compact, ...(handoff ? [handoffLabel] : []), L.cancel]
    let answer = L.send
    try {
      answer = await $.ui.ask(L.coldQuestion(minutes(-left), tokens(S.ctx), cost), choices)
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
    S.working = true
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
    const gap = S.lastActivity ? startedAt - S.lastActivity : 0
    S.model = u.model || S.model
    const afterCompact = justCompacted
    justCompacted = false
    if (afterCompact) {
      // the first request after a compaction writes the new, shorter context: expected
    } else if (S.lastActivity && total > 30000 && written / total > 0.5) {
      // A rewrite after 5-60 idle minutes means this session runs on the 5-minute TTL
      if (!settings.ttlMin && gap > 5.5 * MIN && gap < S.ttlMin * MIN) {
        S.ttlMin = 5
        S.ttlSource = 'measured'
      }
      S.coldRestarts.push({ at: now, tokens: written, usd: rewriteCost(written, S.model, ttlMin()), gapMin: Math.round(gap / MIN) })
    } else if (S.lastActivity && total > 30000 && gap > 5.5 * MIN && cachedShare(u) > 0.8) {
      // A hit after more than 5 idle minutes proves the 1-hour TTL
      if (!settings.ttlMin) {
        S.ttlMin = 60
        S.ttlSource = 'measured'
      }
    }
    S.ctx = total
    S.lastActivity = now
    await publish($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    now = await $.clock.now()
    S.working = false
    try {
      const usage = await $.session.usage()
      if (usage.context && usage.context.tokens) S.ctx = usage.context.tokens
      if (usage.context && usage.context.window) S.window = usage.context.window
      if (usage.cost) S.costUsd = usage.cost.usd
      if (Array.isArray(usage.rateLimits) && usage.rateLimits.length) S.rateLimits = usage.rateLimits
    } catch {
      // usage unavailable: keep the per-request figures
    }
    await publish($)
    $.ui.invalidate('ui.render')
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    justCompacted = true
    return r
  })

  on('session.measure', async ($, e, next) => {
    if (e.context && e.context.tokens) S.ctx = e.context.tokens
    if (e.context && e.context.window) S.window = e.context.window
    if (e.cost) S.costUsd = e.cost.usd
    if (Array.isArray(e.rateLimits) && e.rateLimits.length) S.rateLimits = e.rateLimits
    await publish($)
    return next(e)
  })

  on('command.run', { command: ['cache', 'cm-cache'] }, async ($, e) => {
    now = await $.clock.now()
    const [key, value] = String(e.args || '').trim().toLowerCase().split(/\s+/)
    if (key === 'ttl') {
      settings.ttlMin = value === '5' ? 5 : value === '60' ? 60 : 0
    } else if (key === 'guard' || key === 'alerts') {
      settings[key] = value !== 'off'
    } else if (key === 'big') {
      const n = parseTokens(value)
      if (n) settings.bigTokens = n
    }
    if (key) {
      await $.store.set('settings', settings)
      await publish($)
      $.ui.invalidate('ui.render')
    }
    return { text: statusText() }
  })

  on('command.run', { command: ['keepwarm', 'cm-keepwarm'] }, async ($, e) => {
    now = await $.clock.now()
    const arg = String(e.args || '').trim().toLowerCase()
    if (arg === 'off' || (arg === '' && S.keepWarm)) {
      stopKeepWarm($, L.whyOff)
    } else {
      const hours = Number(arg) > 0 ? Math.min(24, Number(arg)) : settings.keepWarmHours
      startKeepWarm($, hours)
    }
    await publish($)
    $.ui.invalidate('ui.render')
    return {}
  })

  // The band above the prompt: this session's cache at a glance
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props && e.props.hasSurvey) return below
    if (!S.lastActivity && !S.keepWarm) return below
    now = await $.clock.now()
    const { Box, Text, Button } = $.ui.resolve(e)
    const st = cacheState()
    const ttl = ttlMin()
    const big = isBig()
    const parts = []
    if (st.kind === 'kept') parts.push(Text({ color: 'cyan', children: [L.kept(clock(S.keepWarmUntil), pings(S.pings), usd(S.pingUsd))] }))
    // All is well, so only the dot is green and the words stay dim
    else if (st.kind === 'warm') parts.push(Text({ children: [Text({ color: 'green', children: ['●'] }), Text({ dimColor: true, children: [L.warm(minutes(st.left))] })] }))
    else if (st.kind === 'cooling') parts.push(Text({ color: 'yellow', bold: true, children: [L.cooling(minutes(st.left))] }))
    else if (st.kind === 'cold') parts.push(Text(big ? { color: 'red', bold: true, children: [L.cold(minutes(-st.left))] } : { dimColor: true, children: [L.cold(minutes(-st.left))] }))
    const rewrite = usd(rewriteCost(S.ctx, S.model, ttl))
    parts.push(st.kind === 'cold' && big
      ? Text({ color: 'red', children: [L.nextRewrites(rewrite)] })
      : Text({ dimColor: true, children: [L.rewriteWouldCost(rewrite)] }))
    if (S.coldRestarts.length) parts.push(Text({ dimColor: true, children: [L.rewritten(L.times(S.coldRestarts.length), usd(S.coldRestarts.reduce((a, c) => a + c.usd, 0)))] }))
    // Plan limits only when one is close to running out
    const high = S.rateLimits.filter((l) => (l.percentUsed || 0) >= 80)
    if (high.length) parts.push(Text(limitTone(high, { children: [L.limits(limitsText(high))] })))
    // Keep warm is on offer whenever there is a warm cache to keep: quiet while there is time,
    // loud once a big cache is about to cool. A real button like Handoff's; the letter only on the
    // terminal, since a desktop draws a hotkey as a chip in front of the label
    const key = e.surface === 'terminal' ? { hotkey: 'k' } : {}
    if (st.kind === 'warm' || st.kind === 'cooling') {
      const isUrgent = st.kind === 'cooling' && big
      parts.push(Button({ key: 'keepwarm', label: L.keepWarm, ...key, ...(isUrgent ? {} : { dimColor: true }), onPress: async () => { now = await $.clock.now(); startKeepWarm($, settings.keepWarmHours); await publish($); $.ui.invalidate('ui.render') } }))
    } else if (st.kind === 'kept') {
      parts.push(Button({ key: 'keepwarm', label: L.stopKeeping, ...key, onPress: async () => { now = await $.clock.now(); stopKeepWarm($, L.whyOff); await publish($); $.ui.invalidate('ui.render') } }))
    }
    // Every part, the button too, is set off from the next by the same dim bar
    const row = parts.flatMap((p, i) => i ? [Text({ key: `bar${i}`, dimColor: true, children: ['│'] }), p] : [p])
    const mine = Box({ key: 'cache-meter', flexDirection: 'row', columnGap: 1, children: row })
    // Its own place in the band the mods of this repo share, whatever order they loaded in
    return joinBand(Box, 'cache-meter', mine, below)
  })

  // A short label in the footer, only when there's something to act on
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const label = footerLabel()
    if (!label) return next(e)
    const modes = Array.isArray(e.props && e.props.modes) ? e.props.modes : []
    return next({ ...e, props: { ...e.props, modes: [...modes, label] } })
  })
}

function footerLabel() {
  const parts = []
  const st = cacheState()
  const big = isBig()
  if (st.kind === 'kept') parts.push(L.footerKept)
  else if (st.kind === 'cooling' && big) parts.push(L.footerCooling(minutes(st.left), names.keepwarm))
  else if (st.kind === 'cold' && big) parts.push(L.footerCold(usd(rewriteCost(S.ctx, S.model, ttlMin()))))
  const high = S.rateLimits.filter((l) => (l.percentUsed || 0) >= 80)
  if (high.length) parts.push(L.footerLimits(limitsText(high)))
  return parts.join(', ')
}
