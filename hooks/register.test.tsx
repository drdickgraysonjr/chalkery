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
      on('turn.complete', () => ({}))
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
  })
}
