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
// From this many gates the row draws a bar of BAR_CELLS instead of one cell per gate, as cache-meter's bar
const BAR_FROM = 15
const BAR_CELLS = 15
// From this share of met gates the filled cells turn green: the end is near
const GREEN_AT = 0.75
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

// One cell per gate in ledger order, or a proportional bar for a long ledger. Each is a mark and its style:
// a met gate is filled in the text's own colour, green once the end is near; an open one stays dim
function cellsOf(view) {
  const green = view.total > 0 && view.met / view.total >= GREEN_AT
  const filled = green ? { color: 'green' } : {}
  if (view.cells.length && view.cells.length < BAR_FROM) {
    return view.cells.map((c) =>
      c.state === 'met' ? { mark: '■', style: filled }
        : c.state === 'abandoned' ? { mark: '×', style: { color: 'yellow' } }
          : c.regressed ? { mark: '□', style: { color: 'red' } }
            : { mark: '□', style: { dimColor: true } })
  }
  const total = Math.max(1, view.total)
  let met = Math.round((view.met / total) * BAR_CELLS)
  // A started ledger shows at least one filled step, an unfinished one never a full bar
  if (view.met > 0) met = Math.max(1, met)
  if (view.met < view.total) met = Math.min(BAR_CELLS - 1, met)
  return Array.from({ length: BAR_CELLS }, (_, i) => (i < met ? { mark: '█', style: filled } : { mark: '░', style: { dimColor: true } }))
}

// The scope's states, most pressing first. Colour is carried by the dot alone; the words stay plain or dim.
// `optional` ones give way first when the row is too narrow
function statesOf(view) {
  const out = []
  if (view.blocked) out.push({ key: 'blocked', dot: '●', dotStyle: { color: 'yellow' }, text: L.blocked, line: L.stateLine.blocked })
  if (view.regressed.length) {
    const ids = view.regressed.map((qid) => shortId(view, qid))
    out.push({ key: 'regressed', dot: '●', dotStyle: { color: 'red' }, ids, text: L.regressed(ids.join(', ')), line: L.regressedLine(ids.join(', ')) })
  }
  if (view.paused && !view.blocked) out.push({ key: 'paused', dot: '◌', dotStyle: { dimColor: true }, text: L.paused, line: L.stateLine.paused, dim: true })
  if (view.abandoned) out.push({ key: 'abandoned', text: L.abandoned(view.abandoned), dim: true, optional: true })
  if (view.blockers.length) out.push({ key: 'waves', text: L.waves(view.blockers.length), line: L.wavesLine(view.blockers.join('; ')), dim: true, optional: true })
  if (view.unmet === 0 && view.abandoned === 0 && !view.blockers.length) out.push({ key: 'done', dot: '●', dotStyle: { color: 'green' }, text: L.allMet, line: L.allMetLine(view.total), dim: true })
  return out
}

// What a state takes from the row: the dot and its space, then the words
const stateWidth = (s) => (s.dot ? 2 : 0) + s.text.length

// A gate as unlazy names it in regression.json, shortened to its own id when the scope has one ledger
function shortId(view, qid) {
  return view.multiFile ? qid : String(qid).replace(/^[^:]*:/, '')
}

// The row's parts as plain strings with their style, so the width can be measured before drawing.
// The scope's name stands by the label only when several scopes share the band
function partsOf(view, columns, several) {
  const head = several ? `${L.gates} ${view.scope}` : L.gates
  const cells = cellsOf(view)
  // Without the checker the count comes from the check boxes and may miss stale evidence: say it is approximate
  const count = (view.source === 'checker' ? '' : '≈') + L.count(view.met, view.total)
  const states = statesOf(view)
  const progress = head.length + 1 + cells.length + 1 + count.length
  // The parts and a bar with a space each side between them
  const width = () => progress + states.reduce((a, s) => a + stateWidth(s) + 3, 0)
  for (let i = states.length - 1; i >= 0 && width() > columns; i--) {
    if (states[i].optional) states.splice(i, 1)
  }
  // Too many regressed gates to name: the first ones that fit, then how many more
  const regressed = states.find((s) => s.key === 'regressed')
  for (let shown = regressed ? regressed.ids.length - 1 : -1; shown >= 1 && width() > columns; shown--) {
    regressed.text = L.regressed(regressed.ids.slice(0, shown).join(', ') + ` +${regressed.ids.length - shown}`)
  }
  return { head, cells, count, states }
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

function rowOf($, e, view, withButton, several) {
  const { Box, Text } = $.ui.resolve(e)
  const columns = Math.max(40, Number(e.props && e.props.bodyColumns) || 100)
  const p = partsOf(view, columns - (withButton ? detailsWidth(e) : 0), several)
  const bar = (i) => Text({ dimColor: true, children: ['│'] })
  const cells = Text({ children: p.cells.map((c) => Text({ ...c.style, children: [c.mark] })) })
  const first = Box({ key: `progress:${view.scope}`, flexDirection: 'row', columnGap: 1, children: [Text({ dimColor: true, children: [p.head] }), cells, Text({ children: [p.count] })] })
  const states = p.states.map((s) => {
    const words = Text({ ...(s.dim ? { dimColor: true } : {}), children: [s.text] })
    return s.dot
      ? Box({ key: `state:${s.key}`, flexDirection: 'row', columnGap: 1, children: [Text({ ...s.dotStyle, children: [s.dot] }), words] })
      : Box({ key: `state:${s.key}`, flexDirection: 'row', children: [words] })
  })
  const parts = [first, ...states]
  if (withButton) parts.push(detailsButton($, e))
  // Each part is set off from the next by the same dim bar as the neighbours' rows
  const row = parts.flatMap((part, i) => (i ? [bar(i), part] : [part]))
  return Box({ key: `gate-meter:${view.scope}`, flexDirection: 'row', columnGap: 1, children: row })
}

function listText(view) {
  const lines = [L.head(view.scope, view.met, view.total), view.source === 'checker' ? L.sourceChecker : L.sourceBoxes, '']
  for (const c of view.cells) {
    const mark = c.state === 'met' ? '✓' : c.state === 'abandoned' ? '×' : '○'
    const note = c.state === 'abandoned' ? L.abandonedBecause(c.abandonReason || '') : c.state === 'unmet' ? [c.regressed ? L.regressedShort : '', L.reason[c.reason] || ''].filter(Boolean).join(', ') : ''
    lines.push(`${mark} ${label(view, c)}  ${clip(c.title, 140)}${note ? ` (${note})` : ''}`)
  }
  const after = statesOf(view).filter((s) => s.line).map((s) => s.line)
  after.push(L.where(view.path))
  return [...lines, '', ...after].join('\n')
}

// A field of an open gate: its dim name on a line of its own, the value below it
function fieldOf($, e, key, name, value) {
  const { Box, Text } = $.ui.resolve(e)
  const body = typeof value === 'string' ? Text({ wrap: 'wrap', children: [value] }) : value
  return Box({ key, flexDirection: 'column', children: [Text({ dimColor: true, children: [name] }), body] })
}

// One gate's details, as the ledger has them: open in the pane on press
function detailsOf($, e, view, c) {
  const { Box, Text, Code } = $.ui.resolve(e)
  const fields = [Text({ wrap: 'wrap', children: [c.title] })]
  if (c.check) {
    fields.push(fieldOf($, e, 'check', 'CHECK', Code({ key: 'value', source: c.check, language: 'sh' })))
    fields.push(fieldOf($, e, 'expect', 'EXPECT', c.expect || '—'))
    if (c.cwd) fields.push(fieldOf($, e, 'cwd', 'CWD', c.cwd))
  } else fields.push(Text({ dimColor: true, children: [L.manualGate] }))
  const auto = automaticEvidence(c.evidence)
  const ev = !c.evidence || c.evidence.toLowerCase() === 'pending' ? L.evidenceNone : auto ? L.evidenceAuto(auto.exit, auto.matched) : c.evidence
  fields.push(fieldOf($, e, 'evidence', L.evidenceName, ev))
  if (c.state === 'unmet') fields.push(fieldOf($, e, 'why', L.whyOpen, [c.regressed ? L.regressedShort : '', L.reasonLong[c.reason] || L.reasonLong.unchecked].filter(Boolean).join(', ')))
  if (c.state === 'abandoned') fields.push(fieldOf($, e, 'abandoned', L.whyAbandoned, c.abandonReason || '—'))
  // Indented under the gate's id, a line between the fields and a line after the last
  return Box({ key: `details:${c.qid}`, flexDirection: 'column', rowGap: 1, paddingLeft: 4, marginBottom: 1, children: fields })
}

// The pane: each bound scope's heading, its Scope as a paragraph, counts and states; then its gates, each opening on press
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
    const header = [Text({ bold: true, wrap: 'wrap', children: [view.heading || L.paneTitle(view.scope)] })]
    if (view.scopeText) header.push(Box({ key: 'scope', paddingLeft: 2, children: [Text({ dimColor: true, wrap: 'wrap', children: [view.scopeText] })] }))
    const status = [Box({ key: 'count', flexDirection: 'row', columnGap: 1, children: [Text({ children: [L.metOf(view.met, view.total)] }), Text({ dimColor: true, children: [view.source === 'checker' ? L.sourceShort.checker : L.sourceShort.boxes] })] })]
    for (const s of statesOf(view)) {
      if (!s.line) continue
      const words = Text({ wrap: 'wrap', ...(s.dim ? { dimColor: true } : {}), children: [s.line] })
      // A state without a dot keeps the words in line with those that have one
      status.push(s.dot
        ? Box({ key: `state:${s.key}`, flexDirection: 'row', columnGap: 1, children: [Text({ ...s.dotStyle, children: [s.dot] }), words] })
        : Box({ key: `state:${s.key}`, flexDirection: 'row', paddingLeft: 2, children: [words] }))
    }
    if (view.next) status.push(Text({ dimColor: true, children: [L.upNext(label(view, view.next))] }))
    header.push(Box({ key: 'status', flexDirection: 'column', children: status }))

    const ids = view.cells.map((c) => `${view.scope}/${c.qid}`)
    const allOpen = ids.length > 0 && ids.every((id) => open.has(id))
    const gates = [Button({
      key: `all:${view.scope}`,
      label: allOpen ? L.collapseAll : L.expandAll,
      plain: true,
      dimColor: true,
      onPress: () => update($, EXPANDED, (list) => (allOpen ? list.filter((id) => !ids.includes(id)) : [...new Set([...list, ...ids])])),
    })]
    // The ids stand in a column as wide as the widest, so the titles start at one place
    const idColumn = 4 + Math.max(0, ...view.cells.map((c) => label(view, c).length)) + 2
    for (const c of view.cells) {
      const id = `${view.scope}/${c.qid}`
      const isOpen = open.has(id)
      const mark = c.state === 'met' ? '✓' : c.state === 'abandoned' ? '×' : '○'
      // What is done steps back; what is left stays at full strength
      const dim = c.state === 'met' ? { dimColor: true } : {}
      gates.push(Box({
        key: `row:${id}`,
        flexDirection: 'row',
        children: [
          Box({ key: 'id', width: idColumn, flexShrink: 0, children: [Button({ key: `gate:${id}`, label: `${isOpen ? '▾' : '▸'} ${mark} ${label(view, c)}`, plain: true, ...dim, onPress: () => toggle(id) })] }),
          Button({ key: `gate-title:${id}`, label: clip(c.title, Math.max(8, columns - idColumn)), plain: true, ...dim, onPress: () => toggle(id) }),
        ],
      }))
      if (isOpen) gates.push(detailsOf($, e, view, c))
    }
    return Box({
      key: `scope:${view.scope}`,
      flexDirection: 'column',
      rowGap: 1,
      children: [...header, Box({ key: 'gates', flexDirection: 'column', children: gates }), Text({ dimColor: true, wrap: 'wrap', children: [L.where(view.path)] })],
    })
  })
  return Box({ key: 'gate-meter-pane', flexDirection: 'column', rowGap: 2, children: blocks })
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
    const rows = view.map((v, i) => rowOf($, e, v, i === 0, view.length > 1))
    const mine = rows.length === 1 ? rows[0] : Box({ key: 'gate-meter', flexDirection: 'column', children: rows })
    // Its own place in the band the mods of this repo share, whatever order they loaded in
    return joinBand(Box, 'gate-meter', mine, below)
  })
}
