import { describe, expect, test } from 'claude-code/testing'

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
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      await $.session.measure(measure(179_999))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      const button = await ui.find({ key: 'handoff' })
      expect(button?.props.variant).toBeUndefined()
      expect(button?.props.dimColor).toBe(true)
      expect(await ui.find({ text: /час передавати/ })).toBeUndefined()
    })

    test('з 180k: кнопка primary і підказка з числом', async ($, on) => {
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      await $.session.measure(measure(180_000))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      const button = await ui.find({ key: 'handoff' })
      expect(button?.props.variant).toBe('primary')
      expect((await ui.find({ text: /час передавати/ }))?.text).toContain('180k')
    })

    test('натискання запускає /handoff і ховає кнопку до кінця ходу', async ($, on) => {
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
      on('tool.call', { tool: SPAWN }, () => ({ result: 'created' }))
      const ui = await $.ui.mount({ plugin: 'handoff-relay', surface, component: 'AbovePrompt', props })

      await $.tool.call({ tool: SPAWN, title: 'Прибрати мертвий код', prompt: 'p', tldr: 't' })

      expect(await ui.find({ key: 'handoff' })).toBeDefined()
    })

    test('картка після кінця ходу хендофу кнопку не прибирає', async ($, on) => {
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
  })
}
