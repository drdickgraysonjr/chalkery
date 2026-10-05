// SPDX-License-Identifier: Apache-2.0
// Modified by Yehor Hunia, 2026, from anthropics/claude-plugins-community@87c843d (next-steps).
import { describe, expect, test as kitTest } from 'claude-code/testing'
import type { On } from 'claude-code'
import en from './locales/en.mjs'
import uk from './locales/uk.mjs'

// The tests below are written against the Ukrainian text: the mod's language here is uk unless a test sets another
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const test = (name: string, ...rest: any[]) =>
  rest.length === 1
    ? kitTest(name, { options: { language: 'uk' } }, rest[0])
    : kitTest(name, { ...rest[0], options: { language: 'uk', ...rest[0].options } }, rest[1])

const ukrainianConfig = (on: On) =>
  on('config.list', () => ({ value: [{ key: 'language', label: 'Language', kind: 'text', value: 'українська', provider: { kind: 'engine' }, isLocked: false }] }) as never)

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
const fakeCacheMeterBand = {
  name: 'cache-meter',
  register: (on: On) => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      // A test plugin lives in its own environment without imports, so it merges the band itself, by the same contract
      const below = (await next(e)) as { type?: string; props?: { key?: string }; children?: unknown[] } | null
      const { Box, Text } = $.ui.resolve(e)
      const place = (row: { props?: { key?: string } }) => Number(String(row.props?.key ?? '').split(':')[1] ?? 999)
      const rows = (below?.type === 'Box' && below.props?.key === 'prompt-band'
        ? [...(below.children ?? [])]
        : below ? [Box({ key: 'prompt-band-row:999:other', flexDirection: 'column', children: [below as never] })] : []) as { props?: { key?: string } }[]
      rows.push(Box({ key: 'prompt-band-row:20:cache-meter', flexDirection: 'column', children: [Text({ children: ['cache-meter'] })] }))
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

// The engine under the plugins always draws something above the prompt; the mod must keep it.
const engineRow = (on: On) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="engine">engine row</Text>
  })
}

// A stand-in for the cache-meter mod: publishes its state the way the real one does.
const fakeCacheMeter = {
  name: 'cache-meter',
  register: (on: On) => {
    on('command.run', { command: 'set-cache' }, async ($, e) => {
      await ($.state.set as unknown as (ref: { plugin: 'cache-meter'; key: 'cache' }, v: unknown) => Promise<unknown>)(
        { plugin: 'cache-meter', key: 'cache' },
        JSON.parse(e.args),
      )
      return { text: '' }
    })
  },
}

const typed = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 100 } }

const SURFACES = ['terminal', 'desktop'] as const

const props = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const LONG = 'Готово: переписав розділ і перевірив посилання, лишилось вирішити, чи публікувати сторінку зараз.'
const turnEnd = { answer: LONG, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' as const }

const REPLY = JSON.stringify([
  { label: 'Опублікуй сторінку', prompt: 'Опублікуй сторінку зараз' },
  { label: 'хендоф', prompt: '/handoff' },
  { label: 'Вигаданий скіл', prompt: '/nope зроби щось' },
])

// The engine under the mod: count forks and answer with the given text; record the prompt box.
const engine = (on: On, reply: string | null = REPLY) => {
  const forks: string[] = []
  const filled: string[] = []
  const suggested: string[] = []
  const toasts: string[] = []
  let clock = 0
  engineRow(on)
  on('clock.now', () => ({ value: (clock += 1000) }) as never)
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('command.list', () => ({ value: [{ name: 'handoff', description: 'Хендоф', source: 'user' }] }) as never)
  on('model.fork', (_$, e) => {
    forks.push((e as { prompt: string }).prompt)
    return {
      value:
        reply === null
          ? { isAnswered: false, reason: 'empty-reply', usage: { input_tokens: 0, output_tokens: 0 } }
          : { isAnswered: true, text: reply, usage: { input_tokens: 5, output_tokens: 50 } },
    } as never
  })
  on('prompt.fill', (_$, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('prompt.suggest', (_$, e) => {
    suggested.push(e.text)
    return { isShown: true }
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  return { forks, filled, suggested, toasts }
}

for (const surface of SURFACES) {
  describe(surface, () => {
    test('no band before the first reply', async ($, on) => {
      engine(on)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'ask' })).toBeUndefined()
      expect(await ui.find({ text: /engine row/ })).toBeDefined()
    })

    test('after a reply only the button, the model was not asked', async ($, on) => {
      const w = engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'ask' })).toBeDefined()
      expect(await ui.find({ key: 's0' })).toBeUndefined()
      expect(w.forks.length).toBe(0)
      expect(await ui.find({ text: /engine row/ })).toBeDefined()
    })

    for (const order of [[fakeHandoffRelay, fakeCacheMeterBand], [fakeCacheMeterBand, fakeHandoffRelay]]) {
      test(`shared band: "What next?" below the cache, whatever order the neighbours loaded in (${order.map((p) => p.name).join(', ')})`, { plugins: order }, async ($, on) => {
        engine(on)
        await $.turn.complete(turnEnd)
        const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })
        expect(await bandKeys(ui)).toEqual(BAND_ORDER)
        // The band's rows are half a line apart, not a whole empty one
        expect((await ui.find({ key: 'prompt-band' }))?.props.rowGap).toBe(0.5)
      })
    }

    test('a short reply gives no button', async ($, on) => {
      engine(on)
      await $.turn.complete({ ...turnEnd, answer: 'Готово.' })
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'ask' })).toBeUndefined()
    })

    test('a subagent turn gives no button', async ($, on) => {
      engine(on)
      await $.turn.complete({ ...turnEnd, agentId: 'a1' })
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'ask' })).toBeUndefined()
    })

    test('a press: one fork, suggestions without a made-up skill, the first one dim in the box', async ($, on) => {
      const w = engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'ask' })
      expect(w.forks.length).toBe(1)
      expect(w.forks[0]).toContain('/handoff: Хендоф')
      expect((await ui.find({ key: 's0' }))?.props.label).toBe('Опублікуй сторінку')
      expect((await ui.find({ key: 's1' }))?.props.label).toBe('Хендоф')
      expect(await ui.find({ key: 's2' })).toBeUndefined()
      expect(w.suggested).toEqual(['Опублікуй сторінку зараз'])
    })

    test('a suggestion goes into the box as a draft, the band hides', async ($, on) => {
      const w = engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'ask' })
      await ui.press({ key: 's1' })
      expect(w.filled).toEqual(['/handoff'])
      expect(await ui.find({ key: 's0' })).toBeUndefined()
      expect(await ui.find({ key: 'ask' })).toBeUndefined()
    })

    test('hide brings the button back, no new fork', async ($, on) => {
      const w = engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'ask' })
      await ui.press({ key: 'dismiss' })
      expect(await ui.find({ key: 's0' })).toBeUndefined()
      expect(await ui.find({ key: 'ask' })).toBeDefined()
      expect(w.forks.length).toBe(1)
    })

    test('pressing "What next?" again collapses the list without a new fork', async ($, on) => {
      const w = engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'ask' })
      expect(await ui.find({ key: 's0' })).toBeDefined()
      await ui.press({ key: 'ask' })
      expect(await ui.find({ key: 's0' })).toBeUndefined()
      expect(await ui.find({ key: 'ask' })).toBeDefined()
      expect(w.forks.length).toBe(1)
    })

    test('a new turn hides the suggestions', async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'ask' })
      await $.turn.start({ text: 'далі', turnId: 't2' })
      expect(await ui.find({ key: 's0' })).toBeUndefined()
      expect(await ui.find({ key: 'ask' })).toBeUndefined()
    })

    test('an empty model reply: a toast, and the button stays', async ($, on) => {
      const w = engine(on, null)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'ask' })
      expect(w.toasts).toEqual(['Що далі: модель відповіла порожньо'])
      expect(await ui.find({ key: 'ask' })).toBeDefined()
    })

    test('no band while the model is working', async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({
        plugin: 'next-steps', surface, component: 'AbovePrompt', props: { ...props, isWorking: true },
      })

      expect(await ui.find({ key: 'ask' })).toBeUndefined()
    })

    test('cache gone cold: only the cost of the press next to the button', { plugins: [fakeCacheMeter] }, async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      await $.command.run({
        command: 'set-cache', args: JSON.stringify({ kind: 'cold', isBig: true, rewriteUsd: 1.2 }), ...typed,
      } as never)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ text: /^ ≈ \$1\.20$/ })).toBeDefined()
      // The cache explanation is in the cache-meter row, not here
      expect(await ui.find({ text: /кеш/ })).toBeUndefined()
    })

    test('cold price from cache-meter: tokens on a subscription, dollars on the API', { plugins: [fakeCacheMeter] }, async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      const cold = { kind: 'cold', isBig: true, rewriteUsd: 1.6, rewriteTokens: 200_010 }
      await $.command.run({ command: 'set-cache', args: JSON.stringify({ ...cold, unit: 'tokens' }), ...typed } as never)
      const subscription = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })
      expect(await subscription.find({ text: /^ ≈ 200k$/ })).toBeDefined()
      expect(await subscription.find({ text: /\$/ })).toBeUndefined()

      await $.command.run({ command: 'set-cache', args: JSON.stringify({ ...cold, unit: 'usd' }), ...typed } as never)
      const api = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })
      expect(await api.find({ text: /^ ≈ \$1\.60$/ })).toBeDefined()
    })

    test('cache warm: no hint', { plugins: [fakeCacheMeter] }, async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      await $.command.run({
        command: 'set-cache', args: JSON.stringify({ kind: 'warm', isBig: true, rewriteUsd: 1.2 }), ...typed,
      } as never)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'ask' })).toBeDefined()
      expect(await ui.find({ text: /\$/ })).toBeUndefined()
    })

    test('wide band: suggestions and hide on one line with the heading', async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({
        plugin: 'next-steps', surface, component: 'AbovePrompt', props: { ...props, bodyColumns: 120 },
      })

      await ui.press({ key: 'ask' })
      const offer = await ui.find({ key: 'next-steps-offer' })
      expect(offer?.props.flexDirection).toBe('row')
      expect(offer?.props.columnGap).toBe(3)
      expect(offer?.text).toContain('Що далі?')
      expect(offer?.text).toContain('Сховати')
      // The heading is the same button, not a label
      expect((await ui.find({ key: 'ask' }))?.props.label).toBe('Що далі?')
      expect(await ui.find({ key: 'next-steps-head' })).toBeUndefined()
    })

    test('narrow band: a heading with hide, the items below it without indent', async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({
        plugin: 'next-steps', surface, component: 'AbovePrompt', props: { ...props, bodyColumns: 50 },
      })

      await ui.press({ key: 'ask' })
      expect((await ui.find({ key: 'next-steps-offer' }))?.props.flexDirection).toBe('column')
      const head = await ui.find({ key: 'next-steps-head' })
      expect(head?.text).toContain('Що далі?')
      expect(head?.text).toContain('Сховати')
      expect((await ui.find({ key: 's0' }))?.props.label).toBe('Опублікуй сторінку')
    })
  })
}

for (const surface of SURFACES) {
  test(`${surface}: language en — button in English`, { options: { language: 'en' } }, async ($, on) => {
    engine(on)
    await $.turn.complete(turnEnd)
    const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })
    expect((await ui.find({ key: 'ask' }))?.props.label).toBe('What next?')
  })

  test(`${surface}: language auto without /config — English`, { options: { language: 'auto' } }, async ($, on) => {
    engine(on)
    await $.turn.complete(turnEnd)
    const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })
    expect((await ui.find({ key: 'ask' }))?.props.label).toBe('What next?')
  })

  test(`${surface}: language auto, /config language Ukrainian — Ukrainian`, { options: { language: 'auto' } }, async ($, on) => {
    engine(on)
    ukrainianConfig(on)
    await $.turn.complete(turnEnd)
    const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })
    expect((await ui.find({ key: 'ask' }))?.props.label).toBe('Що далі?')
  })
}

kitTest('translations: en and uk have the same set of keys', async () => {
  const keys = (o: object): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v).map((n) => `${k}.${n}`) : [k])).sort()
  expect(keys(uk)).toEqual(keys(en))
})
