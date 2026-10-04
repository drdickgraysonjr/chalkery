import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Рушій під плагінами завжди щось малює над полем вводу; мод має це лишити.
const engineRow = (on: On) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
}

// Замінник мода cache-meter: публікує його стан так, як це робить справжній.
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
    test('нижче порогу: кнопка тиха, без підказки', async ($, on) => {
      engineRow(on)
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      await $.session.measure(measure(179_999))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      const button = await ui.find({ key: 'handoff' })
      expect(button?.props.variant).toBeUndefined()
      expect(button?.props.dimColor).toBe(true)
      expect(await ui.find({ text: /час передавати/ })).toBeUndefined()
    })

    test('з 180k: кнопка primary і підказка з числом', async ($, on) => {
      engineRow(on)
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      await $.session.measure(measure(180_000))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      const button = await ui.find({ key: 'handoff' })
      expect(button?.props.variant).toBe('primary')
      expect((await ui.find({ text: /час передавати/ }))?.text).toContain('180k')
    })

    test('натискання запускає /handoff і ховає кнопку до кінця ходу', async ($, on) => {
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

    test('під опитуванням смуга віддає місце', async ($, on) => {
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
    test('картка в ході хендофу прибирає кнопку до кінця сесії', async ($, on) => {
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

    test('/handoff, набраний вручну, теж передає фазу', async ($, on) => {
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

    test('картка поза хендофом кнопку не прибирає', async ($, on) => {
      engineRow(on)
      on('tool.call', { tool: SPAWN }, () => ({ result: 'created' }))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      await $.tool.call({ tool: SPAWN, title: 'Прибрати мертвий код', prompt: 'p', tldr: 't' })

      expect(await ui.find({ key: 'handoff' })).toBeDefined()
    })

    test('картка після кінця ходу хендофу кнопку не прибирає', async ($, on) => {
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

    test('картка з помилкою: після ходу кнопка повертається', async ($, on) => {
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
    test('вузька смуга: підказка про запуск іде другим рядком', async ($, on) => {
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
    test('смуга лишає рядок рушія під кнопкою', async ($, on) => {
      engineRow(on)
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'handoff' })).toBeDefined()
      expect(await ui.find({ text: /^engine row$/ })).toBeDefined()
      // Рядки смуги розсунуто на пів рядка, не на цілий порожній
      expect((await ui.find({ key: 'handoff-stack' }))?.props.rowGap).toBe(0.5)
    })

    test('cache-meter: великий кеш скоро охолоне — кнопка primary, підказка без суми', { plugins: [fakeCacheMeter] }, async ($, on) => {
      engineRow(on)
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      await $.session.measure(measure(150_000))
      await setCache($ as never, { kind: 'cooling', ctx: 150_000, isBig: true, rewriteUsd: 1.2, ttlMin: 60, model: 'opus-5-5' })
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      expect((await ui.find({ key: 'handoff' }))?.props.variant).toBe('primary')
      expect(await ui.find({ text: /^ кеш скоро охолоне: передавати зараз дешевше$/ })).toBeDefined()
      // Суму показує рядок cache-meter, тут вона була б третім повтором
      expect(await ui.find({ text: /\$/ })).toBeUndefined()
    })

    test('cache-meter: великий кеш охолов — кнопка primary, підказка без обіцянки економії', { plugins: [fakeCacheMeter] }, async ($, on) => {
      engineRow(on)
      await setCache($ as never, { kind: 'cold', ctx: 160_000, isBig: true, rewriteUsd: 1.28, ttlMin: 60, model: 'opus-5-5' })
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      expect((await ui.find({ key: 'handoff' }))?.props.variant).toBe('primary')
      expect(await ui.find({ text: /^ кеш охолов: хендоф коштуватиме як звичайне повідомлення$/ })).toBeDefined()
      expect(await ui.find({ text: /\$/ })).toBeUndefined()
      expect(await ui.find({ text: /дешевше/ })).toBeUndefined()
    })

    test('cache-meter: теплий кеш або малий контекст — кнопка тиха', { plugins: [fakeCacheMeter] }, async ($, on) => {
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
