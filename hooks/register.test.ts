import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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

type World = {
  commands?: string[]
  answer?: string
}

// Everything beneath the plugins a session would answer
function world($: unknown, on: On, w: World = {}) {
  const clk = mock.clock(on, { now: 10 * 60 * MIN })
  mock.store(on)
  const asked: { question: string; options: readonly string[] }[] = []
  const runs: string[] = []
  const forks: number[] = []
  const toasts: string[] = []
  let cacheRead = 200_000
  let cacheWrite = 0
  on('session.start', () => ({ cwd: '/x' }))
  on('session.model', () => ({ value: MODEL }))
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
  on('ui.render', ($$, e) => $$.ui.resolve(e).Text({ key: 'engine', children: ['engine row'] }))
  on('turn.step', async function* (_$, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite, model: MODEL },
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
    setRead: (n: number) => {
      cacheRead = n
    },
    setWrite: (n: number) => {
      cacheWrite = n
    },
  }
}

async function start($: any) {
  await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
}

// One main-loop request that reads the cache
async function step($: any) {
  const s = $.turn.step({ turnId: 't', index: 0, model: MODEL, messageCount: 1 })
  let x = await s.next()
  while (!x.done) x = await s.next()
  return x.value
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
    test('тепла смуга: формат рядка як у cache-keeper, рядок рушія лишається під нею', async ($, on) => {
      world($, on)
      await start($)
      await step($)
      const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })

      // Стан і ціну зʼєднує сіра паличка, решта частин іде через проміжок; зелена лише крапка
      const parts = await ui.find({ key: 'parts' })
      expect(parts?.props.columnGap).toBe(3)
      expect(parts?.text).toBe('● кеш теплий ще 60 хв│перекешування коштуватиме ≈ $1.60')
      const pair = await ui.find({ key: 'state-price' })
      expect(pair?.props.columnGap).toBe(1)
      expect((await ui.find({ text: /^│$/ }))?.props.dimColor).toBe(true)
      expect((await ui.find({ text: /^●$/ }))?.props.color).toBe('green')
      expect((await ui.find({ text: /^ кеш теплий ще 60 хв$/ }))?.props.dimColor).toBe(true)
      expect(await ui.find({ text: /^перекешування коштуватиме ≈ \$1\.60$/ })).toBeDefined()
      // Тримати теплим видно завжди, поки кеш теплий; тихо, бо час ще є
      const keep = await ui.find({ key: 'keepwarm' })
      expect(keep?.props.label).toBe('Тримати теплим')
      expect(keep?.props.dimColor).toBe(true)
      expect(await ui.find({ text: /^engine row$/ })).toBeDefined()
    })

    test('без контексту й сесії; ліміти лише від 80%', async ($, on) => {
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

      const text = (await ui.find({ key: 'parts' }))?.text ?? ''
      expect(text).toBe('● кеш теплий ще 60 хв│перекешування коштуватиме ≈ $0.86')
      expect(text).not.toContain('контекст')
      expect(text).not.toContain('сесія')
      expect(text).not.toContain('ліміти')

      await measure(84)
      const ui84 = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })
      const limits = await ui84.find({ text: /^ліміти: 5 год 84%$/ })
      expect(limits?.props.color).toBe('yellow')
      expect((await ui84.find({ key: 'cache-meter' }))?.text).not.toContain('тиждень')
    })

    test('до першого запиту смуги немає, лишається рядок рушія', async ($, on) => {
      world($, on)
      await start($)
      const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'cache-meter' })).toBeUndefined()
      expect(await ui.find({ text: /^engine row$/ })).toBeDefined()
    })

    test('під опитуванням смуга віддає місце', async ($, on) => {
      world($, on)
      await start($)
      await step($)
      const ui = await $.ui.mount({
        plugin: 'cache-meter', surface, component: 'AbovePrompt', props: { ...props, hasSurvey: true },
      })

      expect(await ui.find({ key: 'cache-meter' })).toBeUndefined()
      expect(await ui.find({ text: /^engine row$/ })).toBeDefined()
    })

    test('великий кеш остигає: «Тримати теплим» уже не тихе', async ($, on) => {
      const w = world($, on)
      await start($)
      await step($)
      await w.clk.advance(56 * MIN)
      const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ text: /^◐ кеш охолоне за/ })).toBeDefined()
      const keep = await ui.find({ key: 'keepwarm' })
      expect(keep?.props.label).toBe('Тримати теплим')
      expect(keep?.props.dimColor).toBeUndefined()
      expect(keep?.props.hotkey).toBe('k')
    })

    test('холодний великий кеш: червоне попередження про перезапис', async ($, on) => {
      const w = world($, on)
      await start($)
      await step($)
      await w.clk.advance(61 * MIN)
      const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ text: /^○ кеш охолов 1 хв тому$/ })).toBeDefined()
      // Охололий кеш тримати вже нічого
      expect(await ui.find({ key: 'keepwarm' })).toBeUndefined()
      const rewrite = await ui.find({ text: /^наступне повідомлення перекешує ≈ \$1\.60$/ })
      expect(rewrite).toBeDefined()
      expect(rewrite?.props.color).toBe('red')
    })

    test('keep warm: пінг за 8 хв до кінця кешу, смуга показує kept warm', async ($, on) => {
      const w = world($, on)
      await start($)
      await step($)
      await $.command.run({ command: 'keepwarm', ...typed })
      await w.clk.advance(51 * MIN)
      expect(w.forks.length).toBe(0)
      await w.clk.advance(2 * MIN)
      expect(w.forks.length).toBe(1)
      const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ text: /^◆ тримаю кеш теплим до \d{1,2}:\d\d, 1 пінг \$0\.0\d$/ })).toBeDefined()
      const keep = await ui.find({ key: 'keepwarm' })
      expect(keep?.props.label).toBe('Не тримати')
      // Цифри лишаються за пропозиціями next-steps
      expect(keep?.props.hotkey).toBe('k')
    })
  })
}

test('стан для інших модів: warm → cold, ціна перезапису, isBig', { plugins: [peek] }, async ($, on) => {
  const w = world($, on)
  await start($)
  expect((await state($)).kind).toBe('unknown')
  await step($)
  expect(await state($)).toEqual({ kind: 'warm', ctx: 200_010, isBig: true, rewriteUsd: 1.6, ttlMin: 60, model: 'opus-5-5' })
  await w.clk.advance(56 * MIN)
  expect((await state($)).kind).toBe('cooling')
  await w.clk.advance(5 * MIN)
  expect((await state($)).kind).toBe('cold')
})

test('/cache big піднімає поріг: isBig у стані гасне', { plugins: [peek] }, async ($, on) => {
  world($, on)
  await start($)
  await step($)
  const r = (await $.command.run({ command: 'cache', args: 'big 300k', ...typed })) as { text: string }
  expect(r.text).toContain('Питання перед відправкою в охололий кеш: увімкнено, для контексту від 300k токенів')
  expect((await state($)).isBig).toBe(false)
})

test('холодна відправка з /handoff у сесії: варіант Handoff скасовує надсилання і запускає /handoff', async ($, on) => {
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

test('холодна відправка без /handoff: варіанта немає, «Скасувати» скасовує', async ($, on) => {
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

test('холодна відправка: «Надіслати все одно» пропускає текст як є', async ($, on) => {
  const w = world($, on, { commands: ['handoff'], answer: 'Надіслати все одно' })
  await start($)
  await step($)
  await w.clk.advance(61 * MIN)
  const r = (await submit($, 'привіт')) as { text?: string; drop?: string }

  expect(w.asked.length).toBe(1)
  expect(r.drop).toBeUndefined()
  expect(r.text).toBe('привіт')
})

test('теплий кеш або малий контекст: питання немає', async ($, on) => {
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
  test(`${surface}: відмінювання і години — 2 пінги, 1 год 05 хв, перекешовано 1 раз`, async ($, on) => {
    const w = world($, on)
    await start($)
    await step($)
    await $.command.run({ command: 'keepwarm', ...typed })
    await w.clk.advance(53 * MIN)
    await w.clk.advance(53 * MIN)
    expect(w.forks.length).toBe(2)
    const kept = (await $.command.run({ command: 'cache', ...typed })) as { text: string }
    expect(kept.text).toContain('поки що 2 пінги на $')
    expect(kept.text).toContain('кеш живе 60 хв (типово)')

    await $.command.run({ command: 'keepwarm', args: 'off', ...typed })
    await w.clk.advance(125 * MIN)
    const cold = (await $.command.run({ command: 'cache', ...typed })) as { text: string }
    expect(cold.text).toMatch(/Кеш охолов 1 год \d\d хв тому/)

    // наступний запит пише весь контекст у кеш заново
    w.setRead(0)
    w.setWrite(200_000)
    await step($)
    const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })
    expect(await ui.find({ text: /^перекешовано 1 раз: \$1\.60$/ })).toBeDefined()
  })
}
