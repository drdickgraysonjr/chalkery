// SPDX-License-Identifier: MIT
// Gate Meter: the progress of the /unlazy gates bound to this session, one quiet row in
// the band above the prompt, and the whole list on /gates.
//
// Why: /unlazy keeps a session working until every acceptance gate of its scope is met,
// and the Stop hook says so only at the end. The row shows along the way how many gates
// are met, which one is next, and whether the scope is paused, stopped or regressed.
//
// What it reads, never writes: `.unlazy/<scope>/` under the session's folder. A scope is
// this session's when its `session` file holds the session id, as `gate-check --bind`
// writes it. The counts come from the unlazy checker in its read-only mode
// (`gate-check.mjs --status`, which never runs a CHECK), so the row agrees with the Stop
// hook; when the checker cannot be found or run, the ledger's check boxes stand in.

import { atom, read, update } from 'claude-code'
import { joinBand } from './band.mjs'
import { automaticEvidence, clip, parseChecker, parseHeader, parseLedgers, summarize } from './ledger.mjs'
import { resolveLanguage, isLanguageKey } from './i18n.mjs'
import en from './locales/en.mjs'
import uk from './locales/uk.mjs'

const LOCALES = { en, uk }
const DIR = '.unlazy'
// Scopes are re-read this often while nothing else asks for it; a Bash call or a finished turn asks at once
const TICK_EVERY = 15000
// More cells than this and the row draws a proportional bar instead of one cell per gate
const MAX_CELLS = 30
const BAR_CELLS = 20
// A next-gate title shorter than this says nothing; the row then names the gate only
const MIN_TITLE = 12
// Bound scopes drawn at most; the Stop hook enforces none when there are several
const MAX_ROWS = 3
// The details pane in the side panel, and which gates are open in it
const PANE = 'gate-meter'

let L = en
let language = 'auto'
let checkerOption = ''
let isLanguagePicked = false

async function pickLanguage($) {
  isLanguagePicked = true
  let rows = []
  if (language !== 'en' && language !== 'uk') {
    try {
      rows = await $.config.list()
    } catch {
      rows = [] // no /config here (a test, a -p run): English
    }
  }
  L = LOCALES[resolveLanguage(language, rows)]
}

// What the band draws and other mods may read. Rewritten only when it changes.
const VIEW = atom({ plugin: 'gate-meter', key: 'view' }, { scopes: [] })
// Gates the person opened in the pane, as `<scope>/<qualified id>`; kept by the host across a reload
const EXPANDED = atom({ plugin: 'gate-meter', key: 'expanded' }, [])
let published = ''
// Per scope: the fingerprint of its files at the last read, and what that read gave
const seen = new Map()
let checker = null // { node, script } once found; false when looked for and absent
let commandName = 'gates'
let refreshing = null

function join(...parts) {
  return parts.join('/').replace(/\/+/g, '/')
}

async function tryRead($, path) {
  try {
    return String(await $.fs.read(path))
  } catch {
    return null
  }
}

async function tryList($, path) {
  try {
    return await $.fs.list(path)
  } catch {
    return []
  }
}

async function mtime($, path) {
  try {
    return (await $.fs.stat(path)).mtimeMs
  } catch {
    return 0
  }
}

// The session's folders: where the Stop hook looks (the working directory) and the project root
async function roots($) {
  const out = []
  for (const get of [() => $.session.cwd(), () => $.session.root()]) {
    try {
      const r = String(await get())
      if (r && !out.includes(r)) out.push(r)
    } catch {
      // not answered here
    }
  }
  return out
}

// The ledger files of a scope as the checker discovers them: GATES.md, then gates/**/*.md
async function ledgerFiles($, scopeDir) {
  const files = []
  const top = await tryRead($, join(scopeDir, 'GATES.md'))
  if (top !== null) files.push({ name: 'GATES.md', path: join(scopeDir, 'GATES.md'), text: top })
  const walk = async (dir, depth) => {
    if (depth > 4) return
    const entries = [...(await tryList($, dir))].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.kind === 'dir') await walk(path, depth + 1)
      else if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        const text = await tryRead($, path)
        if (text !== null) files.push({ name: entry.name, path, text })
      }
    }
  }
  await walk(join(scopeDir, 'gates'), 0)
  return files
}

// The unlazy checker: the option, else the script next to the Stop hook in settings, else the usual places
async function findChecker($, root) {
  if (checker !== null) return checker || null
  let home = ''
  try {
    home = String((await $.env.get('HOME')) || '')
  } catch {
    home = ''
  }
  const expand = (p) => (home && p.startsWith('~/') ? home + p.slice(1) : p)
  const candidates = []
  if (checkerOption) candidates.push({ node: 'node', script: expand(checkerOption) })
  if (home) {
    const settings = (await tryRead($, join(home, '.claude/settings.json'))) || ''
    const m = settings.match(/(?:"|\s)([^"\s]*node)\s+([^"\s]+)\/scripts\/stop-hook\.mjs/)
    if (m) candidates.push({ node: expand(m[1]), script: expand(m[2]) + '/scripts/gate-check.mjs' })
    candidates.push({ node: 'node', script: join(home, '.claude/skills/unlazy/scripts/gate-check.mjs') })
  }
  candidates.push({ node: 'node', script: join(root, '.claude/skills/unlazy/scripts/gate-check.mjs') })
  for (const c of candidates) {
    try {
      if (await $.fs.exists(c.script)) {
        checker = c
        return c
      }
    } catch {
      // try the next one
    }
  }
  checker = false
  return null
}

async function runChecker($, root, scope) {
  const c = await findChecker($, root)
  if (!c) return null
  for (const node of c.node === 'node' ? ['node'] : [c.node, 'node']) {
    try {
      const r = await $.process.run([node, c.script, '--status', '--scope', scope, '--root', root], { cwd: root, timeoutMs: 10000 })
      const parsed = parseChecker(String(r.stdout || '') + '\n' + String(r.stderr || ''))
      if (parsed) return parsed
    } catch {
      // this node could not start: try plain `node` on PATH
    }
  }
  return null
}

async function scopeView($, root, scope) {
  const dir = join(root, DIR, scope)
  const markers = ['GATES.md', 'pause.json', 'BLOCKED.md', 'regression.json', 'session']
  const stamps = await Promise.all(markers.map((m) => mtime($, join(dir, m))))
  const gatesDir = await tryList($, join(dir, 'gates'))
  // The session id is in it too: whose pause it is depends on it
  const sessionId = await currentSession($)
  const fingerprint = sessionId + '|' + stamps.join(',') + '|' + gatesDir.map((e) => e.name + ':' + e.mtimeMs).join(',')
  const key = root + '\n' + scope
  const before = seen.get(key)
  if (before && before.fingerprint === fingerprint) return before.view
  const files = await ledgerFiles($, dir)
  if (!files.length) return null
  const gates = parseLedgers(files)
  const report = await runChecker($, root, scope)
  let regressed = []
  const regression = await tryRead($, join(dir, 'regression.json'))
  if (regression) {
    try {
      const ids = JSON.parse(regression).ids
      if (Array.isArray(ids)) regressed = ids.map(String)
    } catch {
      regressed = []
    }
  }
  let paused = false
  const pause = await tryRead($, join(dir, 'pause.json'))
  if (pause) {
    try {
      paused = String(JSON.parse(pause).session) === sessionId
    } catch {
      paused = false
    }
  }
  const sum = summarize(gates, report, regressed)
  const header = parseHeader(files[0].text)
  const view = {
    scope,
    heading: header.heading,
    scopeText: header.scope,
    root,
    path: join(dir, files[0].name),
    multiFile: files.length > 1,
    source: sum.source,
    total: sum.total,
    met: sum.met,
    unmet: sum.unmet,
    abandoned: sum.abandoned,
    cells: sum.cells.map((c) => ({
      qid: c.qid,
      id: c.id,
      title: c.title,
      state: c.state,
      check: c.check,
      expect: c.expect,
      cwd: c.cwd,
      evidence: c.evidence,
      ...(c.reason ? { reason: c.reason } : {}),
      ...(c.regressed ? { regressed: true } : {}),
      ...(c.abandonReason !== undefined ? { abandonReason: c.abandonReason } : {}),
    })),
    next: sum.next ? { qid: sum.next.qid, id: sum.next.id, title: sum.next.title, reason: sum.next.reason || 'unchecked' } : null,
    regressed: sum.regressed,
    blockers: sum.blockers,
    paused,
    blocked: stamps[2] > 0,
  }
  seen.set(key, { fingerprint, view })
  return view
}

async function currentSession($) {
  try {
    return String(await $.session.id())
  } catch {
    return ''
  }
}

// The scopes bound to this session, in every folder of the session
async function boundScopes($) {
  const id = (await currentSession($)).trim()
  if (!id) return []
  const out = []
  for (const root of await roots($)) {
    for (const entry of await tryList($, join(root, DIR))) {
      if (entry.kind !== 'dir' || entry.name === 'locks') continue
      const text = await tryRead($, join(root, DIR, entry.name, 'session'))
      if (text !== null && text.trim() === id) out.push({ root, scope: entry.name })
    }
  }
  return out
}

async function refresh($) {
  // One refresh at a time; a call during one waits for it instead of starting another
  if (refreshing) return refreshing
  refreshing = (async () => {
    const bound = await boundScopes($)
    const scopes = []
    for (const b of bound) {
      const v = await scopeView($, b.root, b.scope)
      if (v) scopes.push(v)
    }
    const value = { scopes }
    const json = JSON.stringify(value)
    if (json !== published) {
      published = json
      await update($, VIEW, () => value)
      $.ui.invalidate('ui.render')
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

function soon($) {
  refresh($).catch(() => {})
}

// The gate as the row and /gates name it: its own id, or the qualified one when the scope has several ledgers
function label(view, gate) {
  return view.multiFile ? gate.qid : gate.id
}

// One cell per gate in ledger order, or a proportional bar for a long ledger
function cellsOf(view) {
  if (view.cells.length && view.cells.length <= MAX_CELLS) {
    return view.cells.map((c) => (c.state === 'met' ? 'met' : c.state === 'abandoned' ? 'abandoned' : c.regressed ? 'regressed' : 'unmet'))
  }
  const total = Math.max(1, view.total)
  const met = Math.round((view.met / total) * BAR_CELLS)
  const abandoned = Math.round((view.abandoned / total) * BAR_CELLS)
  return Array.from({ length: BAR_CELLS }, (_, i) => (i < met ? 'met' : i < met + abandoned ? 'abandoned' : 'unmet'))
}

// A met gate is a filled cell in the text's own colour; an open one stays dim, so the eye counts the filled
const MARK = { met: '■', unmet: '□', regressed: '□', abandoned: '×' }
const TONE = { met: {}, unmet: { dimColor: true }, regressed: { color: 'red' }, abandoned: { color: 'yellow' } }

// The row's parts as plain strings with their style, so the width can be measured before drawing
function partsOf(view, columns) {
  if (view.unmet === 0 && view.abandoned === 0 && !view.blockers.length) {
    return { done: true, parts: [{ text: L.allMet(view.scope, view.total) }] }
  }
  const head = [{ text: `${L.gates} ${view.scope}`, dimColor: true }]
  const cells = cellsOf(view)
  let count = L.count(view.met, view.total)
  const tail = []
  if (view.abandoned) tail.push({ text: L.abandoned(view.abandoned), color: 'yellow' })
  if (view.regressed.length) tail.push({ text: L.regressed(view.regressed.join(', ')), color: 'red' })
  if (view.blocked) tail.push({ text: L.blocked, color: 'yellow' })
  else if (view.paused) tail.push({ text: L.paused, dimColor: true })
  if (view.next) {
    const id = label(view, view.next)
    const reason = L.reason[view.next.reason] || ''
    // What the row has without the title: head, cells, count, the other parts, a bar and a space each side between them
    const fixed = head[0].text.length + 1 + cells.length + 1 + count.length + tail.reduce((a, p) => a + p.text.length + 3, 0) + 3
    const prefix = L.nextTitled(id, '').length + (reason ? reason.length + 3 : 0)
    const room = columns - fixed - prefix
    const title = room >= MIN_TITLE ? clip(view.next.title, room) : ''
    const text = (title ? L.nextTitled(id, title) : L.next(id)) + (reason ? ` (${reason})` : '')
    tail.push({ text: clip(text, Math.max(L.next(id).length, columns - fixed)), dimColor: true })
  } else if (view.blockers.length) tail.push({ text: L.waves(view.blockers.length), dimColor: true })
  return { done: false, head, cells, count, tail }
}

// The pane's title: the scope when there is one, else the word
function paneTitle(scopes) {
  return scopes.length === 1 ? L.paneTitle(scopes[0].scope) : L.gates
}

// Opens the details pane, or closes it when it is already up
async function togglePane($) {
  const isUp = (await $.ui.panes()).some((pane) => pane.id === PANE)
  if (isUp) return $.ui.close({ id: PANE })
  const { scopes } = await read($, VIEW)
  await $.ui.open({ id: PANE, title: paneTitle(scopes) })
}

// The quiet button at the end of the row; the letter only on the terminal, as cache-meter's
function detailsButton($, e) {
  const { Button } = $.ui.resolve(e)
  const key = e.surface === 'terminal' ? { hotkey: 'g' } : {}
  return Button({ key: 'details', label: L.details, dimColor: true, ...key, onPress: () => togglePane($).catch(() => {}) })
}

// What the button takes from the row's width: its label, the bar and its spaces, the terminal's hotkey mark
function detailsWidth(e) {
  return L.details.length + 3 + (e.surface === 'terminal' ? 3 : 0) + 4
}

function rowOf($, e, view, withButton) {
  const { Box, Text } = $.ui.resolve(e)
  const columns = Math.max(40, Number(e.props && e.props.bodyColumns) || 100)
  const p = partsOf(view, columns - (withButton ? detailsWidth(e) : 0))
  const bar = (i) => Text({ key: `bar${i}`, dimColor: true, children: ['│'] })
  if (p.done) {
    // All is well, so only the dot is green and the words stay dim
    const line = Box({ key: 'done', flexDirection: 'row', children: [Text({ color: 'green', children: ['●'] }), Text({ dimColor: true, children: [p.parts[0].text] })] })
    const done = withButton ? [line, bar(1), detailsButton($, e)] : [line]
    return Box({ key: `gate-meter:${view.scope}`, flexDirection: 'row', columnGap: 1, children: done })
  }
  const style = ({ text, ...rest }) => Text({ ...rest, children: [text] })
  const cells = Text({ key: 'cells', children: p.cells.map((c) => Text({ ...TONE[c], children: [MARK[c]] })) })
  const first = Box({ key: 'progress', flexDirection: 'row', columnGap: 1, children: [style(p.head[0]), cells, Text({ key: 'count', children: [p.count] })] })
  const parts = [first, ...p.tail.map((t, i) => style({ key: `tail${i}`, ...t }))]
  if (withButton) parts.push(detailsButton($, e))
  // Each part is set off from the next by the same dim bar as the neighbours' rows
  const row = parts.flatMap((part, i) => (i ? [bar(i), part] : [part]))
  return Box({ key: `gate-meter:${view.scope}`, flexDirection: 'row', columnGap: 1, children: row })
}

function listText(view) {
  const lines = [L.head(view.scope, view.met, view.total), view.source === 'checker' ? L.sourceChecker : L.sourceBoxes, '']
  for (const c of view.cells) {
    const mark = c.state === 'met' ? '✓' : c.state === 'abandoned' ? '×' : '○'
    const note = c.state === 'abandoned' ? L.abandonedBecause(c.abandonReason || '') : c.state === 'unmet' ? [c.regressed ? L.regressed(label(view, c)) : '', L.reason[c.reason] || ''].filter(Boolean).join(', ') : ''
    lines.push(`${mark} ${label(view, c)}  ${clip(c.title, 140)}${note ? ` (${note})` : ''}`)
  }
  const after = []
  if (view.blocked) after.push(L.stateLine.blocked)
  else if (view.paused) after.push(L.stateLine.paused)
  if (view.regressed.length) after.push(L.regressedLine(view.regressed.join(', ')))
  if (view.blockers.length) after.push(L.wavesLine(view.blockers.join('; ')))
  after.push(L.where(view.path))
  return [...lines, '', ...after].join('\n')
}

// One gate's details, as the ledger has them: open in the pane on press
function detailsOf($, e, view, c) {
  const { Box, Text, Code } = $.ui.resolve(e)
  const lines = []
  const field = (key, name, value) => Box({ key, flexDirection: 'row', columnGap: 1, children: [Text({ dimColor: true, children: [name] }), Text({ children: [value] })] })
  lines.push(Text({ key: 'title', children: [c.title] }))
  if (c.check) {
    lines.push(Text({ key: 'check-name', dimColor: true, children: ['CHECK'] }))
    lines.push(Code({ key: 'check', source: c.check, language: 'sh' }))
    lines.push(field('expect', 'EXPECT', c.expect || '—'))
    if (c.cwd) lines.push(field('cwd', 'CWD', c.cwd))
  } else lines.push(Text({ key: 'manual', dimColor: true, children: [L.manualGate] }))
  const auto = automaticEvidence(c.evidence)
  const ev = !c.evidence || c.evidence.toLowerCase() === 'pending' ? L.evidenceNone : auto ? L.evidenceAuto(auto.exit, auto.matched) : c.evidence
  lines.push(field('evidence', L.evidenceName, ev))
  if (c.state === 'unmet') lines.push(field('why', L.whyOpen, [c.regressed ? L.regressedShort : '', L.reasonLong[c.reason] || L.reasonLong.unchecked].filter(Boolean).join(', ')))
  if (c.state === 'abandoned') lines.push(Text({ key: 'abandoned', color: 'yellow', children: [L.abandonedBecause(c.abandonReason || '')] }))
  return Box({ key: `details:${c.qid}`, flexDirection: 'column', paddingLeft: 4, children: lines })
}

// The pane: each bound scope's heading, counts and state, then its gates, each one opening on press
function paneOf($, e, scopes, expanded) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const columns = Math.max(30, Number(e.props && e.props.bodyColumns) || 60)
  if (!scopes.length) return Box({ key: 'gate-meter-pane', flexDirection: 'column', children: [Text({ dimColor: true, children: [L.noBinding] })] })
  const open = new Set(expanded)
  const toggle = (qid) => update($, EXPANDED, (list) => {
    const next = new Set(list)
    next.has(qid) ? next.delete(qid) : next.add(qid)
    return [...next]
  })
  const blocks = scopes.map((view) => {
    const rows = []
    if (view.heading) rows.push(Text({ key: 'heading', bold: true, children: [view.heading] }))
    if (view.scopeText) rows.push(Text({ key: 'scope', dimColor: true, children: [view.scopeText] }))
    rows.push(Box({ key: 'count', flexDirection: 'row', columnGap: 1, children: [Text({ children: [L.metOf(view.met, view.total)] }), Text({ dimColor: true, children: [view.source === 'checker' ? L.sourceShort.checker : L.sourceShort.boxes] })] }))
    if (view.blocked) rows.push(Text({ key: 'blocked', color: 'yellow', children: [L.stateLine.blocked] }))
    else if (view.paused) rows.push(Text({ key: 'paused', dimColor: true, children: [L.stateLine.paused] }))
    if (view.regressed.length) rows.push(Text({ key: 'regressed', color: 'red', children: [L.regressedLine(view.regressed.join(', '))] }))
    if (view.blockers.length) rows.push(Text({ key: 'waves', dimColor: true, children: [L.wavesLine(view.blockers.join('; '))] }))
    const ids = view.cells.map((c) => `${view.scope}/${c.qid}`)
    const allOpen = ids.length > 0 && ids.every((id) => open.has(id))
    rows.push(Button({
      key: `all:${view.scope}`,
      label: allOpen ? L.collapseAll : L.expandAll,
      plain: true,
      dimColor: true,
      onPress: () => update($, EXPANDED, (list) => (allOpen ? list.filter((id) => !ids.includes(id)) : [...new Set([...list, ...ids])])),
    }))
    for (const c of view.cells) {
      const id = `${view.scope}/${c.qid}`
      const isOpen = open.has(id)
      const mark = c.state === 'met' ? '✓' : c.state === 'abandoned' ? '×' : '○'
      const head = `${isOpen ? '▾' : '▸'} ${mark} ${label(view, c)}  `
      rows.push(Button({
        key: `gate:${id}`,
        label: head + clip(c.title, Math.max(8, columns - head.length - 2)),
        plain: true,
        // What is done steps back; what is left stays at full strength
        ...(c.state === 'met' ? { dimColor: true } : {}),
        onPress: () => toggle(id),
      }))
      if (isOpen) rows.push(detailsOf($, e, view, c))
    }
    rows.push(Text({ key: 'where', dimColor: true, children: [L.where(view.path)] }))
    return Box({ key: `scope:${view.scope}`, flexDirection: 'column', children: rows })
  })
  return Box({ key: 'gate-meter-pane', flexDirection: 'column', rowGap: 1, children: blocks })
}

async function registerCommand($) {
  for (const name of ['gates', 'gm-gates']) {
    try {
      await $.command.register({ name, description: L.gatesDescription })
      return name
    } catch {
      // taken: try the prefixed name
    }
  }
  return null
}

export function register(on, options) {
  language = options && options.language
  checkerOption = String((options && options.checker) || '').trim()
  if (language === 'en' || language === 'uk') L = LOCALES[language]

  on('session.start', async ($, e, next) => {
    await pickLanguage($)
    commandName = (await registerCommand($)) || commandName
    $.clock.every(TICK_EVERY, () => refresh($).catch(() => {}))
    soon($)
    return next(e)
  })

  // Claude's language changed in /config: under auto, the mods follow it
  on('config.set', async ($, e, next) => {
    const r = await next(e)
    if (isLanguageKey(e.key)) {
      await pickLanguage($)
      $.ui.invalidate('ui.render')
    }
    return r
  }).catch(($, e, next) => next(e))

  // /clear, /resume and /branch go on under another session id: another binding
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    const r = await next(e)
    soon($)
    return r
  }).catch(($, e, next) => next(e))

  // gate-check and pause.mjs run through Bash: read the scope again once the call is over.
  // A failure here must never cost the call its result: the catch hands back what next gives
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    soon($)
    return r
  }).catch(($, e, next) => next(e))

  // The prompt hook pauses and lifts pauses around a turn
  on('turn.start', async ($, e, next) => {
    soon($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) await refresh($).catch(() => {})
    return r
  })

  on('command.run', { command: ['gates', 'gm-gates'] }, async ($) => {
    if (!isLanguagePicked) await pickLanguage($)
    await refresh($).catch(() => {})
    const { scopes } = await read($, VIEW)
    return { text: scopes.length ? scopes.map(listText).join('\n\n') : L.noBinding }
  })

  // The details pane in the side panel, opened from the row's button
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (!isLanguagePicked) await pickLanguage($)
    const { scopes } = await read($, VIEW)
    return paneOf($, e, scopes, await read($, EXPANDED))
  })

  // The band above the prompt: one row per bound scope, none without a binding
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props && e.props.hasSurvey) return below
    const view = (await read($, VIEW)).scopes.slice(0, MAX_ROWS)
    if (!view.length) return below
    if (!isLanguagePicked) await pickLanguage($)
    const { Box } = $.ui.resolve(e)
    // One button for all the rows: the pane shows every bound scope
    const rows = view.map((v, i) => rowOf($, e, v, i === 0))
    const mine = rows.length === 1 ? rows[0] : Box({ key: 'gate-meter', flexDirection: 'column', children: rows })
    // Its own place in the band the mods of this repo share, whatever order they loaded in
    return joinBand(Box, 'gate-meter', mine, below)
  })
}
