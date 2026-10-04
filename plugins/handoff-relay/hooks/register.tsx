import { joinBand } from './band.mjs'
import { isLanguageKey, resolveLanguage } from './i18n.mjs'
import en from './locales/en.mjs'
import uk from './locales/uk.mjs'
import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { CacheMeterView, Tokens } from '../types'

// Поріг, з якого кнопка підсвічується. Рахуємо в токенах, не у відсотках:
// вікно моделі буває різним, а сесія стає важкою приблизно з однієї й тієї ж позначки.
const THRESHOLD = 180_000

// 'run' запускає /handoff одразу; 'fill' лише вставляє його в поле вводу, а Enter натискає людина.
const MODE = 'run' as 'run' | 'fill'

// Стан мода cache-meter, якщо його встановлено. Мод без нього працює: значення просто немає.
const cacheMeter = { plugin: 'cache-meter', key: 'cache' } as const
type Engine = Parameters<Hook<'ui.render'>>[0]

// Написи мовою, яку обирає опція language (auto: мова відповідей Claude з /config).
const LOCALES = { en, uk }
let L = en
let language: unknown = 'auto'
let isLanguagePicked = false
const pickLanguage = async ($: Engine) => {
  isLanguagePicked = true
  let rows: readonly { key: string; value: unknown }[] = []
  if (language !== 'en' && language !== 'uk') {
    try {
      rows = await $.config.list()
    } catch {
      rows = [] // /config тут немає (тест, запуск -p): англійська
    }
  }
  L = LOCALES[resolveLanguage(language, rows)]
}
// Чужий ключ не типізований у нашому контракті, тому приводимо сигнатуру на місці виклику.
type GetCacheMeter = (ref: typeof cacheMeter) => Promise<{ value?: CacheMeterView }>
const readCacheMeter = async ($: Engine): Promise<CacheMeterView | null> => {
  try {
    return (await ($.state.get as unknown as GetCacheMeter)(cacheMeter)).value ?? null
  } catch {
    return null
  }
}

// Свій /handoff людини має перевагу; інакше скіл, що йде з цим модом. Скіл плагіна рушій
// може назвати з префіксом (handoff-relay:handoff), тож шукаємо обидві назви.
const HANDOFF_NAMES = ['handoff', 'handoff-relay:handoff']
const handoffCommand = async ($: Engine): Promise<string> => {
  try {
    const names = (await $.command.list()).map(command => command.name)
    return names.includes('handoff') ? 'handoff' : (names.find(name => name.endsWith(':handoff')) ?? 'handoff')
  } catch {
    return 'handoff'
  }
}

const tokens = atom({ plugin: 'handoff-relay', key: 'tokens' } as const, null as Tokens)
const isPending = atom({ plugin: 'handoff-relay', key: 'isPending' } as const, false)
const isHandoffTurn = atom({ plugin: 'handoff-relay', key: 'isHandoffTurn' } as const, false)
const handedOff = atom({ plugin: 'handoff-relay', key: 'handedOff' } as const, null as string | null)

// Спільне для обох інструментів-карток; хук кожного типізований своїм інструментом.
const markHandedOff = async ($: Engine, title: unknown, result: { deny?: unknown; isError?: boolean }) => {
  const isCreated = result.deny === undefined && result.isError !== true

  if (isCreated && (await read($, isHandoffTurn))) {
    await update($, handedOff, () => (typeof title === 'string' && title ? title : L.nextPhase))
  }
}

export const register: Register = (on, options) => {
  language = options.language
  if (language === 'en' || language === 'uk') L = LOCALES[language]

  on('session.start', async ($, e, next) => {
    await pickLanguage($)
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

  // Мову Claude змінили в /config: під auto мод іде за нею.
  on('config.set', async ($, e, next) => {
    const result = await next(e)
    if (isLanguageKey(e.key)) {
      await pickLanguage($)
      $.ui.invalidate('ui.render')
    }
    return result
  })

  // /handoff, набраний вручну, відкриває хід хендофу так само, як кнопка.
  on('command.run', { command: HANDOFF_NAMES }, async ($, e, next) => {
    await update($, isHandoffTurn, () => true)

    return next(e)
  })

  // Картка наступної фази створена в ході хендофу: фазу передано, повторне натискання
  // перезаписало б щойно написаний хендоф і дало б другу картку.
  // start_session — на випадок, коли його ввімкнуть акаунту замість картки.
  on('tool.call', { tool: 'mcp__ccd_session__spawn_task' }, async ($, e, next) => {
    const result = await next(e)
    await markHandedOff($, e.title, result)
    return result
  })
  on('tool.call', { tool: 'mcp__ccd_session_mgmt__start_session' }, async ($, e, next) => {
    const result = await next(e)
    await markHandedOff($, e.title, result)
    return result
  })

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

    // Те, що малюють моди під нами (наприклад, смуга cache-meter), лишається в смузі.
    const below = await next(e)
    if (!isLanguagePicked) await pickLanguage($)
    const { Box, Button, Text } = $.ui.resolve(e)
    const used = await read($, tokens)
    const pending = await read($, isPending)
    const done = await read($, handedOff)
    const cache = await readCacheMeter($)
    // Хендоф сам читає весь контекст: поки кеш теплий, це дешево, після — один перезапис.
    // Суму показує рядок cache-meter; тут лише що вона означає для хендофу.
    const coldHint =
      cache?.isBig && cache.kind === 'cooling'
        ? L.cooling
        : cache?.kind === 'cold' && cache.isBig
          ? L.cold
          : null
    const isHeavy = (used !== null && used >= THRESHOLD) || coldHint !== null

    let mine

    if (done !== null) {
      // Одним рядком, якщо влазить; інакше підказка йде другим рядком, а не рветься посеред слова.
      const head = `${L.created}${done}.`
      const isOneLine = head.length + 1 + L.launchHint.length <= e.props.bodyColumns

      mine = (
        <Box key="handed-off" flexDirection={isOneLine ? 'row' : 'column'}>
          <Text>
            <Text dimColor>{L.created}</Text>
            <Text bold>{done}</Text>
            <Text dimColor>.</Text>
          </Text>
          <Text dimColor wrap="wrap">
            {isOneLine ? ' ' : ''}
            {L.launchHint}
          </Text>
        </Box>
      )
    } else if (pending) {
      mine = (
        <Box key="handoff-pending">
          <Text dimColor>{L.pending}</Text>
        </Box>
      )
    } else {
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
          await $.command.run({ command: await handoffCommand($) })
        } catch (error) {
          await update($, isPending, () => false)
          await update($, isHandoffTurn, () => false)
          $.ui.toast(L.failed(String(error)))
        }
      }

      const hint = coldHint ?? (isHeavy ? L.heavy(Math.round((used ?? 0) / 1000)) : null)

      mine = (
        <Box key="handoff-row">
          <Button
            key="handoff"
            label={L.button}
            variant={isHeavy ? 'primary' : undefined}
            dimColor={!isHeavy}
            onPress={press}
          />
          {hint !== null ? <Text dimColor>{hint}</Text> : null}
        </Box>
      )
    }

    // Своє місце в спільній смузі модів цього репо, хоч би в якому порядку їх завантажено.
    return joinBand(Box, 'handoff-relay', mine, below)
  })
}
