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

import { rewriteCost, requestCost, totalInput, cachedShare, priceFor } from './pricing.mjs'
import { tokens, usd, minutes, clock } from './fmt.mjs'

const MIN = 60000
const TICK_EVERY = 30000
const CACHE = { plugin: 'cache-meter', key: 'cache' }
const HANDOFF = 'handoff'

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
const LIMIT_LABEL = { five_hour: '5h', seven_day: 'week', spend_limit: 'spend' }

function limitsText(limits) {
  return limits.map((l) => `${LIMIT_LABEL[l.kind] || l.kind} ${Math.round(l.percentUsed)}%`).join(' · ')
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
  $.ui.toast(`Keeping this cache warm until ${clock(S.keepWarmUntil)}. A ping reads the cache before it expires.`)
}

function stopKeepWarm($, why) {
  if (!S.keepWarm) return
  S.keepWarm = false
  $.ui.toast(`Keep warm off (${why}). ${S.pings} ping(s), ${usd(S.pingUsd)}.`, { timeoutMs: 8000 })
}

async function keepWarmStep($) {
  if (!S.keepWarm) return
  if (now >= S.keepWarmUntil) return stopKeepWarm($, 'time limit reached')
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
    return stopKeepWarm($, 'the ping got no answer, so the cache may already be cold')
  }
  const u = reply.usage
  S.pings += 1
  S.lastPingAt = now
  S.pingUsd += requestCost(u, S.model, ttl)
  // A ping that writes instead of reading did not hit the cache: stop paying for it
  if ((u.cache_creation_input_tokens || 0) > 0.1 * Math.max(1, u.cache_read_input_tokens || 0)) {
    return stopKeepWarm($, `the ping wrote ${tokens(u.cache_creation_input_tokens)} tokens instead of reading the cache`)
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
  $.ui.toast(`This session: ${tokens(S.ctx)}-token cache goes cold in ${minutes(st.left)}. Rewriting it costs about ${cost}. Type /${names.keepwarm} or press 1.`, { timeoutMs: 15000 })
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
  lines.push(`Cache Meter: ${tokens(S.ctx)} tokens in context on ${priceFor(S.model).id}, cache window ${ttl} min (${settings.ttlMin ? 'set by you' : S.ttlSource}).`)
  if (st.kind === 'unknown') lines.push('No request yet this session, so the cache state is unknown.')
  if (st.kind === 'warm' || st.kind === 'cooling') lines.push(`Cache is warm for about ${minutes(st.left)} more.`)
  if (st.kind === 'cold') lines.push(`Cache went cold ${minutes(-st.left)} ago. The next message rewrites it for about ${usd(rewriteCost(S.ctx, S.model, ttl))}.`)
  if (S.keepWarm) lines.push(`Keep warm is on until ${clock(S.keepWarmUntil)}: ${S.pings} ping(s), ${usd(S.pingUsd)} so far.`)
  if (S.rateLimits.length) lines.push(`Plan limits used: ${limitsText(S.rateLimits)}.`)
  lines.push(`Session cost so far: ${usd(S.costUsd)}. Cold restarts this session: ${S.coldRestarts.length} (${usd(S.coldRestarts.reduce((a, c) => a + c.usd, 0))}).`)
  lines.push(`Cold-send guard: ${settings.guard ? 'on' : 'off'} for contexts over ${tokens(settings.bigTokens)} tokens. Alerts: ${settings.alerts ? 'on' : 'off'}.`)
  lines.push(`Settings: /${names.cache} ttl 5|60|auto, /${names.cache} guard on|off, /${names.cache} big 150k, /${names.cache} alerts on|off. Keep warm: /${names.keepwarm} [hours|off].`)
  return lines.join('\n')
}

function parseTokens(text) {
  const m = String(text || '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([km]?)$/)
  if (!m) return null
  return Math.round(Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1))
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    now = await $.clock.now()
    S.model = await $.session.model()
    await loadSettings($)
    names.cache = (await registerCommand($, 'cache', 'Cache Meter status and settings', '[ttl 5|60|auto] [guard on|off] [big 150k] [alerts on|off]')) || names.cache
    names.keepwarm = (await registerCommand($, 'keepwarm', 'Keep this session\'s prompt cache warm (default 4 hours), or /keepwarm off', '[hours|off]', true)) || names.keepwarm
    $.clock.every(TICK_EVERY, () => tick($).catch(() => {}))
    await publish($)
    return next(e)
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
    const handoffLabel = `Run /${HANDOFF} instead`
    const options = ['Send anyway', 'Compact first, then send', ...(handoff ? [handoffLabel] : []), 'Cancel']
    let answer = 'Send anyway'
    try {
      answer = await $.ui.ask(
        `Cache went cold ${minutes(-left)} ago. Sending now rewrites ${tokens(S.ctx)} tokens of context (about ${cost}). What should happen?`,
        options,
      )
    } catch {
      // nobody to ask (a -p run, or the dialog was dismissed): send as typed
      return next(e)
    }
    if (answer === 'Compact first, then send') {
      try {
        await $.session.compact()
      } catch {
        // compaction refused or failed: send anyway
      }
      return next(e)
    }
    if (answer === 'Send anyway') return next(e)
    if (handoff && answer === handoffLabel) {
      // Off the hook: a command started inside a hook the session waits on is refused
      $.clock.after(50, () =>
        $.command.run({ command: handoff, args: '' }).catch((err) => {
          $.ui.toast(`Could not start /${handoff}: ${String((err && err.message) || err).slice(0, 100)}`, { timeoutMs: 8000 })
        }),
      )
      return { drop: `Not sent: running /${handoff} instead of rewriting the cold cache (about ${cost})` }
    }
    $.ui.toast('Not sent. A fresh session with a short handoff avoids the rewrite entirely.', { timeoutMs: 8000 })
    return { drop: 'Cancelled by cache-meter before a cold cache rewrite' }
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
      stopKeepWarm($, 'turned off')
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
    if (st.kind === 'kept') parts.push(Text({ key: 'cache', color: 'cyan', children: [`◆ kept warm · ${S.pings} ping${S.pings === 1 ? '' : 's'} ${usd(S.pingUsd)} · until ${clock(S.keepWarmUntil)}`] }))
    else if (st.kind === 'warm') parts.push(Text({ key: 'cache', color: 'green', children: [`● cache warm ${minutes(st.left)}`] }))
    else if (st.kind === 'cooling') parts.push(Text({ key: 'cache', color: 'yellow', bold: true, children: [`◐ cache cools in ${minutes(st.left)}`] }))
    else if (st.kind === 'cold') parts.push(Text(big ? { key: 'cache', color: 'red', bold: true, children: [`○ cache cold ${minutes(-st.left)}`] } : { key: 'cache', dimColor: true, children: [`○ cache cold ${minutes(-st.left)}`] }))
    parts.push(Text({ key: 'ctx', dimColor: true, children: [` │ ctx ${tokens(S.ctx)}`] }))
    if (st.kind === 'cold' && big) parts.push(Text({ key: 'rewrite', color: 'red', children: [` │ next send rewrites it ≈ ${usd(rewriteCost(S.ctx, S.model, ttl))}`] }))
    else parts.push(Text({ key: 'rewrite', dimColor: true, children: [` │ rewrite ≈ ${usd(rewriteCost(S.ctx, S.model, ttl))}`] }))
    if (S.rateLimits.length) parts.push(Text(limitTone(S.rateLimits, { key: 'limits', children: [' │ ' + limitsText(S.rateLimits)] })))
    parts.push(Text({ key: 'session', dimColor: true, children: [` │ session ${usd(S.costUsd)}`] }))
    if (S.coldRestarts.length) parts.push(Text({ key: 'cold-restarts', dimColor: true, children: [` │ ${S.coldRestarts.length} cold restart${S.coldRestarts.length === 1 ? '' : 's'} ${usd(S.coldRestarts.reduce((a, c) => a + c.usd, 0))}`] }))
    const row = [Box({ key: 'parts', flexDirection: 'row', children: parts })]
    if (st.kind === 'cooling' && big) {
      row.push(Button({ key: 'keepwarm', label: 'keep warm', hotkey: '1', plain: true, onPress: async () => { now = await $.clock.now(); startKeepWarm($, settings.keepWarmHours); await publish($); $.ui.invalidate('ui.render') } }))
    } else if (st.kind === 'kept') {
      row.push(Button({ key: 'keepwarm', label: 'stop warm', hotkey: '1', plain: true, onPress: async () => { now = await $.clock.now(); stopKeepWarm($, 'turned off'); await publish($); $.ui.invalidate('ui.render') } }))
    }
    const mine = Box({ key: 'cache-meter', flexDirection: 'row', columnGap: 2, children: row })
    return Box({ flexDirection: 'column', children: below ? [mine, below] : [mine] })
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
  if (st.kind === 'kept') parts.push('cache kept warm')
  else if (st.kind === 'cooling' && big) parts.push(`cache cools in ${minutes(st.left)} · /keepwarm`)
  else if (st.kind === 'cold' && big) parts.push(`cache cold · rewrite ≈ ${usd(rewriteCost(S.ctx, S.model, ttlMin()))}`)
  const high = S.rateLimits.filter((l) => (l.percentUsed || 0) >= 80)
  if (high.length) parts.push(limitsText(high))
  return parts.join(' · ')
}
