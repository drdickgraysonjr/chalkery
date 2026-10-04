import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { Tokens } from '../types'

// Поріг, з якого кнопка підсвічується. Рахуємо в токенах, не у відсотках:
// вікно моделі буває різним, а сесія стає важкою приблизно з однієї й тієї ж позначки.
const THRESHOLD = 180_000

// 'run' запускає /handoff одразу; 'fill' лише вставляє його в поле вводу, а Enter натискає людина.
const MODE = 'run' as 'run' | 'fill'

// Картка сама сесію не запускає: людина тисне кнопку на ній.
const LAUNCH_HINT = 'Запускай через Start locally або іншу кнопку на картці.'

const tokens = atom({ plugin: 'handoff-relay', key: 'tokens' } as const, null as Tokens)
const isPending = atom({ plugin: 'handoff-relay', key: 'isPending' } as const, false)
const isHandoffTurn = atom({ plugin: 'handoff-relay', key: 'isHandoffTurn' } as const, false)
const handedOff = atom({ plugin: 'handoff-relay', key: 'handedOff' } as const, null as string | null)

const markHandedOff: Hook<'tool.call'> = async ($, e, next) => {
  const result = await next(e)
  const isCreated = result.deny === undefined && result.isError !== true

  if (isCreated && (await read($, isHandoffTurn))) {
    const title = (e as { title?: unknown }).title
    await update($, handedOff, () => (typeof title === 'string' && title ? title : 'наступна фаза'))
  }

  return result
}

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

  // /handoff, набраний вручну, відкриває хід хендофу так само, як кнопка.
  on('command.run', { command: 'handoff' }, async ($, e, next) => {
    await update($, isHandoffTurn, () => true)

    return next(e)
  })

  // Картка наступної фази створена в ході хендофу: фазу передано, повторне натискання
  // перезаписало б щойно написаний хендоф і дало б другу картку.
  // start_session — на випадок, коли його ввімкнуть акаунту замість картки.
  on('tool.call', { tool: 'mcp__ccd_session__spawn_task' }, markHandedOff)
  on('tool.call', { tool: 'mcp__ccd_session_mgmt__start_session' }, markHandedOff)

  // Хід завершився: кнопка знову активна, якщо фазу ще не передано. Ходи субагентів не рахуємо.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isPending, () => false)
      await update($, isHandoffTurn, () => false)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const used = await read($, tokens)
    const pending = await read($, isPending)
    const done = await read($, handedOff)
    const isHeavy = used !== null && used >= THRESHOLD

    if (done !== null) {
      // Одним рядком, якщо влазить; інакше підказка йде другим рядком, а не рветься посеред слова.
      const head = `Handoff створено: ${done}.`
      const isOneLine = head.length + 1 + LAUNCH_HINT.length <= e.props.bodyColumns

      return (
        <Box key="handed-off" flexDirection={isOneLine ? 'row' : 'column'}>
          <Text>
            <Text dimColor>Handoff створено: </Text>
            <Text bold>{done}</Text>
            <Text dimColor>.</Text>
          </Text>
          <Text dimColor wrap="wrap">
            {isOneLine ? ' ' : ''}
            {LAUNCH_HINT}
          </Text>
        </Box>
      )
    }

    if (pending) {
      return (
        <Box>
          <Text dimColor>Handoff: пишу документ і картку наступної фази…</Text>
        </Box>
      )
    }

    const press = async () => {
      if ((await read($, isPending)) || (await read($, handedOff)) !== null) {
        return
      }

      await update($, isPending, () => true)

      if (MODE === 'fill') {
        await $.prompt.fill({ text: '/handoff' })
        await update($, isPending, () => false)
        return
      }

      // Власний $.command.run плагіна не проходить через його ж хук command.run, тому позначаємо хід тут.
      await update($, isHandoffTurn, () => true)

      try {
        await $.command.run({ command: 'handoff' })
      } catch (error) {
        await update($, isPending, () => false)
        await update($, isHandoffTurn, () => false)
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
