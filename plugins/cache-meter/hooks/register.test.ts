// SPDX-License-Identifier: MIT
import { describe, expect, mock, test as kitTest } from 'claude-code/testing'
import type { On } from 'claude-code'
import en from './locales/en.mjs'
import uk from './locales/uk.mjs'

// The tests below are written against the Ukrainian text: the mod's language here is uk unless a test sets another
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const test = (name: string, ...rest: any[]) =>
  rest.length === 1
    ? kitTest(name, { options: { language: 'uk' } }, rest[0])
    : kitTest(name, { ...rest[0], options: { language: 'uk', ...rest[0].options } }, rest[1])

// The repo's neighbouring mods: each puts its row into the shared band the same way the real one does.
const fakeHandoffRelay = {
  name: 'handoff-relay',
  register: (on: On) => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      // A test plugin lives in its own environment without imports, so it merges the band itself, by the same contract
      const below = (await next(e)) as { type?: string; props?: { key?: string }; children?: unknown[] } | null
      const { Box, Text } = $.ui.resolve(e)
      const place = (row: { props?: { key?: string } }) => Number(String(row.props?.key ?? '').split(':')[1] ?? 999)
      const rows = (below?.type === 'Box' && below.props?.key === 'prompt-band'
        ? [...(below.children ?? [])]
        : below ? [Box({ key: 'prompt-band-row:999:other', flexDirection: 'column', children: [below as never] })] : []) as { props?: { key?: string } }[]
      rows.push(Box({ key: 'prompt-band-row:10:handoff-relay', flexDirection: 'column', children: [Text({ children: ['handoff-relay'] })] }))
      rows.sort((a, b) => place(a) - place(b))
      return Box({ key: 'prompt-band', flexDirection: 'column', rowGap: 0.5, children: rows as never[] })
    })
  },
}
const fakeNextSteps = {
  name: 'next-steps',
  register: (on: On) => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      // A test plugin lives in its own environment without imports, so it merges the band itself, by the same contract
      const below = (await next(e)) as { type?: string; props?: { key?: string }; children?: unknown[] } | null
      const { Box, Text } = $.ui.resolve(e)
      const place = (row: { props?: { key?: string } }) => Number(String(row.props?.key ?? '').split(':')[1] ?? 999)
      const rows = (below?.type === 'Box' && below.props?.key === 'prompt-band'
        ? [...(below.children ?? [])]
        : below ? [Box({ key: 'prompt-band-row:999:other', flexDirection: 'column', children: [below as never] })] : []) as { props?: { key?: string } }[]
      rows.push(Box({ key: 'prompt-band-row:30:next-steps', flexDirection: 'column', children: [Text({ children: ['next-steps'] })] }))
      rows.sort((a, b) => place(a) - place(b))
      return Box({ key: 'prompt-band', flexDirection: 'column', rowGap: 0.5, children: rows as never[] })
    })
  },
}
const BAND_ORDER = [
  'prompt-band-row:10:handoff-relay',
  'prompt-band-row:20:cache-meter',
  'prompt-band-row:30:next-steps',
  'prompt-band-row:999:other',
]
const bandKeys = async (ui: { drawn: () => Promise<unknown> }) => {
  const tree = (await ui.drawn()) as { props?: { key?: string }; children?: { props?: { key?: string } }[] }
  expect(tree.props?.key).toBe('prompt-band')
  return (tree.children ?? []).map((row) => row.props?.key)
}

const SURFACES = ['terminal', 'desktop'] as const
const MIN = 60_000
const MODEL = 'claude-opus-5-5'

const props = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 140,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const typed = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 140 } }

// Reads cache-meter's published state the way another mod would
const peek = {
  name: 'peek',
  register: (on: On) => {
    on('command.run', { command: 'peek' }, async ($) => {
      const { value } = await $.state.get({ plugin: 'cache-meter', key: 'cache' })
      return { text: JSON.stringify(value ?? null) }
    })
  },
}

type Limit = { kind: string; percentUsed: number }
// A subscription reports five_hour and seven_day plan limits; the API reports none
const SUBSCRIPTION: Limit[] = [{ kind: 'five_hour', percentUsed: 10 }, { kind: 'seven_day', percentUsed: 5 }]
const API: Limit[] = []

type World = {
  commands?: string[]
  answer?: string
  // Plan limits the engine reports after each answer; a subscription unless given
  limits?: Limit[]
  model?: string
  // What the mod's $.store holds at the start
  stored?: Record<string, unknown>
}

// Everything beneath the plugins a session would answer
function world($: unknown, on: On, w: World = {}) {
  const clk = mock.clock(on, { now: 10 * 60 * MIN })
  // The mod's $.store, in memory and open to the test
  const store: Record<string, unknown> = { ...w.stored }
  on('store.get', (_$, e) => ({ value: store[e.key] }) as never)
  on('store.set', (_$, e) => {
    store[e.key] = e.value
    return { value: undefined } as never
  })
  const asked: { question: string; options: readonly string[] }[] = []
  const runs: string[] = []
  const forks: number[] = []
  const toasts: string[] = []
  const model = w.model ?? MODEL
  let limits = w.limits ?? SUBSCRIPTION
  let cacheRead = 200_000
  let cacheWrite = 0
  on('session.start', () => ({ cwd: '/x' }))
  on('session.model', () => ({ value: model }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: limits, cost: { usd: 3.2 } } }) as never)
  on('turn.complete', () => ({ text: '' }))
  on('command.register', () => ({ value: {} }) as never)
  on('command.list', () => ({ value: (w.commands ?? []).map((name) => ({ name, description: '', source: 'skills' })) }) as never)
  on('command.run', (_$, e) => {
    runs.push(e.command)
    return { text: '' }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? ''))
    return { value: undefined }
  })
  // $.ui.ask is a tool.call of AskUserQuestion
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    asked.push({ question: q.question, options: q.options.map((o) => o.label) })
    const answer = w.answer ?? 'Надіслати все одно'
    return { result: { questions: [q], answers: { [q.question]: answer } } } as never
  })
  on('session.compact', () => ({}) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  // The engine's own row; for the footer, the mode labels it was handed
  on('ui.render', { component: 'SessionMode' }, ($$, e) =>
    $$.ui.resolve(e).Text({ key: 'modes', children: [((e.props as { modes?: string[] }).modes ?? []).join(' | ')] }))
  on('ui.render', ($$, e) => $$.ui.resolve(e).Text({ key: 'engine', children: ['engine row'] }))
  on('classic.PostModelSwitch', () => ({}) as never)
  on('turn.step', async function* (_$, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite, model },
    } as never
  })
  on('model.fork', () => {
    forks.push(clk.now)
    return { value: { isAnswered: true, answer: 'ok', usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: 200_000, cache_creation_input_tokens: 0 } } } as never
  })
  return {
    clk,
    asked,
    runs,
    forks,
    toasts,
    store,
    setRead: (n: number) => {
      cacheRead = n
    },
    setWrite: (n: number) => {
      cacheWrite = n
    },
    setLimits: (l: Limit[]) => {
      limits = l
    },
  }
}

async function start($: any) {
  await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
}

// One main-loop request that reads the cache, and the end of its turn
async function step($: any) {
  const s = $.turn.step({ turnId: 't', index: 0, model: MODEL, messageCount: 1 })
  let x = await s.next()
  while (!x.done) x = await s.next()
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
  return x.value
}

async function cache($: any, args = '') {
  return ((await $.command.run({ command: 'cache', args, ...typed })) as { text: string }).text
}

async function state($: any) {
  const r = await $.command.run({ command: 'peek', ...typed })
  return JSON.parse(r.text)
}

async function submit($: any, text = 'next task') {
  return $.prompt.submit({ text, origin: { kind: 'composer' } })
}

for (const surface of SURFACES) {
  describe(surface, () => {
    test('warm band: row format as in cache-keeper, the engine row stays below it', async ($, on) => {
      world($, on)
      await start($)
      await step($)
      const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })

      // All parts, the button too, are split by the same dim bar; only the dot is green; capitalised
      const band = await ui.find({ key: 'cache-meter' })
      expect(band?.props.columnGap).toBe(1)
      expect(band?.text).toContain('● Кеш теплий ще 60 хв│Перекешування коштуватиме ≈ 200k│')
      const bars = await ui.findAll({ text: /^│$/ })
      expect(bars).toHaveLength(2)
      for (const bar of bars) expect(bar.props.dimColor).toBe(true)
      expect((await ui.find({ text: /^●$/ }))?.props.color).toBe('green')
      expect((await ui.find({ text: /^ Кеш теплий ще 60 хв$/ }))?.props.dimColor).toBe(true)
      expect(await ui.find({ text: /^Перекешування коштуватиме ≈ 200k$/ })).toBeDefined()
      // Keep warm is always visible while the cache is warm; dim, since there is still time. A real button,
      // like Handoff: no plain, and the letter only in the terminal (the desktop draws it as a chip before the label)
      const keep = await ui.find({ key: 'keepwarm' })
      expect(keep?.type).toBe('Button')
      expect(keep?.props.label).toBe('Тримати теплим')
      expect(keep?.props.dimColor).toBe(true)
      expect(keep?.props.plain).toBeUndefined()
      expect(keep?.props.hotkey).toBe(surface === 'terminal' ? 'k' : undefined)
      expect(await ui.find({ text: /^engine row$/ })).toBeDefined()
      // The band's rows are half a line apart, not a whole empty one
      expect((await ui.find({ key: 'prompt-band' }))?.props.rowGap).toBe(0.5)
    })

    for (const order of [[fakeHandoffRelay, fakeNextSteps], [fakeNextSteps, fakeHandoffRelay]]) {
      test(`shared band: cache between Handoff and "What next?", whatever order the neighbours loaded in (${order.map((p) => p.name).join(', ')})`, { plugins: order }, async ($, on) => {
        world($, on)
        await start($)
        await step($)
        const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })
        expect(await bandKeys(ui)).toEqual(BAND_ORDER)
      })
    }

    test('no context or session in the band; limits only from 80%', async ($, on) => {
      world($, on)
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      await start($)
      await step($)
      const measure = (fiveHour: number) =>
        $.session.measure({
          context: { tokens: 108_000, window: 1_000_000 },
          rateLimits: [
            { kind: 'five_hour', percentUsed: fiveHour },
            { kind: 'seven_day', percentUsed: 59 },
          ],
          cost: { usd: 0.92 },
          changed: ['context', 'rateLimits', 'cost'],
        } as never)
      await measure(9)
      const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })

      const text = (await ui.find({ key: 'cache-meter' }))?.text ?? ''
      expect(text).toContain('● Кеш теплий ще 60 хв│Перекешування коштуватиме ≈ 108k')
      expect(text).not.toContain('контекст')
      expect(text).not.toContain('сесія')
      expect(text).not.toContain('Ліміти')

      await measure(84)
      const ui84 = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })
      const limits = await ui84.find({ text: /^Ліміти: 5 год 84%$/ })
      expect(limits?.props.color).toBe('yellow')
      expect((await ui84.find({ key: 'cache-meter' }))?.text).not.toContain('тиждень')
    })

    test('no band before the first request, the engine row stays', async ($, on) => {
      world($, on)
      await start($)
      const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'cache-meter' })).toBeUndefined()
      expect(await ui.find({ text: /^engine row$/ })).toBeDefined()
    })

    test('under a survey the band gives way', async ($, on) => {
      world($, on)
      await start($)
      await step($)
      const ui = await $.ui.mount({
        plugin: 'cache-meter', surface, component: 'AbovePrompt', props: { ...props, hasSurvey: true },
      })

      expect(await ui.find({ key: 'cache-meter' })).toBeUndefined()
      expect(await ui.find({ text: /^engine row$/ })).toBeDefined()
    })

    test('big cache cooling: Keep warm is no longer dim', async ($, on) => {
      const w = world($, on)
      await start($)
      await step($)
      await w.clk.advance(56 * MIN)
      const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ text: /^◐ Кеш охолоне за/ })).toBeDefined()
      const keep = await ui.find({ key: 'keepwarm' })
      expect(keep?.props.label).toBe('Тримати теплим')
      expect(keep?.props.dimColor).toBeUndefined()
      expect(keep?.props.hotkey).toBe(surface === 'terminal' ? 'k' : undefined)
    })

    test('cold big cache: red rewrite warning', async ($, on) => {
      const w = world($, on)
      await start($)
      await step($)
      await w.clk.advance(61 * MIN)
      const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ text: /^○ Кеш охолов 1 хв тому$/ })).toBeDefined()
      // There is nothing left to keep warm in a cold cache
      expect(await ui.find({ key: 'keepwarm' })).toBeUndefined()
      const rewrite = await ui.find({ text: /^Наступне повідомлення перекешує ≈ 200k$/ })
      expect(rewrite).toBeDefined()
      expect(rewrite?.props.color).toBe('red')
    })

    test('keep warm: a ping 8 min before the cache ends, the band shows kept warm', async ($, on) => {
      const w = world($, on)
      await start($)
      await step($)
      await $.command.run({ command: 'keepwarm', ...typed })
      await w.clk.advance(51 * MIN)
      expect(w.forks.length).toBe(0)
      await w.clk.advance(2 * MIN)
      expect(w.forks.length).toBe(1)
      const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ text: /^◆ Тримаю кеш теплим до \d{1,2}:\d\d, 1 пінг 200k$/ })).toBeDefined()
      const keep = await ui.find({ key: 'keepwarm' })
      expect(keep?.props.label).toBe('Не тримати')
      // Digits stay with the next-steps suggestions; no letter on the desktop
      expect(keep?.props.hotkey).toBe(surface === 'terminal' ? 'k' : undefined)
    })
  })
}

test('state for other mods: warm → cold, rewrite cost, isBig', { plugins: [peek] }, async ($, on) => {
  const w = world($, on)
  await start($)
  expect((await state($)).kind).toBe('unknown')
  await step($)
  expect(await state($)).toEqual({ kind: 'warm', ctx: 200_010, isBig: true, rewriteUsd: 1.6, ttlMin: 60, model: 'opus-5-5', rewriteTokens: 200_010, unit: 'tokens' })
  await w.clk.advance(56 * MIN)
  expect((await state($)).kind).toBe('cooling')
  await w.clk.advance(5 * MIN)
  expect((await state($)).kind).toBe('cold')
})

test('/cache big raises the threshold: isBig in the state goes off', { plugins: [peek] }, async ($, on) => {
  world($, on)
  await start($)
  await step($)
  const r = (await $.command.run({ command: 'cache', args: 'big 300k', ...typed })) as { text: string }
  expect(r.text).toContain('Питання перед відправкою в охололий кеш: увімкнено, для контексту від 300k токенів')
  expect((await state($)).isBig).toBe(false)
})

test('cold send with /handoff in the session: the Handoff choice cancels the send and runs /handoff', async ($, on) => {
  const w = world($, on, { commands: ['handoff', 'cache'], answer: 'Запустити /handoff' })
  await start($)
  await step($)
  await w.clk.advance(61 * MIN)
  const r = (await submit($)) as { drop?: string }

  expect(w.asked.length).toBe(1)
  expect(w.asked[0].options).toEqual(['Надіслати все одно', 'Стиснути й надіслати', 'Запустити /handoff', 'Скасувати'])
  expect(r.drop).toContain('запускаю /handoff')
  expect(w.runs).not.toContain('handoff')
  await w.clk.advance(100)
  expect(w.runs).toContain('handoff')
})

test('cold send, /handoff only from a plugin skill: the choice runs it by its full name', async ($, on) => {
  const w = world($, on, { commands: ['handoff-relay:handoff', 'cache'], answer: 'Запустити /handoff-relay:handoff' })
  await start($)
  await step($)
  await w.clk.advance(61 * MIN)
  const r = (await submit($)) as { drop?: string }

  expect(w.asked[0].options).toContain('Запустити /handoff-relay:handoff')
  expect(r.drop).toContain('запускаю /handoff-relay:handoff')
  await w.clk.advance(100)
  expect(w.runs).toContain('handoff-relay:handoff')
})

test('cold send without /handoff: no such choice, Cancel cancels', async ($, on) => {
  const w = world($, on, { commands: ['cache'], answer: 'Скасувати' })
  await start($)
  await step($)
  await w.clk.advance(61 * MIN)
  const r = (await submit($)) as { drop?: string }

  expect(w.asked[0].options).toEqual(['Надіслати все одно', 'Стиснути й надіслати', 'Скасувати'])
  expect(r.drop).toContain('Скасовано: cache-meter')
  await w.clk.advance(100)
  expect(w.runs).not.toContain('handoff')
})

test('cold send: Send anyway lets the text through as is', async ($, on) => {
  const w = world($, on, { commands: ['handoff'], answer: 'Надіслати все одно' })
  await start($)
  await step($)
  await w.clk.advance(61 * MIN)
  const r = (await submit($, 'привіт')) as { text?: string; drop?: string }

  expect(w.asked.length).toBe(1)
  expect(r.drop).toBeUndefined()
  expect(r.text).toBe('привіт')
})

test('warm cache or small context: no question', async ($, on) => {
  const w = world($, on, { commands: ['handoff'], answer: 'Скасувати' })
  await start($)
  await step($)
  await w.clk.advance(30 * MIN)
  expect(((await submit($)) as { text?: string }).text).toBe('next task')

  w.setRead(50_000)
  await step($)
  await w.clk.advance(61 * MIN)
  expect(((await submit($)) as { text?: string }).text).toBe('next task')
  expect(w.asked.length).toBe(0)
})

for (const surface of SURFACES) {
  test(`${surface}: plural forms and hours — 2 pings, 1 h 05 min, rewritten once`, async ($, on) => {
    const w = world($, on)
    await start($)
    await step($)
    await $.command.run({ command: 'keepwarm', ...typed })
    await w.clk.advance(53 * MIN)
    await w.clk.advance(53 * MIN)
    expect(w.forks.length).toBe(2)
    const kept = (await $.command.run({ command: 'cache', ...typed })) as { text: string }
    expect(kept.text).toMatch(/поки що 2 пінги, ≈ 400k \(API-еквівалент \$0\.\d\d\)/)
    expect(kept.text).toContain('кеш живе 60 хв (підписка)')

    await $.command.run({ command: 'keepwarm', args: 'off', ...typed })
    await w.clk.advance(125 * MIN)
    const cold = (await $.command.run({ command: 'cache', ...typed })) as { text: string }
    expect(cold.text).toMatch(/Кеш охолов 1 год \d\d хв тому/)

    // the next request writes the whole context to the cache again
    w.setRead(0)
    w.setWrite(200_000)
    await step($)
    const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })
    expect(await ui.find({ text: /^Перекешовано 1 раз: 200k$/ })).toBeDefined()
  })
}

// Language: en by the explicit option, auto by the language of Claude's replies from /config, English without it
for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: language en — band in English`, { options: { language: 'en' } }, async ($, on) => {
    world($, on)
    await start($)
    await step($)
    const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })
    expect(await ui.find({ text: /^ Cache warm for 60 min$/ })).toBeDefined()
    expect(await ui.find({ text: /^Re-caching would cost ≈ 200k$/ })).toBeDefined()
    expect((await ui.find({ key: 'keepwarm' }))?.props.label).toBe('Keep warm')
    expect(await ui.find({ text: /Кеш/ })).toBeUndefined()
  })

  test(`${surface}: language auto without /config — English`, { options: { language: 'auto' } }, async ($, on) => {
    world($, on)
    await start($)
    await step($)
    const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })
    expect((await ui.find({ key: 'keepwarm' }))?.props.label).toBe('Keep warm')
  })

  test(`${surface}: language auto, /config language ukrainian — Ukrainian`, { options: { language: 'auto' } }, async ($, on) => {
    world($, on)
    on('config.list', () => ({ value: [{ key: 'language', label: 'Language', kind: 'text', value: 'ukrainian', provider: { kind: 'engine' }, isLocked: false }] }) as never)
    await start($)
    await step($)
    const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })
    expect((await ui.find({ key: 'keepwarm' }))?.props.label).toBe('Тримати теплим')
  })
}

// The cache lifetime: from the plan, then from measurement and the engine; /cache ttl for one session
test('ttl: a subscription (five_hour limits) keeps 60 min', { plugins: [peek] }, async ($, on) => {
  const w = world($, on)
  await start($)
  // Before the first answer nothing is known yet
  expect(await cache($)).toContain('кеш живе 60 хв (типово)')
  await step($)
  expect(await cache($)).toContain('кеш живе 60 хв (підписка)')
  await w.clk.advance(30 * MIN)
  expect((await state($)).kind).toBe('warm')
})

test('ttl: no plan limits after the first answer means the API: 5 min', { plugins: [peek] }, async ($, on) => {
  const w = world($, on, { limits: API })
  await start($)
  await step($)
  expect(await cache($)).toContain('кеш живе 5 хв (API)')
  expect((await state($)).ttlMin).toBe(5)
  await w.clk.advance(6 * MIN)
  expect((await state($)).kind).toBe('cold')
})

test('ttl: a gateway spend limit alone is not a subscription', async ($, on) => {
  world($, on, { limits: [{ kind: 'spend_limit', percentUsed: 20 }] })
  await start($)
  await step($)
  expect(await cache($)).toContain('кеш живе 5 хв (API)')
})

test("ttl: the engine's cache_ttl from a model switch wins over the plan", async ($, on) => {
  world($, on)
  await start($)
  await step($)
  await $.classic.PostModelSwitch({
    from_model: MODEL, to_model: MODEL, requested_model: 'opus', source: 'command', context_tokens: 200_010,
    prompt_cache_warm: true, cache_ttl: '5m', estimated_cache_write_usd: 1.25, pricing: 'catalog',
  } as never)
  expect(await cache($)).toContain('кеш живе 5 хв (від рушія)')
  // A later answer with plan limits does not undo what the engine said
  await step($)
  expect(await cache($)).toContain('кеш живе 5 хв (від рушія)')
})

test('ttl: /cache ttl lasts for the session only and an old saved ttl is ignored', async ($, on) => {
  // What 0.2.0 saved: a ttl that held for every later session
  const w = world($, on, { stored: { settings: { bigTokens: 300000, guard: true, ttlMin: 5, alerts: true, keepWarmHours: 4 } } })
  await start($)
  await step($)
  expect(await cache($)).toContain('кеш живе 60 хв (підписка)')
  expect(w.store.settings).toEqual({ bigTokens: 300000, guard: true, alerts: true, keepWarmHours: 4 })
  expect(await cache($, 'ttl 5')).toContain('кеш живе 5 хв (задано вручну на цю сесію)')
  expect(w.store.settings).not.toHaveProperty('ttlMin')
  expect(await cache($, 'ttl auto')).toContain('кеш живе 60 хв (підписка)')
})

test('ttl: /cache names where the lifetime came from', async ($, on) => {
  const w = world($, on, { limits: API })
  await start($)
  await step($)
  expect(await cache($)).toContain('(API)')
  // A cache hit after more than 5 idle minutes proves the 1-hour TTL
  await w.clk.advance(10 * MIN)
  await step($)
  expect(await cache($)).toContain('кеш живе 60 хв (виміряно)')
})

// Amounts: tokens on a subscription or for a model without prices; dollars on the API
for (const surface of SURFACES) {
  test(`units: on a subscription the band, footer and toasts show tokens, not dollars (${surface})`, async ($, on) => {
    const w = world($, on)
    await start($)
    await step($)
    const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })
    const band = (await ui.find({ key: 'cache-meter' }))?.text ?? ''
    expect(band).toContain('Перекешування коштуватиме ≈ 200k│')
    expect(band).not.toContain('$')
    // The cooling toast
    await w.clk.advance(56 * MIN)
    const cooling = w.toasts.find((t) => t.startsWith('Кеш на 200k токенів охолоне'))
    expect(cooling).toContain('Перекешування коштуватиме ≈ 200k. Набери')
    // The footer once the big cache is cold
    await w.clk.advance(5 * MIN)
    const footer = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'SessionMode', props: { modes: [] } as never })
    expect(await footer.find({ text: /^кеш охолов, перекешування коштуватиме ≈ 200k$/ })).toBeDefined()
    expect(w.toasts.join('\n')).not.toContain('$')
  })
}

test('units: on the API the band shows dollars', async ($, on) => {
  world($, on, { limits: API })
  await start($)
  await step($)
  const ui = await $.ui.mount({ plugin: 'cache-meter', surface: 'terminal', component: 'AbovePrompt', props })
  // The API's 5-minute cache writes at 1.25x input: 200k tokens of Opus 5.5 ≈ $1.00
  expect((await ui.find({ key: 'cache-meter' }))?.text).toContain('Перекешування коштуватиме ≈ $1.00')
})

test('units: an unpriced model shows tokens and no dollars, even in /cache', { plugins: [peek] }, async ($, on) => {
  world($, on, { limits: API, model: 'claude-opus-6' })
  await start($)
  await step($)
  const ui = await $.ui.mount({ plugin: 'cache-meter', surface: 'terminal', component: 'AbovePrompt', props })
  const band = (await ui.find({ key: 'cache-meter' }))?.text ?? ''
  expect(band).toContain('Перекешування коштуватиме ≈ 200k│')
  const text = await cache($)
  expect(text).toContain('модель opus-6, ціни невідомі')
  expect(text).not.toContain('$')
  expect((await state($)).unit).toBe('tokens')
})

test('units: /cache on a subscription labels dollars as the API equivalent', async ($, on) => {
  const w = world($, on)
  await start($)
  await step($)
  await w.clk.advance(61 * MIN)
  const text = await cache($)
  expect(text).toMatch(/перекешує його: ≈ 200k \(API-еквівалент \$1\.60\)/)
  expect(text).toContain('Вартість сесії поки: API-еквівалент $3.20')
  expect(text.split('\n').filter((l) => l.includes('$') && !l.includes('API-еквівалент'))).toEqual([])
})

test('units: the cold-send question on a subscription has no dollars', async ($, on) => {
  const w = world($, on, { commands: ['handoff'], answer: 'Запустити /handoff' })
  await start($)
  await step($)
  await w.clk.advance(61 * MIN)
  const r = (await submit($)) as { drop?: string }
  expect(w.asked[0].question).toBe('Кеш охолов 1 хв тому. Якщо надіслати зараз, 200k токенів контексту запишуться в кеш заново. Що робимо?')
  expect(r.drop).toContain('перекешує контекст (≈ 200k)')
})

// Keep warm: what it will use, said up front; it stops before the plan limits run out
test('keep warm: the start toast estimates pings and what each reads', async ($, on) => {
  const w = world($, on)
  await start($)
  await step($)
  await $.command.run({ command: 'keepwarm', ...typed })
  // 4 hours at one ping every 52 minutes
  expect(w.toasts.at(-1)).toMatch(/^Тримаю кеш теплим до \d{1,2}:\d\d: ≈ 4 пінги, кожен читає ≈ 200k\.$/)
  // Half an hour ends before the first ping is due: no estimate of pings that never go out
  await $.command.run({ command: 'keepwarm', args: 'off', ...typed })
  await $.command.run({ command: 'keepwarm', args: '0.5', ...typed })
  expect(w.toasts.at(-1)).toMatch(/^Тримаю кеш теплим до \d{1,2}:\d\d: стільки він протримається й без пінгу\.$/)
})

test('keep warm: before the first ping nothing counts zero pings', async ($, on) => {
  const w = world($, on)
  await start($)
  await step($)
  await $.command.run({ command: 'keepwarm', ...typed })
  const ui = await $.ui.mount({ plugin: 'cache-meter', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ text: /^◆ Тримаю кеш теплим до \d{1,2}:\d\d$/ })).toBeDefined()
  expect(await cache($)).toMatch(/Тримаю кеш теплим до \d{1,2}:\d\d: пінгів ще не було\./)
  await $.command.run({ command: 'keepwarm', args: 'off', ...typed })
  expect(w.toasts.at(-1)).toBe('Більше не тримаю кеш теплим: вимкнено.')
  expect(w.toasts.join('\n')).not.toMatch(/\b0 пінг/)
})

test('keep warm: stops when a plan limit reaches 90%', async ($, on) => {
  const w = world($, on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await start($)
  await step($)
  await $.command.run({ command: 'keepwarm', ...typed })
  await w.clk.advance(53 * MIN)
  expect(w.forks.length).toBe(1)
  await $.session.measure({ context: { tokens: 200_010, window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 91 }], changed: ['rateLimits'] } as never)
  await w.clk.advance(1 * MIN)
  expect(w.toasts.at(-1)).toBe('Більше не тримаю кеш теплим: ліміт плану дійшов до 90% (5 год 91%). Було 1 пінг на 200k.')
  await w.clk.advance(60 * MIN)
  expect(w.forks.length).toBe(1)
})

test('keep warm: does not start at 90% of a plan limit', async ($, on) => {
  const w = world($, on, { limits: [{ kind: 'five_hour', percentUsed: 92 }, { kind: 'seven_day', percentUsed: 40 }] })
  await start($)
  await step($)
  await $.command.run({ command: 'keepwarm', ...typed })
  expect(w.toasts.at(-1)).toContain('Не тримаю кеш теплим: ліміт плану вже від 90% (5 год 92%)')
  await w.clk.advance(60 * MIN)
  expect(w.forks.length).toBe(0)
})

// Other mods read cache-meter.cache: a new version only adds to it
test('state for other mods: old fields stay, unit and rewrite tokens added', { plugins: [peek] }, async ($, on) => {
  world($, on, { limits: API })
  await start($)
  await step($)
  const value = await state($)
  for (const [field, type] of Object.entries({ kind: 'string', ctx: 'number', isBig: 'boolean', rewriteUsd: 'number', ttlMin: 'number', model: 'string' })) {
    expect(typeof value[field]).toBe(type)
  }
  expect(value).toMatchObject({ kind: 'warm', ctx: 200_010, isBig: true, rewriteUsd: 1, ttlMin: 5, model: 'opus-5-5', rewriteTokens: 200_010, unit: 'usd' })
})

kitTest('translations: en and uk have the same set of keys', async () => {
  const keys = (o: object): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v).map((n) => `${k}.${n}`) : [k])).sort()
  expect(keys(uk)).toEqual(keys(en))
})
