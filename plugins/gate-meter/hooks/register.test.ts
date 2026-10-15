// SPDX-License-Identifier: MIT
import { describe, expect, mock, test as kitTest } from 'claude-code/testing'
import type { On } from 'claude-code'
import en from './locales/en.mjs'
import uk from './locales/uk.mjs'

// The tests below are written against the Ukrainian text: the mod's language here is uk unless a test sets another
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const test = (name: string, ...rest: any[]) =>
  rest.length === 1
    ? kitTest(name, { options: { language: 'uk' } }, rest[0])
    : kitTest(name, { ...rest[0], options: { language: 'uk', ...rest[0].options } }, rest[1])

// The repo's neighbouring mods: each puts its row into the shared band the same way the real one does.
const fakeHandoffRelay = {
  name: 'handoff-relay',
  register: (on: On) => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      // A test plugin lives in its own environment without imports or closures, so it merges the band itself, by the same contract
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
const fakeCacheMeter = {
  name: 'cache-meter',
  register: (on: On) => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      // A test plugin lives in its own environment without imports or closures, so it merges the band itself, by the same contract
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
      // A test plugin lives in its own environment without imports or closures, so it merges the band itself, by the same contract
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

const SURFACES = ['terminal', 'desktop'] as const
const SESSION = 'session-1'
const ROOT = '/w'
const HOME = '/h'
const CHECKER = '/h/.claude/skills/unlazy/scripts/gate-check.mjs'
const SCOPE_DIR = `${ROOT}/.unlazy/demo`
const typed = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 140 } }

const props = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

// A ledger of n gates; the first `checked` boxes ticked with current-looking evidence
function ledger(n: number, checked: number, extra = '') {
  const gates = Array.from({ length: n }, (_, i) => {
    const id = `G${i + 1}`
    const done = i < checked
    return [
      `- [${done ? 'x' : ' '}] ${id}: outcome number ${i + 1} of the demo scope`,
      `  CHECK: node check.mjs g${i + 1}`,
      `  EXPECT: OK${i + 1}`,
      `  EVIDENCE: ${done ? 'automatic-evidence=v1; definition-sha256=ab; exit=0; EXPECT=matched' : 'pending'}`,
      '',
    ].join('\n')
  })
  return `# Gates: demo\n\nScope: a demo.\n\n${gates.join('\n')}${extra}`
}

// What `gate-check.mjs --status` prints for a ledger whose open gates are `open` (qualified ids)
function checkerSays(total: number, open: { qid: string; reason?: string; title?: string }[], abandoned: string[] = []) {
  const lines = open.map((o) => `  UNMET ${o.qid} (${o.reason ?? 'unchecked'}): ${o.title ?? 'outcome'}`)
  lines.push(`GATES.md: ${total} gates`)
  const met = total - open.length - abandoned.length
  if (!open.length && !abandoned.length) lines.push(`ALL MET (${met} met) [scope demo]`)
  if (abandoned.length) {
    lines.push(`HANDOFF REQUIRED: ${abandoned.length} abandoned (met: ${met}${open.length ? `, unmet: ${open.length}` : ''}) [scope demo]`)
    lines.push('  ' + abandoned.join(', '))
  }
  if (open.length) {
    lines.push(`UNMET: ${open.length} (met: ${met}${abandoned.length ? `, abandoned: ${abandoned.length}` : ''}) [scope demo]`)
    lines.push('  ' + open.map((o) => o.qid).join(', '))
  }
  return lines.join('\n') + '\n'
}

const openFrom = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ qid: `GATES:G${from + i}`, title: `outcome number ${from + i} of the demo scope` }))

type World = {
  files?: Record<string, string>
  // The checker's output; absent, there is no checker on this machine
  checker?: string | null
  sessionId?: string
}

// Everything beneath the plugins a session would answer: a file system in memory, the checker, the session
function world($: unknown, on: On, w: World = {}) {
  const files: Record<string, string> = {
    [`${HOME}/.claude/settings.json`]: '{"hooks":{"Stop":[{"hooks":[{"command":"/opt/node ~/.claude/skills/unlazy/scripts/stop-hook.mjs --bound-only"}]}]}}',
    ...w.files,
  }
  // The checker is a file where the Stop hook's command says, when this machine has one
  if (typeof w.checker === 'string') files[CHECKER] = '// gate-check'
  mock.clock(on, { now: 1_000_000 })
  const stamps: Record<string, number> = {}
  let clock = 1
  for (const p of Object.keys(files)) stamps[p] = clock++
  let checker = w.checker
  let sessionId = w.sessionId ?? SESSION
  const runs: string[][] = []
  // The panes this plugin has open, as the engine keeps them
  const panes: { id: string; title: string }[] = []
  const missing = () => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  }
  const children = (dir: string) => {
    const prefix = dir.replace(/\/$/, '') + '/'
    const names = new Map<string, 'file' | 'dir'>()
    for (const p of Object.keys(files)) {
      if (!p.startsWith(prefix)) continue
      const rest = p.slice(prefix.length).split('/')
      names.set(rest[0], rest.length > 1 ? 'dir' : 'file')
    }
    return names
  }
  on('fs.read', (_$, e) => (e.path in files ? { value: files[e.path] } : missing()) as never)
  on('fs.exists', (_$, e) => ({ value: e.path in files || children(e.path).size > 0 }) as never)
  on('fs.stat', (_$, e) => (e.path in files ? { value: { kind: 'file', size: files[e.path].length, mtimeMs: stamps[e.path], isLink: false } } : missing()) as never)
  on('fs.list', (_$, e) => {
    const names = children(e.path)
    if (!names.size) missing()
    const dir = e.path.replace(/\/$/, '')
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: kind === 'file' ? stamps[`${dir}/${name}`] : 0, isLink: false })) } as never
  })
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? HOME : undefined }) as never)
  on('process.run', (_$, e) => {
    runs.push([...e.argv])
    if (checker === undefined || checker === null) throw new Error('cannot start')
    return { value: { exitCode: /ALL MET/.test(checker) ? 0 : 1, stdout: checker, stderr: '' } } as never
  })
  on('session.id', () => ({ value: sessionId }) as never)
  on('session.cwd', () => ({ value: ROOT }) as never)
  on('session.root', () => ({ value: ROOT }) as never)
  on('session.start', () => ({ cwd: ROOT }))
  on('classic.SessionStart', () => ({}) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.invalidate', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', () => ({}) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }) as never)
  on('ui.open', (_$, e) => {
    const at = panes.findIndex((p) => p.id === e.id)
    if (at < 0) panes.push({ id: e.id, title: e.title ?? e.id })
    else panes[at].title = e.title ?? panes[at].title
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    const at = panes.findIndex((p) => p.id === e.id)
    if (at >= 0) panes.splice(at, 1)
    return { value: undefined } as never
  })
  on('ui.panes', () => ({ value: panes.map((p) => ({ ...p, isShown: true, isFocused: false, isPlaced: true })) }) as never)
  on('ui.render', ($$, e) => $$.ui.resolve(e).Text({ key: 'engine', children: ['engine row'] }))
  return {
    runs,
    panes,
    write(path: string, text: string) {
      files[path] = text
      stamps[path] = ++clock + 1000
    },
    setChecker(text: string | null) {
      checker = text
    },
    setSession(id: string) {
      sessionId = id
    },
  }
}

// A demo scope bound to this session, its ledger and the checker's word on it
function bound(ledgerText: string, extra: Record<string, string> = {}) {
  return { [`${SCOPE_DIR}/session`]: SESSION + '\n', [`${SCOPE_DIR}/GATES.md`]: ledgerText, ...extra }
}

async function start($: any) {
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  // The first read is started from session.start without waiting; a turn's end waits for one
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
}

async function bash($: any) {
  await $.tool.call({ tool: 'Bash', command: 'node gate-check.mjs', description: 'run gates' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
}

async function gates($: any) {
  return ((await $.command.run({ command: 'gates', ...typed })) as { text: string }).text
}

const paneProps = { title: 'Гейти demo', isFocused: false, bodyColumns: 70, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

async function pane($: any, surface: string) {
  return $.ui.mount({ plugin: 'gate-meter', surface, component: 'Pane', requestId: 'gate-meter', props: paneProps })
}

// A text matched whole: a plain string would also match every box around it
const exact = (t: string) => new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '$')

// The children of a keyed Box as drawn: a Text's own key does not survive drawing
async function kids(ui: any, key: string): Promise<any[]> {
  return ((await ui.find({ key }))?.children ?? []) as any[]
}
const textOf = (el: any) => ((el?.children ?? []) as unknown[]).filter((c) => typeof c === 'string').join('')
const dotOf = async (ui: any, state: string) => {
  const k = await kids(ui, `state:${state}`)
  return k.length > 1 ? k[0] : undefined
}
const wordsOf = async (ui: any, state: string) => (await kids(ui, `state:${state}`)).at(-1)

async function rowText(ui: any) {
  return (await ui.find({ key: 'gate-meter:demo' }))?.text as string | undefined
}

for (const surface of SURFACES) {
  describe(surface, () => {
    test('no binding: no row, the band is the engine row alone', async ($, on) => {
      // A scope is there, but bound to another session
      world($, on, { files: { [`${SCOPE_DIR}/session`]: 'someone-else\n', [`${SCOPE_DIR}/GATES.md`]: ledger(3, 1) }, checker: checkerSays(3, openFrom(2, 3)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await ui.find({ key: 'prompt-band' })).toBeUndefined()
      expect(await ui.find({ key: 'gate-meter:demo' })).toBeUndefined()
      expect(await ui.find({ text: /^engine row$/ })).toBeDefined()
    })

    test('cells and count: one cell per gate, filled for met, dim for open, then "N з M"', async ($, on) => {
      world($, on, { files: bound(ledger(9, 4)), checker: checkerSays(9, openFrom(5, 9)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toBe('Гейти■■■■□□□□□4 з 9│Деталі')
      expect((await kids(ui, 'progress:demo'))[0]?.props?.dimColor).toBe(true)
      const open = await ui.findAll({ text: /^□$/ })
      expect(open).toHaveLength(5)
      for (const cell of open) expect(cell.props.dimColor).toBe(true)
      const filled = await ui.findAll({ text: /^■$/ })
      expect(filled).toHaveLength(4)
      for (const cell of filled) expect(cell.props.color).toBeUndefined()
      // Bars split the parts, dim, as in the neighbours' rows
      for (const bar of await ui.findAll({ text: /^│$/ })) expect(bar.props.dimColor).toBe(true)
    })

    test('no next in the row: the first open gate is not named there, only in the pane', async ($, on) => {
      world($, on, { files: bound(ledger(9, 4)), checker: checkerSays(9, openFrom(5, 9)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      const text = (await rowText(ui)) ?? ''
      expect(text).not.toMatch(/Далі|G5|outcome/)
      const p = await pane($, surface)
      expect(await p.find({ text: exact('Наступний відкритий: G5') })).toBeDefined()
    })

    test('cells up to 14: one cell per gate at 14', async ($, on) => {
      world($, on, { files: bound(ledger(14, 3)), checker: checkerSays(14, openFrom(4, 14)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toContain('Гейти' + '■'.repeat(3) + '□'.repeat(11) + '3 з 14│')
      expect(await ui.find({ text: /^█$/ })).toBeUndefined()
    })

    test('bar from 15: a bar of 15 steps like cache-meter\'s, met in █, open in dim ░', async ($, on) => {
      world($, on, { files: bound(ledger(15, 6)), checker: checkerSays(15, openFrom(7, 15)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toContain('Гейти' + '█'.repeat(6) + '░'.repeat(9) + '6 з 15│')
      for (const step of await ui.findAll({ text: /^░$/ })) expect(step.props.dimColor).toBe(true)
      expect(await ui.find({ text: /^■$/ })).toBeUndefined()
    })

    test('green from 75%: at 3 of 4 cells and at 12 of 16 in the bar the filled turn green', async ($, on) => {
      const w = world($, on, { files: bound(ledger(4, 3)), checker: checkerSays(4, openFrom(4, 4)) })
      await start($)
      let ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      for (const cell of await ui.findAll({ text: /^■$/ })) expect(cell.props.color).toBe('green')
      w.write(`${SCOPE_DIR}/GATES.md`, ledger(16, 12))
      w.setChecker(checkerSays(16, openFrom(13, 16)))
      await bash($)
      ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      const steps = await ui.findAll({ text: /^█$/ })
      expect(steps.length).toBeGreaterThan(0)
      for (const step of steps) expect(step.props.color).toBe('green')
    })

    test('not green below 75%: at 5 of 7 cells and at 11 of 15 in the bar the filled keep the text colour', async ($, on) => {
      const w = world($, on, { files: bound(ledger(7, 5)), checker: checkerSays(7, openFrom(6, 7)) })
      await start($)
      let ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      const cells = await ui.findAll({ text: /^■$/ })
      expect(cells).toHaveLength(5)
      for (const cell of cells) expect(cell.props.color).toBeUndefined()
      w.write(`${SCOPE_DIR}/GATES.md`, ledger(15, 11))
      w.setChecker(checkerSays(15, openFrom(12, 15)))
      await bash($)
      ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      const steps = await ui.findAll({ text: /^█$/ })
      expect(steps).toHaveLength(11)
      for (const step of steps) expect(step.props.color).toBeUndefined()
    })

    test('row state all met: green cells, then a green dot and dim "Усі закрито"', async ($, on) => {
      world($, on, { files: bound(ledger(9, 9)), checker: checkerSays(9, []) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toBe('Гейти' + '■'.repeat(9) + '9 з 9│●Усі закрито│Деталі')
            expect((await dotOf(ui, 'done'))?.props?.color).toBe('green')
      const words = await wordsOf(ui, 'done')
      expect(words?.props.dimColor).toBe(true)
      expect(words?.props?.color).toBeUndefined()
    })

    test('row state paused: a dim ◌ and dim words for this session\'s pause; another session\'s pause shows nothing', async ($, on) => {
      const w = world($, on, { files: bound(ledger(4, 2), { [`${SCOPE_DIR}/pause.json`]: JSON.stringify({ schema: 1, session: SESSION }) }), checker: checkerSays(4, openFrom(3, 4)) })
      await start($)
      let ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toContain('2 з 4│◌На паузі│Деталі')
            expect((await dotOf(ui, 'paused'))?.props?.dimColor).toBe(true)
      expect((await wordsOf(ui, 'paused'))?.props?.dimColor).toBe(true)
      w.write(`${SCOPE_DIR}/pause.json`, JSON.stringify({ schema: 1, session: 'other' }))
      await bash($)
      ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await ui.find({ key: 'state:paused' })).toBeUndefined()
    })

    test('row state blocked: BLOCKED.md is a yellow dot and plain words "Очікує на рішення"', async ($, on) => {
      world($, on, { files: bound(ledger(4, 3), { [`${SCOPE_DIR}/BLOCKED.md`]: 'SESSION: session-1\n' }), checker: checkerSays(4, openFrom(4, 4)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toContain('3 з 4│●Очікує на рішення│Деталі')
            expect((await dotOf(ui, 'blocked'))?.props?.color).toBe('yellow')
      const words = await wordsOf(ui, 'blocked')
      expect(words?.props?.color).toBeUndefined()
      expect(words?.props?.dimColor).toBeUndefined()
    })

    test('row state abandoned: a yellow cross in the cells and a dim count with no dot', async ($, on) => {
      world($, on, { files: bound(ledger(4, 2, '\nABANDON: G4 the owner left\n')), checker: checkerSays(4, openFrom(3, 3), ['GATES:G4']) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect((await ui.find({ text: /^×$/ }))?.props.color).toBe('yellow')
      expect(await rowText(ui)).toBe('Гейти■■□×2 з 4│покинуто 1│Деталі')
            expect(await kids(ui, 'state:abandoned')).toHaveLength(1)
      expect((await wordsOf(ui, 'abandoned'))?.props?.dimColor).toBe(true)
    })

    test('row state regression: a red cell, a red dot and plain words naming the gate', async ($, on) => {
      world($, on, {
        files: bound(ledger(4, 1), { [`${SCOPE_DIR}/regression.json`]: JSON.stringify({ schema: 1, ids: ['GATES:G2'] }) }),
        checker: checkerSays(4, openFrom(2, 4)),
      })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      const red = await ui.findAll({ text: /^□$/ })
      expect(red.filter((c: any) => c.props.color === 'red')).toHaveLength(1)
      expect(await rowText(ui)).toContain('1 з 4│●Регресія G2│Деталі')
            expect((await dotOf(ui, 'regressed'))?.props?.color).toBe('red')
      expect((await wordsOf(ui, 'regressed'))?.props?.color).toBeUndefined()
    })

    test('row state stale is not a word: a ticked box the checker calls stale counts as open, the row only counts it', async ($, on) => {
      // All four boxes ticked, but G3's evidence no longer matches its definition
      world($, on, { files: bound(ledger(4, 4)), checker: checkerSays(4, [{ qid: 'GATES:G3', reason: 'checked but automatic evidence is stale or unbound' }]) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toBe('Гейти■■□■3 з 4│Деталі')
    })

    test('width: many states fit bodyColumns; the dim counts give way first, the dotted states stay', async ($, on) => {
      const ids = Array.from({ length: 12 }, (_, i) => `GATES:G${i + 2}`)
      world($, on, {
        files: bound(ledger(14, 1, '\nABANDON: G14 the owner left\n'), {
          [`${SCOPE_DIR}/BLOCKED.md`]: 'SESSION: session-1\n',
          [`${SCOPE_DIR}/regression.json`]: JSON.stringify({ schema: 1, ids }),
        }),
        checker: checkerSays(14, openFrom(2, 13), ['GATES:G14']),
      })
      await start($)
      for (const columns of [140, 100, 90]) {
        const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props: { ...props, bodyColumns: columns } })
        const text = (await rowText(ui)) ?? ''
        const bars = (await ui.findAll({ text: /^│$/ })).length
        // The text, a space each side of every bar, a space after each dot, the terminal's hotkey mark
        const dots = (await ui.findAll({ text: /^[●◌]$/ })).length
        expect(text.length + bars * 2 + dots + (surface === 'terminal' ? 4 : 0)).toBeLessThanOrEqual(columns)
        expect(await ui.find({ key: 'state:blocked' })).toBeDefined()
        expect(await ui.find({ key: 'state:regressed' })).toBeDefined()
        if (columns <= 100) expect(await ui.find({ key: 'state:abandoned' })).toBeUndefined()
      }
    })

    test('row label one scope: "Гейти" alone, the scope\'s name is in the pane', async ($, on) => {
      world($, on, { files: bound(ledger(3, 1)), checker: checkerSays(3, openFrom(2, 3)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(textOf((await kids(ui, 'progress:demo'))[0])).toBe('Гейти')
    })

    test('row label several scopes: each row names its scope', async ($, on) => {
      world($, on, {
        files: {
          ...bound(ledger(3, 1)),
          [`${ROOT}/.unlazy/other/session`]: SESSION + '\n',
          [`${ROOT}/.unlazy/other/GATES.md`]: ledger(2, 1),
        },
        checker: checkerSays(3, openFrom(2, 3)),
      })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(textOf((await kids(ui, 'progress:demo'))[0])).toBe('Гейти demo')
      expect(textOf((await kids(ui, 'progress:other'))[0])).toBe('Гейти other')
    })

    test('fallback without the checker: the check boxes decide, the count is marked ≈, and /gates says so', async ($, on) => {
      world($, on, { files: bound(ledger(5, 2)), checker: null })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toContain('■■□□□≈2 з 5')
      expect(await gates($)).toContain('за позначками у файлі')
    })

    for (const order of [[fakeHandoffRelay, fakeCacheMeter, fakeNextSteps], [fakeNextSteps, fakeCacheMeter, fakeHandoffRelay]]) {
      test(`band order: gates below Handoff, cache and "What next?", whatever order they loaded in (${order.map((p) => p.name).join(', ')})`, { plugins: order }, async ($, on) => {
        world($, on, { files: bound(ledger(3, 1)), checker: checkerSays(3, openFrom(2, 3)) })
        await start($)
        const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
        const tree = (await ui.drawn()) as { props?: { key?: string; rowGap?: number }; children?: { props?: { key?: string } }[] }
        expect(tree.props?.key).toBe('prompt-band')
        expect(tree.props?.rowGap).toBe(0.5)
        expect((tree.children ?? []).map((r) => r.props?.key)).toEqual([
          'prompt-band-row:10:handoff-relay',
          'prompt-band-row:20:cache-meter',
          'prompt-band-row:30:next-steps',
          'prompt-band-row:40:gate-meter',
          'prompt-band-row:999:other',
        ])
      })
    }

    test('a survey hides the row', async ($, on) => {
      world($, on, { files: bound(ledger(3, 1)), checker: checkerSays(3, openFrom(2, 3)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props: { ...props, hasSurvey: true } })
      expect(await ui.find({ key: 'gate-meter:demo' })).toBeUndefined()
    })

    test('details button opens the pane in the side panel, titled by the scope', async ($, on) => {
      const w = world($, on, { files: bound(ledger(9, 4)), checker: checkerSays(9, openFrom(5, 9)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      const button = await ui.find({ key: 'details' })
      expect(button?.type).toBe('Button')
      expect(button?.props.label).toBe('Деталі')
      expect(button?.props.dimColor).toBe(true)
      expect(button?.props.hotkey).toBe(surface === 'terminal' ? 'g' : undefined)
      await ui.press({ key: 'details' })
      expect(w.panes).toEqual([{ id: 'gate-meter', title: 'Гейти demo' }])
    })

    test('details button closes the open pane on a second press', async ($, on) => {
      const w = world($, on, { files: bound(ledger(9, 4)), checker: checkerSays(9, openFrom(5, 9)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      await ui.press({ key: 'details' })
      await ui.press({ key: 'details' })
      expect(w.panes).toEqual([])
    })

    test('details button in the all-met row opens the pane too', async ($, on) => {
      const w = world($, on, { files: bound(ledger(3, 3)), checker: checkerSays(3, []) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      await ui.press({ key: 'details' })
      expect(w.panes.map((p) => p.id)).toEqual(['gate-meter'])
    })

    test('pane header: the ledger heading and Scope, the count and its source, one line per gate', async ($, on) => {
      world($, on, { files: bound(ledger(9, 4)), checker: checkerSays(9, openFrom(5, 9)) })
      await start($)
      const ui = await pane($, surface)
      expect((await ui.find({ text: /^demo$/ }))?.props.bold).toBe(true)
      expect((await kids(ui, 'scope'))[0]?.props?.dimColor).toBe(true)
      expect((await ui.find({ key: 'count' }))?.text).toBe('Закрито 4 з 9за перевірником unlazy')
      const met = await ui.find({ key: 'gate:demo/GATES:G1' })
      expect(met?.props.label).toBe('▸ ✓ G1')
      expect(met?.props.dimColor).toBe(true)
      expect((await ui.find({ key: 'gate-title:demo/GATES:G1' }))?.props.label).toBe('outcome number 1 of the demo scope')
      const open = await ui.find({ key: 'gate:demo/GATES:G5' })
      expect(open?.props.label).toBe('▸ ○ G5')
      expect(open?.props.dimColor).toBeUndefined()
      expect((await ui.find({ text: exact(`Набір: ${SCOPE_DIR}/GATES.md`) }))?.props.dimColor).toBe(true)
      // Collapsed, nothing below the gates' lines
      expect(await ui.find({ key: 'details:GATES:G5' })).toBeUndefined()
    })

    test('pane expand a gate: its CHECK, EXPECT, evidence and why it is open; a second press folds it', async ($, on) => {
      world($, on, { files: bound(ledger(9, 4)), checker: checkerSays(9, openFrom(5, 9)) })
      await start($)
      const ui = await pane($, surface)
      await ui.press({ key: 'gate:demo/GATES:G5' })
      expect((await ui.find({ key: 'gate:demo/GATES:G5' }))?.props.label).toMatch(/^▾ ○ G5/)
      const details = (await ui.find({ key: 'details:GATES:G5' }))?.text ?? ''
      expect(details).toContain('outcome number 5 of the demo scope')
      expect(details).toContain('EXPECTOK5')
      expect(details).toContain('Свідченняще немає')
      expect(details).toContain('Відкритий, боще не перевірено')
      expect(JSON.stringify(await ui.drawn())).toContain('"source":"node check.mjs g5"')
      await ui.press({ key: 'gate:demo/GATES:G1' })
      expect((await ui.find({ key: 'details:GATES:G1' }))?.text).toContain('Свідченняавтоматичне: код виходу 0, EXPECT збігся')
      await ui.press({ key: 'gate:demo/GATES:G5' })
      expect(await ui.find({ key: 'details:GATES:G5' })).toBeUndefined()
    })

    test('pane expand all, then collapse all', async ($, on) => {
      world($, on, { files: bound(ledger(4, 2)), checker: checkerSays(4, openFrom(3, 4)) })
      await start($)
      const ui = await pane($, surface)
      expect((await ui.find({ key: 'all:demo' }))?.props.label).toBe('Розгорнути все')
      await ui.press({ key: 'all:demo' })
      for (const id of ['G1', 'G2', 'G3', 'G4']) expect(await ui.find({ key: `details:GATES:${id}` })).toBeDefined()
      expect((await ui.find({ key: 'all:demo' }))?.props.label).toBe('Згорнути все')
      await ui.press({ key: 'all:demo' })
      for (const id of ['G1', 'G2', 'G3', 'G4']) expect(await ui.find({ key: `details:GATES:${id}` })).toBeUndefined()
    })

    test('pane without binding says how gates get here', async ($, on) => {
      world($, on, { files: {}, checker: null })
      await start($)
      const ui = await pane($, surface)
      expect(JSON.stringify(await ui.drawn())).toContain(uk.noBinding)
    })

    test('pane state lines: pause, regression and an abandoned gate with its reason', async ($, on) => {
      world($, on, {
        files: bound(ledger(4, 1, '\nABANDON: G4 the owner left\n'), {
          [`${SCOPE_DIR}/pause.json`]: JSON.stringify({ schema: 1, session: SESSION }),
          [`${SCOPE_DIR}/regression.json`]: JSON.stringify({ schema: 1, ids: ['GATES:G2'] }),
        }),
        checker: checkerSays(4, openFrom(2, 3), ['GATES:G4']),
      })
      await start($)
      const ui = await pane($, surface)
      expect((await ui.find({ text: exact(uk.stateLine.paused) }))?.props.dimColor).toBe(true)
      expect((await ui.find({ text: exact(uk.regressedLine('G2')) }))?.props.color).toBeUndefined()
      expect((await dotOf(ui, 'regressed'))?.props?.color).toBe('red')
      expect((await ui.find({ key: 'gate:demo/GATES:G4' }))?.props.label).toMatch(/^▸ × G4/)
      await ui.press({ key: 'gate:demo/GATES:G4' })
      expect((await ui.find({ key: 'details:GATES:G4' }))?.text).toContain('Покинуто, боthe owner left')
      await ui.press({ key: 'gate:demo/GATES:G2' })
      expect((await ui.find({ key: 'details:GATES:G2' }))?.text).toContain('зламався після відновлення')
    })

    test('pane layout header: a bold heading, the Scope as an indented paragraph, then the count and the states with their dots', async ($, on) => {
      world($, on, { files: bound(ledger(4, 3), { [`${SCOPE_DIR}/BLOCKED.md`]: 'SESSION: session-1\n' }), checker: checkerSays(4, openFrom(4, 4)) })
      await start($)
      const ui = await pane($, surface)
      const block = await ui.find({ key: 'scope:demo' })
      // Heading, Scope, status and gates each a paragraph of their own
      expect(block?.props.rowGap).toBe(1)
      expect((await ui.find({ text: exact('demo') }))?.props.bold).toBe(true)
      const scope = await ui.find({ key: 'scope' })
      expect(scope?.type).toBe('Box')
      expect(scope?.props.paddingLeft).toBe(2)
      expect((await dotOf(ui, 'blocked'))?.props?.color).toBe('yellow')
      expect(textOf(await wordsOf(ui, 'blocked'))).toBe(uk.stateLine.blocked)
      expect((await wordsOf(ui, 'blocked'))?.props?.color).toBeUndefined()
    })

    test('pane layout gate column: every id sits in a column of one width, so the titles line up', async ($, on) => {
      world($, on, {
        files: bound(ledger(2, 1), { [`${SCOPE_DIR}/gates/leaf-long.md`]: '# Gates: leaf\n\n- [ ] L12: the leaf outcome\n  EVIDENCE: pending\n' }),
        checker: checkerSays(3, openFrom(2, 2).concat([{ qid: 'leaf-long:L12' }])),
      })
      await start($)
      const ui = await pane($, surface)
      const columns = await ui.findAll({ key: 'id' })
      expect(columns).toHaveLength(3)
      const widths = new Set(columns.map((c: any) => c.props.width))
      expect(widths.size).toBe(1)
      // ▸, ✓, the widest id 'leaf-long:L12' and a gap
      expect([...widths][0]).toBe(4 + 'leaf-long:L12'.length + 2)
    })

    test('pane layout fields: each field is its dim name on a line above the value, a gap between fields, a line after the gate', async ($, on) => {
      world($, on, { files: bound(ledger(4, 2)), checker: checkerSays(4, openFrom(3, 4)) })
      await start($)
      const ui = await pane($, surface)
      await ui.press({ key: 'gate-title:demo/GATES:G3' })
      const details = await ui.find({ key: 'details:GATES:G3' })
      expect(details?.props.rowGap).toBe(1)
      expect(details?.props.marginBottom).toBe(1)
      expect(details?.props.paddingLeft).toBe(4)
      for (const [key, name] of [['check', 'CHECK'], ['expect', 'EXPECT'], ['evidence', 'Свідчення'], ['why', 'Відкритий, бо']]) {
        const field = await ui.find({ key })
        expect(field?.props.flexDirection).toBe('column')
        const label = (field?.children ?? [])[0] as { props?: { dimColor?: boolean }; children?: string[] }
        expect(label?.props?.dimColor).toBe(true)
        expect(label?.children).toEqual([name])
      }
    })

    test('pane layout width: a long title is cut so the gate line fits bodyColumns', async ($, on) => {
      const long = 'y'.repeat(300)
      world($, on, { files: bound(ledger(3, 1).replace('outcome number 2 of the demo scope', long)), checker: checkerSays(3, [{ qid: 'GATES:G2', title: long }, ...openFrom(3, 3)]) })
      await start($)
      const ui = await pane($, surface)
      const id = await ui.find({ key: 'id' })
      const title = await ui.find({ key: 'gate-title:demo/GATES:G2' })
      expect(Number(id?.props.width) + String(title?.props.label).length).toBeLessThanOrEqual(paneProps.bodyColumns)
      expect(String(title?.props.label)).toMatch(/y…$/)
    })

    test('progress moves after a Bash call that ran the checker', async ($, on) => {
      const w = world($, on, { files: bound(ledger(3, 1)), checker: checkerSays(3, openFrom(2, 3)) })
      await start($)
      let ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toContain('1 з 3')
      w.write(`${SCOPE_DIR}/GATES.md`, ledger(3, 2))
      w.setChecker(checkerSays(3, openFrom(3, 3)))
      await bash($)
      ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toBe('Гейти■■□2 з 3│Деталі')
    })
  })
}

test('the checker runs only when a scope file changed', async ($, on) => {
  const w = world($, on, { files: bound(ledger(3, 1)), checker: checkerSays(3, openFrom(2, 3)) })
  await start($)
  const after = w.runs.length
  expect(after).toBeGreaterThan(0)
  await bash($)
  await bash($)
  expect(w.runs.length).toBe(after)
  w.write(`${SCOPE_DIR}/GATES.md`, ledger(3, 2))
  await bash($)
  expect(w.runs.length).toBe(after + 1)
})

test('the checker is the one next to the Stop hook, read-only, scoped to the bound scope', async ($, on) => {
  const w = world($, on, { files: { ...bound(ledger(3, 1)), [CHECKER]: '// checker' }, checker: checkerSays(3, openFrom(2, 3)) })
  await start($)
  expect(w.runs[0]).toEqual(['/opt/node', CHECKER, '--status', '--scope', 'demo', '--root', ROOT])
})

test('/gates lists every gate with its mark, the next one open, and where the ledger is', async ($, on) => {
  world($, on, {
    files: bound(ledger(4, 2, '\nABANDON: G4 the owner left\n')),
    checker: checkerSays(4, [{ qid: 'GATES:G3', reason: 'checked but EVIDENCE pending' }], ['GATES:G4']),
  })
  await start($)
  const text = await gates($)
  expect(text).toContain('Гейти demo: закрито 2 з 4')
  expect(text).toContain('той самий стан, що бачить Stop-хук')
  expect(text).toContain('✓ G1  outcome number 1 of the demo scope')
  expect(text).toContain('○ G3  outcome number 3 of the demo scope (без свідчення)')
  expect(text).toContain('× G4  outcome number 4 of the demo scope (покинуто: the owner left)')
  expect(text).toContain(`Набір: ${SCOPE_DIR}/GATES.md`)
})

test('/gates without a binding says how gates get here', async ($, on) => {
  world($, on, { files: {}, checker: null })
  await start($)
  expect(await gates($)).toBe(uk.noBinding)
})

test('several ledgers: ids are qualified with the file stem, as unlazy reports them', async ($, on) => {
  world($, on, {
    files: bound(ledger(2, 2), { [`${SCOPE_DIR}/gates/leaf-1.md`]: '# Gates: leaf\n\n- [ ] L1: the leaf outcome\n  EVIDENCE: pending\n' }),
    checker: checkerSays(3, [{ qid: 'leaf-1:L1', title: 'the leaf outcome' }]),
  })
  await start($)
  const ui = await $.ui.mount({ plugin: 'gate-meter', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await rowText(ui)).toContain('■■□2 з 3│Деталі')
  const p = await pane($, 'terminal')
  expect((await p.find({ key: 'gate:demo/leaf-1:L1' }))?.props.label).toBe('▸ ○ leaf-1:L1')
})

test('a long ledger draws a proportional bar of 15 steps', async ($, on) => {
  world($, on, { files: bound(ledger(40, 30)), checker: checkerSays(40, openFrom(31, 40)) })
  await start($)
  const ui = await $.ui.mount({ plugin: 'gate-meter', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await rowText(ui)).toContain('█'.repeat(11) + '░'.repeat(4) + '30 з 40')
})

test('a new session id after /clear drops the old binding', async ($, on) => {
  const w = world($, on, { files: bound(ledger(3, 1)), checker: checkerSays(3, openFrom(2, 3)) })
  await start($)
  w.setSession('session-2')
  await $.classic.SessionStart({ source: 'clear' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })
  const ui = await $.ui.mount({ plugin: 'gate-meter', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ key: 'gate-meter:demo' })).toBeUndefined()
})

test('English: the row and /gates follow the language option', { options: { language: 'en' } }, async ($: any, on: On) => {
  world($, on, { files: bound(ledger(9, 4)), checker: checkerSays(9, openFrom(5, 9)) })
  await start($)
  const ui = await $.ui.mount({ plugin: 'gate-meter', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await rowText(ui)).toBe('Gates■■■■□□□□□4 of 9│Details')
  expect(await gates($)).toContain('Gates demo: 4 of 9 met')
})

test('English row label several scopes: each row is "Gates <scope>"', { options: { language: 'en' } }, async ($: any, on: On) => {
  world($, on, {
    files: { ...bound(ledger(3, 1)), [`${ROOT}/.unlazy/other/session`]: SESSION + '\n', [`${ROOT}/.unlazy/other/GATES.md`]: ledger(2, 1) },
    checker: checkerSays(3, openFrom(2, 3)),
  })
  await start($)
  const ui = await $.ui.mount({ plugin: 'gate-meter', surface: 'terminal', component: 'AbovePrompt', props })
  expect(textOf((await kids(ui, 'progress:demo'))[0])).toBe('Gates demo')
  expect(textOf((await kids(ui, 'progress:other'))[0])).toBe('Gates other')
})

// Reads gate-meter's published state the way another mod would
const peek = {
  name: 'peek',
  register: (on: On) => {
    on('command.run', { command: 'peek' }, async ($) => {
      const { value } = await $.state.get({ plugin: 'gate-meter', key: 'view' })
      return { text: JSON.stringify(value ?? null) }
    })
  },
}

test('state for other mods: the bound scope with its counts', { plugins: [peek] }, async ($: any, on: On) => {
  world($, on, { files: bound(ledger(3, 1)), checker: checkerSays(3, openFrom(2, 3)) })
  await start($)
  const value = JSON.parse(((await $.command.run({ command: 'peek', ...typed })) as { text: string }).text) as { scopes: { scope: string; met: number; total: number; source: string }[] }
  expect(value.scopes.map((s) => [s.scope, s.met, s.total, s.source])).toEqual([['demo', 1, 3, 'checker']])
})

test('translations: en and uk have the same set of keys', () => {
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v).map((x) => `${k}.${x}`) : [k])).sort()
  expect(keys(uk)).toEqual(keys(en))
})
