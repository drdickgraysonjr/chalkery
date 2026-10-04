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
import { tokens, usd } from './fmt.mjs'

const MIN = 60000
const TICK_EVERY = 30000
const CACHE = { plugin: 'cache-meter', key: 'cache' }
const HANDOFF = 'handoff'
const SEND = 'Надіслати все одно'
const COMPACT = 'Стиснути й надіслати'
const CANCEL = 'Скасувати'

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

// Ukrainian words for the band, the toasts and /cache
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

function minutes(ms) {
  const m = Math.round((Number(ms) || 0) / 60000)
  if (m <= 60) return m + ' хв'
  return Math.floor(m / 60) + ' год ' + String(m % 60).padStart(2, '0') + ' хв'
}

function clock(ts) {
  const d = new Date(ts)
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')
}

function pings(n) {
  return `${n} ${plural(n, 'пінг', 'пінги', 'пінгів')}`
}

const TTL_SOURCE = { default: 'типово', measured: 'виміряно' }

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
const LIMIT_LABEL = { five_hour: '5 год', seven_day: 'тиждень', spend_limit: 'витрати' }

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
  $.ui.toast(`Тримаю кеш теплим до ${clock(S.keepWarmUntil)}: перед кожним охолодженням маленький запит його перечитає.`)
}

function stopKeepWarm($, why) {
  if (!S.keepWarm) return
  S.keepWarm = false
  $.ui.toast(`Більше не тримаю кеш теплим: ${why}. Було ${pings(S.pings)} на ${usd(S.pingUsd)}.`, { timeoutMs: 8000 })
}

async function keepWarmStep($) {
  if (!S.keepWarm) return
  if (now >= S.keepWarmUntil) return stopKeepWarm($, 'вийшов час')
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
    return stopKeepWarm($, 'пінг лишився без відповіді, тож кеш, схоже, уже охолов')
  }
  const u = reply.usage
  S.pings += 1
  S.lastPingAt = now
  S.pingUsd += requestCost(u, S.model, ttl)
  // A ping that writes instead of reading did not hit the cache: stop paying for it
  if ((u.cache_creation_input_tokens || 0) > 0.1 * Math.max(1, u.cache_read_input_tokens || 0)) {
    return stopKeepWarm($, `пінг записав ${tokens(u.cache_creation_input_tokens)} токенів замість того, щоб прочитати кеш`)
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
  $.ui.toast(`Кеш на ${tokens(S.ctx)} токенів охолоне за ${minutes(st.left)}. Перезаписати його коштуватиме ≈ ${cost}. Набери /${names.keepwarm} або натисни 1, щоб тримати його теплим.`, { timeoutMs: 15000 })
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
  lines.push(`cache-meter: у контексті ${tokens(S.ctx)} токенів, модель ${priceFor(S.model).id}, кеш живе ${ttl} хв (${settings.ttlMin ? 'задано вручну' : TTL_SOURCE[S.ttlSource] || S.ttlSource}).`)
  if (st.kind === 'unknown') lines.push('У цій сесії ще не було запиту, тож стан кешу невідомий.')
  if (st.kind === 'warm' || st.kind === 'cooling') lines.push(`Кеш теплий ще ≈ ${minutes(st.left)}.`)
  if (st.kind === 'cold') lines.push(`Кеш охолов ${minutes(-st.left)} тому. Наступне повідомлення перезапише його ≈ за ${usd(rewriteCost(S.ctx, S.model, ttl))}.`)
  if (S.keepWarm) lines.push(`Тримаю кеш теплим до ${clock(S.keepWarmUntil)}: поки що ${pings(S.pings)} на ${usd(S.pingUsd)}.`)
  if (S.rateLimits.length) lines.push(`Використано лімітів плану: ${limitsText(S.rateLimits)}.`)
  lines.push(`Сесія поки коштувала ${usd(S.costUsd)}. Кеш охолов і перезаписався ${S.coldRestarts.length} ${plural(S.coldRestarts.length, 'раз', 'рази', 'разів')}: ${usd(S.coldRestarts.reduce((a, c) => a + c.usd, 0))}.`)
  lines.push(`Питання перед відправкою в охололий кеш: ${settings.guard ? 'увімкнено' : 'вимкнено'}, для контексту від ${tokens(settings.bigTokens)} токенів. Попередження: ${settings.alerts ? 'увімкнено' : 'вимкнено'}.`)
  lines.push(`Налаштування: /${names.cache} ttl 5|60|auto, /${names.cache} guard on|off, /${names.cache} big 150k, /${names.cache} alerts on|off. Тримати теплим: /${names.keepwarm} [години|off].`)
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
    names.cache = (await registerCommand($, 'cache', 'Стан кешу промпту і налаштування cache-meter', '[ttl 5|60|auto] [guard on|off] [big 150k] [alerts on|off]')) || names.cache
    names.keepwarm = (await registerCommand($, 'keepwarm', 'Тримати кеш цієї сесії теплим (типово 4 год) або /keepwarm off', '[години|off]', true)) || names.keepwarm
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
    const handoffLabel = `Запустити /${HANDOFF}`
    const options = [SEND, COMPACT, ...(handoff ? [handoffLabel] : []), CANCEL]
    let answer = SEND
    try {
      answer = await $.ui.ask(
        `Кеш охолов ${minutes(-left)} тому. Якщо надіслати зараз, ${tokens(S.ctx)} токенів контексту запишуться в кеш заново (≈ ${cost}). Що робимо?`,
        options,
      )
    } catch {
      // nobody to ask (a -p run, or the dialog was dismissed): send as typed
      return next(e)
    }
    if (answer === COMPACT) {
      try {
        await $.session.compact()
      } catch {
        // compaction refused or failed: send anyway
      }
      return next(e)
    }
    if (answer === SEND) return next(e)
    if (handoff && answer === handoffLabel) {
      // Off the hook: a command started inside a hook the session waits on is refused
      $.clock.after(50, () =>
        $.command.run({ command: handoff, args: '' }).catch((err) => {
          $.ui.toast(`Не вдалося запустити /${handoff}: ${String((err && err.message) || err).slice(0, 100)}`, { timeoutMs: 8000 })
        }),
      )
      // The handoff turn still reads the whole context, so it pays this rewrite once;
      // what it saves is every later turn in a context this big
      return { drop: `Не надіслано: запускаю /${handoff}. Він один раз перезапише охололий кеш (≈ ${cost}), зате наступна сесія почнеться з малого контексту.` }
    }
    $.ui.toast('Не надіслано. Нова сесія з коротким хендофом обійдеться без цього перезапису.', { timeoutMs: 8000 })
    return { drop: 'Скасовано: cache-meter зупинив перезапис охололого кешу' }
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
      stopKeepWarm($, 'вимкнено')
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
    if (st.kind === 'kept') parts.push(Text({ color: 'cyan', children: [`◆ тримаю кеш теплим до ${clock(S.keepWarmUntil)} · ${pings(S.pings)} ${usd(S.pingUsd)}`] }))
    else if (st.kind === 'warm') parts.push(Text({ color: 'green', children: [`● кеш теплий ще ${minutes(st.left)}`] }))
    else if (st.kind === 'cooling') parts.push(Text({ color: 'yellow', bold: true, children: [`◐ кеш охолоне за ${minutes(st.left)}`] }))
    else if (st.kind === 'cold') parts.push(Text(big ? { color: 'red', bold: true, children: [`○ кеш охолов ${minutes(-st.left)} тому`] } : { dimColor: true, children: [`○ кеш охолов ${minutes(-st.left)} тому`] }))
    parts.push(Text({ dimColor: true, children: [` │ контекст ${tokens(S.ctx)}`] }))
    if (st.kind === 'cold' && big) parts.push(Text({ color: 'red', children: [` │ наступне повідомлення перезапише його ≈ ${usd(rewriteCost(S.ctx, S.model, ttl))}`] }))
    else parts.push(Text({ dimColor: true, children: [` │ перезапис ≈ ${usd(rewriteCost(S.ctx, S.model, ttl))}`] }))
    if (S.rateLimits.length) parts.push(Text(limitTone(S.rateLimits, { children: [' │ ліміти: ' + limitsText(S.rateLimits)] })))
    parts.push(Text({ dimColor: true, children: [` │ сесія ${usd(S.costUsd)}`] }))
    if (S.coldRestarts.length) parts.push(Text({ dimColor: true, children: [` │ охолов ${S.coldRestarts.length} ${plural(S.coldRestarts.length, 'раз', 'рази', 'разів')}: ${usd(S.coldRestarts.reduce((a, c) => a + c.usd, 0))}`] }))
    const row = [Box({ key: 'parts', flexDirection: 'row', children: parts })]
    if (st.kind === 'cooling' && big) {
      row.push(Button({ key: 'keepwarm', label: 'тримати теплим', hotkey: '1', plain: true, onPress: async () => { now = await $.clock.now(); startKeepWarm($, settings.keepWarmHours); await publish($); $.ui.invalidate('ui.render') } }))
    } else if (st.kind === 'kept') {
      row.push(Button({ key: 'keepwarm', label: 'не тримати', hotkey: '1', plain: true, onPress: async () => { now = await $.clock.now(); stopKeepWarm($, 'вимкнено'); await publish($); $.ui.invalidate('ui.render') } }))
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
  if (st.kind === 'kept') parts.push('кеш тримаю теплим')
  else if (st.kind === 'cooling' && big) parts.push(`кеш охолоне за ${minutes(st.left)} · /keepwarm`)
  else if (st.kind === 'cold' && big) parts.push(`кеш охолов · перезапис ≈ ${usd(rewriteCost(S.ctx, S.model, ttlMin()))}`)
  const high = S.rateLimits.filter((l) => (l.percentUsed || 0) >= 80)
  if (high.length) parts.push('ліміти: ' + limitsText(high))
  return parts.join(' · ')
}
