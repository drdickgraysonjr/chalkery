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
  on('ui.render', ($$, e) => $$.ui.resolve(e).Text({ key: 'engine', children: ['engine row'] }))
  return {
    runs,
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
      const text = await rowText(ui)
      expect(text).toContain('Гейти demo■■■■□□□□□4 з 9│')
      expect((await ui.find({ text: /^Гейти demo$/ }))?.props.dimColor).toBe(true)
      const open = await ui.findAll({ text: /^□$/ })
      expect(open).toHaveLength(5)
      for (const cell of open) expect(cell.props.dimColor).toBe(true)
      const filled = await ui.findAll({ text: /^■$/ })
      expect(filled).toHaveLength(4)
      for (const cell of filled) expect(cell.props.dimColor).toBeUndefined()
      // Bars split the parts, dim, as in the neighbours' rows
      for (const bar of await ui.findAll({ text: /^│$/ })) expect(bar.props.dimColor).toBe(true)
    })

    test('next gate: the first open gate with its title, dim', async ($, on) => {
      world($, on, { files: bound(ledger(9, 4)), checker: checkerSays(9, openFrom(5, 9)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      const next = await ui.find({ text: /^Далі G5: / })
      expect(next?.text).toBe('Далі G5: outcome number 5 of the demo scope')
      expect(next?.props.dimColor).toBe(true)
    })

    test('width: a long next-gate title is cut with an ellipsis so the row fits bodyColumns', async ($, on) => {
      const long = 'x'.repeat(400)
      world($, on, {
        files: bound(ledger(9, 4).replace('outcome number 5 of the demo scope', long)),
        checker: checkerSays(9, [{ qid: 'GATES:G5', title: long }, ...openFrom(6, 9)]),
      })
      await start($)
      for (const columns of [120, 80, 60]) {
        const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props: { ...props, bodyColumns: columns } })
        const text = (await rowText(ui)) ?? ''
        const parts = (await ui.findAll({ text: /^│$/ })).length
        // The text plus a space each side of every bar
        expect(text.length + parts * 2).toBeLessThanOrEqual(columns)
        expect(text).toContain('Далі G5')
        if (columns >= 80) expect(text).toMatch(/x…$/)
      }
    })

    test('all met: a green dot and one dim line, no cells', async ($, on) => {
      world($, on, { files: bound(ledger(9, 9)), checker: checkerSays(9, []) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toBe('● Гейти demo: усі 9 закрито')
      expect((await ui.find({ text: /^●$/ }))?.props.color).toBe('green')
      expect((await ui.find({ text: /^ Гейти demo: усі 9 закрито$/ }))?.props.dimColor).toBe(true)
      expect(await ui.find({ text: /^■$/ })).toBeUndefined()
    })

    test('paused: this session paused by /handoff says so; another session\'s pause does not', async ($, on) => {
      const w = world($, on, { files: bound(ledger(4, 2), { [`${SCOPE_DIR}/pause.json`]: JSON.stringify({ schema: 1, session: SESSION }) }), checker: checkerSays(4, openFrom(3, 4)) })
      await start($)
      let ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect((await ui.find({ text: /^на паузі$/ }))?.props.dimColor).toBe(true)
      w.write(`${SCOPE_DIR}/pause.json`, JSON.stringify({ schema: 1, session: 'other' }))
      await bash($)
      ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await ui.find({ text: /^на паузі$/ })).toBeUndefined()
    })

    test('blocked: BLOCKED.md shows the stop in yellow, before the next gate', async ($, on) => {
      world($, on, { files: bound(ledger(4, 3), { [`${SCOPE_DIR}/BLOCKED.md`]: 'SESSION: session-1\n' }), checker: checkerSays(4, openFrom(4, 4)) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect((await ui.find({ text: /^зупинено, чекає рішення$/ }))?.props.color).toBe('yellow')
      expect(await rowText(ui)).toContain('3 з 4│зупинено, чекає рішення│Далі G4')
    })

    test('abandoned: a yellow cross for the gate and the count beside "N з M"', async ($, on) => {
      world($, on, { files: bound(ledger(4, 2, '\nABANDON: G4 the owner left\n')), checker: checkerSays(4, openFrom(3, 3), ['GATES:G4']) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      const cross = await ui.find({ text: /^×$/ })
      expect(cross?.props.color).toBe('yellow')
      expect(await rowText(ui)).toContain('■■□×2 з 4│покинуто 1│Далі G3')
    })

    test('regression: a gate broken on resume is a red cell and named in red', async ($, on) => {
      world($, on, {
        files: bound(ledger(4, 1), { [`${SCOPE_DIR}/regression.json`]: JSON.stringify({ schema: 1, ids: ['GATES:G2'] }) }),
        checker: checkerSays(4, openFrom(2, 4)),
      })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      const red = await ui.findAll({ text: /^□$/ })
      expect(red.filter((c: any) => c.props.color === 'red')).toHaveLength(1)
      expect((await ui.find({ text: /^регресія: GATES:G2$/ }))?.props.color).toBe('red')
    })

    test('stale evidence: a ticked box the checker calls stale counts as open, and the row says why', async ($, on) => {
      // All four boxes ticked, but G3's evidence no longer matches its definition
      world($, on, { files: bound(ledger(4, 4)), checker: checkerSays(4, [{ qid: 'GATES:G3', reason: 'checked but automatic evidence is stale or unbound' }]) })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toContain('■■□■3 з 4│Далі G3: outcome number 3 of the demo scope (свідчення застаріло)')
    })

    test('fallback without the checker: the check boxes decide, and /gates says so', async ($, on) => {
      world($, on, { files: bound(ledger(5, 2)), checker: null })
      await start($)
      const ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toContain('■■□□□2 з 5')
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

    test('progress moves after a Bash call that ran the checker', async ($, on) => {
      const w = world($, on, { files: bound(ledger(3, 1)), checker: checkerSays(3, openFrom(2, 3)) })
      await start($)
      let ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toContain('1 з 3')
      w.write(`${SCOPE_DIR}/GATES.md`, ledger(3, 2))
      w.setChecker(checkerSays(3, openFrom(3, 3)))
      await bash($)
      ui = await $.ui.mount({ plugin: 'gate-meter', surface, component: 'AbovePrompt', props })
      expect(await rowText(ui)).toContain('■■□2 з 3│Далі G3')
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
  expect(await rowText(ui)).toContain('■■□2 з 3│Далі leaf-1:L1: the leaf outcome')
})

test('a long ledger draws a proportional bar of 20 cells', async ($, on) => {
  world($, on, { files: bound(ledger(40, 30)), checker: checkerSays(40, openFrom(31, 40)) })
  await start($)
  const ui = await $.ui.mount({ plugin: 'gate-meter', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await rowText(ui)).toContain('■'.repeat(15) + '□'.repeat(5) + '30 з 40')
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
  expect(await rowText(ui)).toContain('Gates demo■■■■□□□□□4 of 9│Next G5: outcome number 5')
  expect(await gates($)).toContain('Gates demo: 4 of 9 met')
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
