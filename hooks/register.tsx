import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Tokens } from '../types'

// Поріг, з якого кнопка підсвічується. Рахуємо в токенах, не у відсотках:
// вікно моделі буває різним, а сесія стає важкою приблизно з однієї й тієї ж позначки.
const THRESHOLD = 180_000

// 'run' запускає /handoff одразу; 'fill' лише вставляє його в поле вводу, а Enter натискає людина.
const MODE: 'run' | 'fill' = 'run'

const tokens = atom({ plugin: 'handoff-relay', key: 'tokens' } as const, null as Tokens)
const isPending = atom({ plugin: 'handoff-relay', key: 'isPending' } as const, false)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    await update($, tokens, () => usage.context.tokens ?? null)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, tokens, () => e.context.tokens ?? null)
    }

    return next(e)
  })

  // Хендоф дописано, коли хід завершився: кнопка знову активна.
  on('turn.complete', async ($, e, next) => {
    await update($, isPending, () => false)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const used = await read($, tokens)
    const pending = await read($, isPending)
    const isHeavy = used !== null && used >= THRESHOLD

    if (pending) {
      return (
        <Box>
          <Text dimColor>Handoff: пишу документ і картку наступної фази…</Text>
        </Box>
      )
    }

    const press = async () => {
      await update($, isPending, () => true)

      if (MODE === 'fill') {
        await $.prompt.fill({ text: '/handoff' })
        await update($, isPending, () => false)
        return
      }

      try {
        await $.command.run({ command: 'handoff' })
      } catch (error) {
        await update($, isPending, () => false)
        $.ui.toast(`Handoff не запустився: ${String(error)}`)
      }
    }

    return (
      <Box>
        <Button
          key="handoff"
          label="Handoff"
          variant={isHeavy ? 'primary' : undefined}
          dimColor={!isHeavy}
          onPress={press}
        />
        {isHeavy ? (
          <Text dimColor>
            {' '}контекст {Math.round((used ?? 0) / 1000)}k, час передавати
          </Text>
        ) : null}
      </Box>
    )
  })
}
