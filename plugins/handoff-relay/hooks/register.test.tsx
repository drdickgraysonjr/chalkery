// SPDX-License-Identifier: MIT
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

// The engine under the plugins always draws something above the prompt; the mod must keep it.
const engineRow = (on: On) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
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
const setCache = ($: { command: { run: (a: never) => Promise<unknown> } }, value: object) =>
  $.command.run({ command: 'set-cache', args: JSON.stringify(value), ...typed } as never)

const SURFACES = ['terminal', 'desktop'] as const

const props = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const SPAWN = 'mcp__ccd_session__spawn_task' as const
const TITLE = 'Естафета хендофів H3'

const turnEnd = { answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' as const }

const measure = (tokens: number) => ({
  context: { tokens, window: 1_000_000 },
  rateLimits: [],
  changed: ['context' as const],
})

for (const surface of SURFACES) {
  describe(surface, () => {
    test('below the threshold: the button is dim, no hint', async ($, on) => {
      engineRow(on)
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      await $.session.measure(measure(179_999))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      const button = await ui.find({ key: 'handoff' })
      expect(button?.props.variant).toBeUndefined()
      expect(button?.props.dimColor).toBe(true)
      expect(await ui.find({ text: /час передавати/ })).toBeUndefined()
    })

    test('from 180k: the button is primary and the hint has the number', async ($, on) => {
      engineRow(on)
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      await $.session.measure(measure(180_000))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      const button = await ui.find({ key: 'handoff' })
      expect(button?.props.variant).toBe('primary')
      expect(await ui.find({ text: /^ Контекст 180k, час передавати$/ })).toBeDefined()
    })

    test('a press runs /handoff and hides the button until the turn ends', async ($, on) => {
      engineRow(on)
      const runs: string[] = []
      on('command.run', (_$, e) => {
        runs.push(e.command)
        return { text: '' }
      })
      on('turn.complete', () => ({ text: '' }))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'handoff' })
      expect(runs).toEqual(['handoff'])
      expect(await ui.find({ key: 'handoff' })).toBeUndefined()
      expect(await ui.find({ text: /пишу документ/ })).toBeDefined()
    })

    for (const [names, expected] of [
      [['handoff-relay:handoff'], 'handoff-relay:handoff'],
      [['handoff', 'handoff-relay:handoff'], 'handoff'],
    ] as const) {
      test(`commands ${names.join(', ')}: the button runs ${expected}`, async ($, on) => {
        engineRow(on)
        on('command.list', () => ({ value: names.map((name) => ({ name, description: '', source: 'skills' })) }) as never)
        const runs: string[] = []
        on('command.run', (_$, e) => {
          runs.push(e.command)
          return { text: '' }
        })
        const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })
        await ui.press({ key: 'handoff' })
        expect(runs).toEqual([expected])
      })
    }

    test('under a survey the band gives way', async ($, on) => {
      on('ui.render', ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text key="engine">опитування</Text>
      })
      const ui = await $.ui.mount({
        plugin: 'handoff-relay', surface, component: 'AbovePrompt', props: { ...props, hasSurvey: true },
      })

      expect(await ui.find({ key: 'handoff' })).toBeUndefined()
      expect(await ui.find({ text: /опитування/ })).toBeDefined()
    })
    test('a card in the handoff turn removes the button for the rest of the session', async ($, on) => {
      engineRow(on)
      on('command.run', () => ({ text: '' }))
      on('tool.call', { tool: SPAWN }, () => ({ result: 'created' }))
      on('turn.complete', () => ({ text: '' }))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'handoff' })
      await $.tool.call({ tool: SPAWN, title: TITLE, prompt: 'p', tldr: 't' })
      await $.turn.complete(turnEnd)

      expect(await ui.find({ key: 'handoff' })).toBeUndefined()
      const line = await ui.find({ key: 'handed-off' })
      expect(line?.text).toContain(`Handoff створено: ${TITLE}.`)
      expect(line?.text).toContain('Start locally')
      expect(line?.props.flexDirection).toBe('row')
    })

    test('a /handoff typed by hand hands the phase over too', async ($, on) => {
      engineRow(on)
      on('command.run', () => ({ text: '' }))
      on('tool.call', { tool: SPAWN }, () => ({ result: 'created' }))
      on('turn.complete', () => ({ text: '' }))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      await $.command.run({
        command: 'handoff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 },
      })
      await $.tool.call({ tool: SPAWN, title: TITLE, prompt: 'p', tldr: 't' })
      await $.turn.complete(turnEnd)

      expect(await ui.find({ key: 'handoff' })).toBeUndefined()
      expect(await ui.find({ text: /Handoff створено/ })).toBeDefined()
    })

    test('a card outside a handoff keeps the button', async ($, on) => {
      engineRow(on)
      on('tool.call', { tool: SPAWN }, () => ({ result: 'created' }))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      await $.tool.call({ tool: SPAWN, title: 'Прибрати мертвий код', prompt: 'p', tldr: 't' })

      expect(await ui.find({ key: 'handoff' })).toBeDefined()
    })

    test('a card after the handoff turn ended keeps the button', async ($, on) => {
      engineRow(on)
      on('command.run', () => ({ text: '' }))
      on('tool.call', { tool: SPAWN }, () => ({ result: 'created' }))
      on('turn.complete', () => ({ text: '' }))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'handoff' })
      await $.turn.complete(turnEnd)
      await $.tool.call({ tool: SPAWN, title: 'Прибрати мертвий код', prompt: 'p', tldr: 't' })

      expect(await ui.find({ key: 'handoff' })).toBeDefined()
    })

    test('a card with an error: the button comes back after the turn', async ($, on) => {
      engineRow(on)
      on('command.run', () => ({ text: '' }))
      on('tool.call', { tool: SPAWN }, () => ({ result: 'failed', isError: true }))
      on('turn.complete', () => ({ text: '' }))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'handoff' })
      await $.tool.call({ tool: SPAWN, title: TITLE, prompt: 'p', tldr: 't' })
      await $.turn.complete(turnEnd)

      expect(await ui.find({ key: 'handoff' })).toBeDefined()
      expect(await ui.find({ text: /Handoff створено/ })).toBeUndefined()
    })
    test('narrow band: the hint about the press goes on a second line', async ($, on) => {
      engineRow(on)
      on('command.run', () => ({ text: '' }))
      on('tool.call', { tool: SPAWN }, () => ({ result: 'created' }))
      on('turn.complete', () => ({ text: '' }))
      const ui = await $.ui.mount({
        plugin: 'handoff-relay', surface, component: 'AbovePrompt', props: { ...props, bodyColumns: 60 },
      })

      await ui.press({ key: 'handoff' })
      await $.tool.call({ tool: SPAWN, title: TITLE, prompt: 'p', tldr: 't' })
      await $.turn.complete(turnEnd)

      const line = await ui.find({ key: 'handed-off' })
      expect(line?.props.flexDirection).toBe('column')
      expect(line?.text).toContain('Start locally')
    })
    test('the band keeps the engine row below the button', async ($, on) => {
      engineRow(on)
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'handoff' })).toBeDefined()
      expect(await ui.find({ text: /^engine row$/ })).toBeDefined()
      // The band's rows are half a line apart, not a whole empty one
      expect((await ui.find({ key: 'prompt-band' }))?.props.rowGap).toBe(0.5)
    })

    for (const order of [[fakeCacheMeterBand, fakeNextSteps], [fakeNextSteps, fakeCacheMeterBand]]) {
      test(`shared band: Handoff on top, whatever order the neighbours loaded in (${order.map((p) => p.name).join(', ')})`, { plugins: order }, async ($, on) => {
        engineRow(on)
        const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })
        expect(await bandKeys(ui)).toEqual(BAND_ORDER)
      })
    }

    test('cache-meter: big cache cooling soon — the button is primary, the hint has no amount', { plugins: [fakeCacheMeter] }, async ($, on) => {
      engineRow(on)
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      await $.session.measure(measure(150_000))
      await setCache($ as never, { kind: 'cooling', ctx: 150_000, isBig: true, rewriteUsd: 1.2, ttlMin: 60, model: 'opus-5-5' })
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      expect((await ui.find({ key: 'handoff' }))?.props.variant).toBe('primary')
      expect(await ui.find({ text: /^ Кеш скоро охолоне: передавати зараз дешевше$/ })).toBeDefined()
      // The cache-meter row shows the amount; here it would be the third repeat
      expect(await ui.find({ text: /\$/ })).toBeUndefined()
    })

    test('cache-meter: big cache gone cold — the button is primary, the hint promises no saving', { plugins: [fakeCacheMeter] }, async ($, on) => {
      engineRow(on)
      await setCache($ as never, { kind: 'cold', ctx: 160_000, isBig: true, rewriteUsd: 1.28, ttlMin: 60, model: 'opus-5-5' })
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      expect((await ui.find({ key: 'handoff' }))?.props.variant).toBe('primary')
      expect(await ui.find({ text: /^ Кеш охолов: хендоф коштуватиме як звичайне повідомлення$/ })).toBeDefined()
      expect(await ui.find({ text: /\$/ })).toBeUndefined()
      expect(await ui.find({ text: /дешевше/ })).toBeUndefined()
    })

    test('cache-meter: warm cache or small context — the button is dim', { plugins: [fakeCacheMeter] }, async ($, on) => {
      engineRow(on)
      await setCache($ as never, { kind: 'warm', ctx: 160_000, isBig: true, rewriteUsd: 1.28, ttlMin: 60, model: 'opus-5-5' })
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })
      expect((await ui.find({ key: 'handoff' }))?.props.variant).toBeUndefined()

      await setCache($ as never, { kind: 'cold', ctx: 40_000, isBig: false, rewriteUsd: 0.32, ttlMin: 60, model: 'opus-5-5' })
      expect((await ui.find({ key: 'handoff' }))?.props.variant).toBeUndefined()
      expect(await ui.find({ text: /кеш/ })).toBeUndefined()
    })
  })
}

for (const surface of SURFACES) {
  test(`${surface}: language en — hint in English`, { options: { language: 'en' } }, async ($, on) => {
    engineRow(on)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure(measure(180_000))
    const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })
    expect(await ui.find({ text: /^ Context 180k, time to hand off$/ })).toBeDefined()
  })

  test(`${surface}: language auto without /config — English`, { options: { language: 'auto' } }, async ($, on) => {
    engineRow(on)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure(measure(180_000))
    const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })
    expect(await ui.find({ text: /^ Context 180k, time to hand off$/ })).toBeDefined()
  })

  test(`${surface}: language auto, /config language Ukrainian — Ukrainian`, { options: { language: 'auto' } }, async ($, on) => {
    engineRow(on)
    ukrainianConfig(on)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure(measure(180_000))
    const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })
    expect(await ui.find({ text: /^ Контекст 180k, час передавати$/ })).toBeDefined()
  })
}

kitTest('translations: en and uk have the same set of keys', async () => {
  expect(Object.keys(uk).sort()).toEqual(Object.keys(en).sort())
})

// A handoff without a card (the terminal, any /handoff): the written .md is the signal.
const DOC = '/vault/wiki/synthesis/handoffs/Chalkery repository review — H4.md'
const written = (file_path: string) => ({
  result: { type: 'create', filePath: file_path, content: '# h', structuredPatch: [], originalFile: null },
})
const writeDoc = ($: { tool: { call: (a: never) => Promise<unknown> } }, file_path = DOC) =>
  $.tool.call({ tool: 'Write', file_path, content: '# h' } as never)

for (const surface of SURFACES) {
  describe(surface, () => {
    test('file: a .md written in the handoff turn hands off once the turn answers', async ($, on) => {
      engineRow(on)
      on('command.run', () => ({ text: '' }))
      on('tool.call', { tool: 'Write' }, (_$, e) => written(e.file_path) as never)
      on('turn.complete', () => ({ text: '' }))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'handoff' })
      await writeDoc($ as never)
      // Not yet: the turn may still stop on a question
      expect(await ui.find({ text: /Handoff створено/ })).toBeUndefined()
      await $.turn.complete(turnEnd)

      expect(await ui.find({ key: 'handoff' })).toBeUndefined()
      const line = await ui.find({ key: 'handed-off' })
      expect(line?.text).toContain('Handoff створено: Chalkery repository review — H4.')
      expect(line?.text).toContain('Продовжуй у новій сесії')
      expect(line?.text).not.toContain('Start locally')
    })
  })
}

describe('terminal', () => {
  const surface = 'terminal' as const
  const world = (on: On, write: (file_path: string) => unknown = written) => {
    engineRow(on)
    on('command.run', () => ({ text: '' }))
    on('tool.call', { tool: 'Write' }, (_$, e) => write(e.file_path) as never)
    on('tool.call', { tool: 'Edit' }, (_$, e) => ({
      result: { filePath: e.file_path, oldString: 'a', newString: 'b', originalFile: 'a', structuredPatch: [], userModified: false, replaceAll: false },
    }) as never)
    on('tool.call', { tool: 'Skill' }, () => ({ result: { success: true, commandName: 'handoff' } }) as never)
    on('tool.call', { tool: SPAWN }, () => ({ result: 'created' }))
    on('turn.complete', () => ({ text: '' }))
  }
  const mount = ($: { ui: { mount: (a: never) => Promise<unknown> } }) =>
    $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props } as never) as Promise<{
      find: (q: object) => Promise<{ text?: string } | undefined>
      press: (q: object) => Promise<void>
    }>

  test('file: a turn that ends without an answer does not hand off', async ($, on) => {
    world(on)
    const ui = await mount($ as never)
    for (const reason of ['aborted', 'error'] as const) {
      await ui.press({ key: 'handoff' })
      await writeDoc($ as never)
      await $.turn.complete({ ...turnEnd, reason, isAborted: reason === 'aborted' })
      expect(await ui.find({ key: 'handoff' })).toBeDefined()
    }
    // What was written in an aborted turn does not carry over into the next one
    await ui.press({ key: 'handoff' })
    await $.turn.complete(turnEnd)
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
  })

  test('file: no .md written, no handoff', async ($, on) => {
    world(on)
    const ui = await mount($ as never)
    await ui.press({ key: 'handoff' })
    await writeDoc($ as never, '/repo/notes.txt')
    await $.turn.complete(turnEnd)
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
    expect(await ui.find({ text: /Handoff створено/ })).toBeUndefined()
  })

  test('file: a failed write does not count', async ($, on) => {
    world(on, () => ({ result: 'EACCES', isError: true }))
    const ui = await mount($ as never)
    await ui.press({ key: 'handoff' })
    await writeDoc($ as never)
    await $.turn.complete(turnEnd)
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
  })

  test('file: a write held for review does not count', async ($, on) => {
    world(on, (file_path) => ({ result: { ...written(file_path).result, staged: true } }))
    const ui = await mount($ as never)
    await ui.press({ key: 'handoff' })
    await writeDoc($ as never)
    await $.turn.complete(turnEnd)
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
  })

  test('file: an edited .md alone does not count', async ($, on) => {
    world(on)
    const ui = await mount($ as never)
    await ui.press({ key: 'handoff' })
    await $.tool.call({ tool: 'Edit', file_path: DOC, old_string: 'a', new_string: 'b' } as never)
    await $.turn.complete(turnEnd)
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
  })

  test('file: a .md written outside a handoff turn does not count', async ($, on) => {
    world(on)
    const ui = await mount($ as never)
    await writeDoc($ as never)
    await $.turn.complete(turnEnd)
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
    expect(await ui.find({ text: /Handoff створено/ })).toBeUndefined()
  })

  test("file: the card's title wins over the file name", async ($, on) => {
    world(on)
    const ui = await mount($ as never)
    await ui.press({ key: 'handoff' })
    await writeDoc($ as never)
    await $.tool.call({ tool: SPAWN, title: TITLE, prompt: 'p', tldr: 't' })
    await $.turn.complete(turnEnd)
    const line = await ui.find({ key: 'handed-off' })
    expect(line?.text).toContain(`Handoff створено: ${TITLE}.`)
    expect(line?.text).toContain('Start locally')
  })

  test('file: the handoff skill called by the model opens a handoff turn', async ($, on) => {
    world(on)
    const ui = await mount($ as never)
    // Another skill opens nothing
    await $.tool.call({ tool: 'Skill', skill: 'grill-me' } as never)
    await writeDoc($ as never)
    await $.turn.complete(turnEnd)
    expect(await ui.find({ key: 'handoff' })).toBeDefined()

    // A .md written earlier in the turn, before the skill, is not the handoff document
    await writeDoc($ as never, '/repo/plan.md')
    await $.tool.call({ tool: 'Skill', skill: 'handoff-relay:handoff' } as never)
    await writeDoc($ as never)
    await $.turn.complete(turnEnd)
    expect(await ui.find({ text: /Handoff створено: Chalkery repository review — H4\./ })).toBeDefined()
  })
})

// The threshold option moves where the button lights up.
for (const surface of SURFACES) {
  describe(surface, () => {
    test('threshold: 120000 lights the button from 120k', { options: { threshold: 120_000 } }, async ($, on) => {
      engineRow(on)
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      await $.session.measure(measure(120_000))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })
      expect((await ui.find({ key: 'handoff' }))?.props.variant).toBe('primary')
      expect(await ui.find({ text: /^ Контекст 120k, час передавати$/ })).toBeDefined()
    })

    test('threshold: 120000 keeps the button quiet below 120k', { options: { threshold: 120_000 } }, async ($, on) => {
      engineRow(on)
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      await $.session.measure(measure(119_999))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })
      expect((await ui.find({ key: 'handoff' }))?.props.variant).toBeUndefined()
    })

    for (const threshold of [0, -5]) {
      test(`threshold: zero or negative falls back to 180k (${threshold})`, { options: { threshold } }, async ($, on) => {
        engineRow(on)
        on('session.measure', (_$, e) => ({ changed: e.changed }))
        await $.session.measure(measure(179_999))
        const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })
        expect((await ui.find({ key: 'handoff' }))?.props.variant).toBeUndefined()
        await $.session.measure(measure(180_000))
        expect((await ui.find({ key: 'handoff' }))?.props.variant).toBe('primary')
      })
    }
  })
}

// A handoff the button did not start shows the pending line too, and the button is back after the turn.
for (const surface of SURFACES) {
  describe(surface, () => {
    test('pending: a typed /handoff shows the pending line until the turn ends', async ($, on) => {
      engineRow(on)
      on('command.run', () => ({ text: '' }))
      on('turn.complete', () => ({ text: '' }))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      await $.command.run({ command: 'handoff', args: '', ...typed } as never)
      expect(await ui.find({ key: 'handoff' })).toBeUndefined()
      expect(await ui.find({ text: /^Handoff: пишу документ…$/ })).toBeDefined()

      await $.turn.complete(turnEnd)
      expect(await ui.find({ key: 'handoff' })).toBeDefined()
    })

    test('pending: a handoff skill called by the model shows the pending line', async ($, on) => {
      engineRow(on)
      on('tool.call', { tool: 'Skill' }, () => ({ result: { success: true, commandName: 'handoff' } }) as never)
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      await $.tool.call({ tool: 'Skill', skill: 'grill-me' } as never)
      expect(await ui.find({ key: 'handoff' })).toBeDefined()
      await $.tool.call({ tool: 'Skill', skill: 'handoff' } as never)
      expect(await ui.find({ key: 'handoff' })).toBeUndefined()
      expect(await ui.find({ text: /^Handoff: пишу документ…$/ })).toBeDefined()
    })
  })
}
