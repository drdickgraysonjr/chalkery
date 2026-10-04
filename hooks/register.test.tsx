import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Рушій під плагінами завжди щось малює над полем вводу; мод має це лишити.
const engineRow = (on: On) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="engine">engine row</Text>
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
  { label: 'Хендоф', prompt: '/handoff' },
  { label: 'Вигаданий скіл', prompt: '/nope зроби щось' },
])

// Рушій під модом: fork рахуємо й відповідаємо заданим текстом; поле вводу записуємо.
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
    test('до першої відповіді смуги немає', async ($, on) => {
      engine(on)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'ask' })).toBeUndefined()
      expect(await ui.find({ text: /engine row/ })).toBeDefined()
    })

    test('після відповіді лише кнопка, модель не питали', async ($, on) => {
      const w = engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'ask' })).toBeDefined()
      expect(await ui.find({ key: 's0' })).toBeUndefined()
      expect(w.forks.length).toBe(0)
      expect(await ui.find({ text: /engine row/ })).toBeDefined()
    })

    test('коротка відповідь кнопки не дає', async ($, on) => {
      engine(on)
      await $.turn.complete({ ...turnEnd, answer: 'Готово.' })
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'ask' })).toBeUndefined()
    })

    test('хід субагента кнопки не дає', async ($, on) => {
      engine(on)
      await $.turn.complete({ ...turnEnd, agentId: 'a1' })
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'ask' })).toBeUndefined()
    })

    test('натискання: один fork, пропозиції без вигаданого скіла, перша сірим у полі', async ($, on) => {
      const w = engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'ask' })
      expect(w.forks.length).toBe(1)
      expect(w.forks[0]).toContain('/handoff: Хендоф')
      expect((await ui.find({ key: 's0' }))?.props.label).toBe('Опублікуй сторінку')
      expect((await ui.find({ key: 's1' }))?.props.label).toBe('Хендоф')
      expect(await ui.find({ key: 's2' })).toBeUndefined()
      expect(await ui.find({ key: 'ask' })).toBeUndefined()
      expect(w.suggested).toEqual(['Опублікуй сторінку зараз'])
    })

    test('пропозиція йде в поле чернеткою, смуга ховається', async ($, on) => {
      const w = engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'ask' })
      await ui.press({ key: 's1' })
      expect(w.filled).toEqual(['/handoff'])
      expect(await ui.find({ key: 's0' })).toBeUndefined()
      expect(await ui.find({ key: 'ask' })).toBeUndefined()
    })

    test('«сховати» повертає кнопку, нового fork немає', async ($, on) => {
      const w = engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'ask' })
      await ui.press({ key: 'dismiss' })
      expect(await ui.find({ key: 's0' })).toBeUndefined()
      expect(await ui.find({ key: 'ask' })).toBeDefined()
      expect(w.forks.length).toBe(1)
    })

    test('новий хід ховає пропозиції', async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'ask' })
      await $.turn.start({ text: 'далі', turnId: 't2' })
      expect(await ui.find({ key: 's0' })).toBeUndefined()
      expect(await ui.find({ key: 'ask' })).toBeUndefined()
    })

    test('порожня відповідь моделі: тост і кнопка лишається', async ($, on) => {
      const w = engine(on, null)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      await ui.press({ key: 'ask' })
      expect(w.toasts).toEqual(['Що далі: модель відповіла порожньо'])
      expect(await ui.find({ key: 'ask' })).toBeDefined()
    })

    test('поки модель працює, смуги немає', async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({
        plugin: 'next-steps', surface, component: 'AbovePrompt', props: { ...props, isWorking: true },
      })

      expect(await ui.find({ key: 'ask' })).toBeUndefined()
    })

    test('кеш охолов: біля кнопки лише ціна натискання', { plugins: [fakeCacheMeter] }, async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      await $.command.run({
        command: 'set-cache', args: JSON.stringify({ kind: 'cold', isBig: true, rewriteUsd: 1.2 }), ...typed,
      } as never)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ text: /^ ≈ \$1\.20$/ })).toBeDefined()
      // Пояснення про кеш — у рядку cache-meter, тут його нема
      expect(await ui.find({ text: /кеш/ })).toBeUndefined()
    })

    test('кеш теплий: підказки немає', { plugins: [fakeCacheMeter] }, async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      await $.command.run({
        command: 'set-cache', args: JSON.stringify({ kind: 'warm', isBig: true, rewriteUsd: 1.2 }), ...typed,
      } as never)
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'ask' })).toBeDefined()
      expect(await ui.find({ text: /\$/ })).toBeUndefined()
    })

    test('широка смуга: пропозиції й «сховати» в одному рядку із заголовком', async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({
        plugin: 'next-steps', surface, component: 'AbovePrompt', props: { ...props, bodyColumns: 120 },
      })

      await ui.press({ key: 'ask' })
      const offer = await ui.find({ key: 'next-steps-offer' })
      expect(offer?.props.flexDirection).toBe('row')
      expect(offer?.props.columnGap).toBe(3)
      expect(offer?.text).toContain('Що далі:')
      expect(offer?.text).toContain('сховати')
      expect(await ui.find({ key: 'next-steps-head' })).toBeUndefined()
    })

    test('вузька смуга: заголовок із «сховати», пункти під ним без відступу', async ($, on) => {
      engine(on)
      await $.turn.complete(turnEnd)
      const ui = await $.ui.mount({
        plugin: 'next-steps', surface, component: 'AbovePrompt', props: { ...props, bodyColumns: 50 },
      })

      await ui.press({ key: 'ask' })
      expect((await ui.find({ key: 'next-steps-offer' }))?.props.flexDirection).toBe('column')
      const head = await ui.find({ key: 'next-steps-head' })
      expect(head?.text).toContain('Що далі:')
      expect(head?.text).toContain('сховати')
      expect((await ui.find({ key: 's0' }))?.props.label).toBe('Опублікуй сторінку')
    })
  })
}
