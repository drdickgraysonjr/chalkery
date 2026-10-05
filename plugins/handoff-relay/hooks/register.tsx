import { joinBand } from './band.mjs'
import { isLanguageKey, resolveLanguage } from './i18n.mjs'
import en from './locales/en.mjs'
import uk from './locales/uk.mjs'
import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { CacheMeterView, HandedOff, Tokens } from '../types'

// Where the button lights up unless the threshold option says otherwise. Counted in tokens, not
// percent: model windows differ, while a session grows heavy at roughly the same mark.
const DEFAULT_THRESHOLD = 180_000
const thresholdOf = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : DEFAULT_THRESHOLD

// 'run' runs /handoff at once; 'fill' only puts it into the prompt and the person presses Enter.
const MODE = 'run' as 'run' | 'fill'

// cache-meter's state when that mod is installed. This mod works without it: the value is just absent.
const cacheMeter = { plugin: 'cache-meter', key: 'cache' } as const
type Engine = Parameters<Hook<'ui.render'>>[0]

// Text in the language the language option picks (auto: Claude's response language from /config).
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
      rows = [] // no /config here (a test, a -p run): English
    }
  }
  L = LOCALES[resolveLanguage(language, rows)]
}
// Another mod's key is not in our contract, so the signature is cast where it is called.
type GetCacheMeter = (ref: typeof cacheMeter) => Promise<{ value?: CacheMeterView }>
const readCacheMeter = async ($: Engine): Promise<CacheMeterView | null> => {
  try {
    return (await ($.state.get as unknown as GetCacheMeter)(cacheMeter)).value ?? null
  } catch {
    return null
  }
}

// The person's own /handoff wins; otherwise the skill this mod brings. The engine may name a
// plugin's skill with a prefix (handoff-relay:handoff), so any `<plugin>:handoff` counts.
const isHandoffName = (name: string) => name === 'handoff' || name.endsWith(':handoff')
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
const writtenDoc = atom({ plugin: 'handoff-relay', key: 'writtenDoc' } as const, null as string | null)
const handedOff = atom({ plugin: 'handoff-relay', key: 'handedOff' } as const, null as HandedOff)

const isDone = (result: { deny?: unknown; isError?: boolean }) => result.deny === undefined && result.isError !== true

// Shared by both card tools; each hook is typed by its own tool.
const markHandedOff = async ($: Engine, title: unknown, result: { deny?: unknown; isError?: boolean }) => {
  if (isDone(result) && (await read($, isHandoffTurn))) {
    await update($, handedOff, () => ({ title: typeof title === 'string' && title ? title : L.nextPhase, hasCard: true }))
  }
}

// The document's name for the band: the file name without its folder and `.md`.
const docTitle = (path: string) => path.split(/[\\/]/).pop()!.replace(/\.md$/i, '')

export const register: Register = (on, options) => {
  language = options.language
  const threshold = thresholdOf(options.threshold)
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

  // Claude's language changed in /config: under auto the mod follows it.
  on('config.set', async ($, e, next) => {
    const result = await next(e)
    if (isLanguageKey(e.key)) {
      await pickLanguage($)
      $.ui.invalidate('ui.render')
    }
    return result
  })

  // A /handoff typed by hand opens a handoff turn just as the button does.
  on('command.run', async ($, e, next) => {
    if (isHandoffName(e.command)) await update($, isHandoffTurn, () => true)

    return next(e)
  })

  // So does the handoff skill when the model calls it ("write a handoff").
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (isHandoffName(e.skill)) await update($, isHandoffTurn, () => true)

    return next(e)
  })

  // A .md file written during the handoff turn is the document. It counts once the turn ends with
  // an answer: a turn that stopped on a question or an error has not handed anything off.
  // This is the signal that works with any /handoff and in the terminal, where there is no card.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const result = await next(e)
    // A write held for review (staged) left the file unchanged.
    const isWritten = isDone(result) && (result.result as { staged?: boolean } | undefined)?.staged !== true
    if (isWritten && /\.md$/i.test(e.file_path) && (await read($, isHandoffTurn)) && (await read($, writtenDoc)) === null) {
      await update($, writtenDoc, () => docTitle(e.file_path))
    }
    return result
  })

  // The next phase's card created during the handoff turn (the desktop app) hands off at once, under
  // the card's title: pressing again would overwrite the document just written and make a second card.
  // start_session is there for when an account gets it instead of the card.
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

  // The turn ended: the button is back unless the phase was handed off. Subagent turns do not count.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const doc = await read($, writtenDoc)
      if (e.reason === 'answer' && doc !== null && (await read($, isHandoffTurn))) {
        await update($, handedOff, (current) => current ?? { title: doc, hasCard: false })
      }
      await update($, writtenDoc, () => null)
      await update($, isPending, () => false)
      await update($, isHandoffTurn, () => false)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    // Whatever the mods beneath draw (cache-meter's row, say) stays in the band.
    const below = await next(e)
    if (!isLanguagePicked) await pickLanguage($)
    const { Box, Button, Text } = $.ui.resolve(e)
    const used = await read($, tokens)
    const pending = await read($, isPending)
    // Up to 0.2.0 this value was the card's title alone; a hot reload mid-session keeps it.
    const stored = (await read($, handedOff)) as HandedOff | string
    const done = typeof stored === 'string' ? { title: stored, hasCard: true } : stored
    const cache = await readCacheMeter($)
    // The handoff reads the whole context: cheap while the cache is warm, one rewrite after.
    // cache-meter's row shows the amount; here only what it means for the handoff.
    const coldHint =
      cache?.isBig && cache.kind === 'cooling'
        ? L.cooling
        : cache?.kind === 'cold' && cache.isBig
          ? L.cold
          : null
    const isHeavy = (used !== null && used >= threshold) || coldHint !== null

    let mine

    if (done !== null) {
      // On one line when it fits; otherwise the hint goes to a second line rather than breaking mid-word.
      const hint = done.hasCard ? L.launchHint : L.continueHint
      const head = `${L.created}${done.title}.`
      const isOneLine = head.length + 1 + hint.length <= e.props.bodyColumns

      mine = (
        <Box key="handed-off" flexDirection={isOneLine ? 'row' : 'column'}>
          <Text>
            <Text dimColor>{L.created}</Text>
            <Text bold>{done.title}</Text>
            <Text dimColor>.</Text>
          </Text>
          <Text dimColor wrap="wrap">
            {isOneLine ? ' ' : ''}
            {hint}
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

        // The plugin's own $.command.run skips its own command.run hook, so the turn is marked here.
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

    // Our place in the band this repo's mods share, whatever order they loaded in.
    return joinBand(Box, 'handoff-relay', mine, below)
  })
}
