// SPDX-License-Identifier: MIT
// Reading /unlazy gate ledgers without running anything. Pure functions: no $, so the
// checks of this repository can import the file from Node and hold it against the real
// checker on real ledgers.
//
// Two sources, one answer. The checker's `gate-check.mjs --status` is the truth: the
// Stop hook uses the same state model, and only it can tell current automatic evidence
// from stale. The ledger files themselves give the titles, the order and a fallback count
// by their check boxes when the checker cannot be run.

// The gate line and its attributes, as unlazy's parser reads them
const GATE_RE = /^- \[( |x|X)\] (.*)$/
const ATTR_RE = /^\s+(CHECK|EXPECT|EVIDENCE|CWD):\s?(.*)$/
const ABANDON_RE = /^ABANDON:\s*(\S*)\s*(.*)$/
const FENCE_OPEN_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/

/** The file stem the checker qualifies ids with: GATES.md gives GATES. */
export function stemOf(name) {
  return String(name).split('/').pop().replace(/\.md$/i, '')
}

/**
 * The gates of one ledger file, in file order.
 * @param {string} name the file's name, for qualified ids
 * @param {string} text
 */
export function parseLedger(name, text) {
  const stem = stemOf(name)
  const gates = []
  const abandoned = new Map()
  let current = null
  let fence = null
  for (const line of String(text).split(/\r?\n/)) {
    if (fence) {
      const close = line.match(/^( {0,3})(`+|~+)[ \t]*$/)
      if (close && close[2][0] === fence.character && close[2].length >= fence.length) fence = null
      continue
    }
    const open = line.match(FENCE_OPEN_RE)
    if (open && !(open[2][0] === '`' && open[3].includes('`'))) {
      fence = { character: open[2][0], length: open[2].length }
      continue
    }
    const gate = line.match(GATE_RE)
    if (gate) {
      const raw = gate[2].trim()
      const idMatch = raw.match(/^(\S+?):(?:\s+|$)/)
      if (!idMatch) {
        current = null
        continue
      }
      current = {
        id: idMatch[1],
        qid: stem + ':' + idMatch[1],
        title: raw.slice(idMatch[0].length).trim(),
        checked: gate[1].toLowerCase() === 'x',
        runnable: false,
        evidence: '',
        check: '',
        expect: '',
        cwd: '',
      }
      gates.push(current)
      continue
    }
    const abandon = line.match(ABANDON_RE)
    if (abandon && abandon[1]) {
      abandoned.set(abandon[1], abandon[2].trim())
      continue
    }
    const attr = current && line.match(ATTR_RE)
    if (attr) {
      if (attr[1] === 'CHECK') {
        current.runnable = true
        current.check = attr[2].trim()
      }
      if (attr[1] === 'EXPECT') current.expect = attr[2].trim()
      if (attr[1] === 'CWD') current.cwd = attr[2].trim()
      if (attr[1] === 'EVIDENCE') current.evidence = attr[2].trim()
    }
  }
  return gates.map((g) => (abandoned.has(g.id) ? { ...g, abandonReason: abandoned.get(g.id) } : g))
}

/**
 * What a ledger says about itself before its first gate: the `# Gates:` heading and the `Scope:` line.
 * @param {string} text
 */
export function parseHeader(text) {
  let heading = ''
  let scope = ''
  for (const line of String(text).split(/\r?\n/)) {
    if (GATE_RE.test(line)) break
    const h = line.match(/^#\s+(?:Gates:\s*)?(.+)$/)
    if (h && !heading) heading = h[1].trim()
    const sc = line.match(/^Scope:\s*(.+)$/)
    if (sc && !scope) scope = sc[1].trim()
  }
  return { heading, scope }
}

/**
 * Automatic evidence in a few words: its exit code and whether EXPECT matched; null for a person's note.
 * @param {string} evidence
 */
export function automaticEvidence(evidence) {
  const ev = String(evidence)
  if (!ev.startsWith('automatic-evidence=v1')) return null
  const exit = (ev.match(/(?:^|;\s*)exit=(\d+)/) || [])[1]
  return { exit: exit === undefined ? null : Number(exit), matched: /EXPECT=matched/.test(ev) }
}

/**
 * The gates of every ledger of a scope, GATES.md first, as the checker orders them.
 * @param {{ name: string, text: string }[]} files
 */
export function parseLedgers(files) {
  return files.flatMap((f) => parseLedger(f.name, f.text))
}

// A gate's state by its check box and evidence alone: what the fallback can see.
// Without the checker a runnable gate's evidence cannot be bound to its definition, so
// any automatic v1 evidence counts; a checked gate with pending or blank evidence does not.
function boxState(g) {
  if (g.abandonReason !== undefined) return 'abandoned'
  if (!g.checked) return 'unmet'
  const ev = g.evidence.trim().toLowerCase()
  if (!ev || ev === 'pending') return 'unmet'
  if (g.runnable && !ev.startsWith('automatic-evidence=v1')) return 'unmet'
  return 'met'
}

// One unmet gate in --status: "  UNMET GATES:G3 (unchecked): the title"
const UNMET_LINE = /^ {2}UNMET (\S+) \((unchecked|checked but EVIDENCE pending|checked but automatic evidence is stale or unbound)\): ?(.*)$/
const REASONS = {
  unchecked: 'unchecked',
  'checked but EVIDENCE pending': 'pending',
  'checked but automatic evidence is stale or unbound': 'stale',
}

/**
 * The checker's --status output, read back: the counts and each unmet gate with its reason.
 * Null when the output is not a status report (no summary line).
 * @param {string} out stdout and stderr of `gate-check.mjs --status`
 */
export function parseChecker(out) {
  const text = String(out)
  const unmetGates = []
  const blockers = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(UNMET_LINE)
    if (m) unmetGates.push({ qid: m[1], reason: REASONS[m[2]], title: m[3] })
    else if (/^ {2}UNMET \S/.test(line)) blockers.push(line.slice(8).trim())
  }
  const all = text.match(/^ALL MET \((\d+) met/m)
  if (all) return { met: Number(all[1]), unmet: 0, abandoned: 0, unmetGates, blockers }
  const handoff = text.match(/^HANDOFF REQUIRED: (\d+) abandoned \(met: (\d+)(?:, unmet: (\d+))?/m)
  const unmet = text.match(/^UNMET: (\d+) \(met: (\d+)/m)
  if (!handoff && !unmet) return null
  return {
    met: Number((handoff || unmet)[2]),
    unmet: unmet ? Number(unmet[1]) : Number((handoff && handoff[3]) || 0),
    abandoned: handoff ? Number(handoff[1]) : 0,
    unmetGates,
    blockers,
  }
}

/**
 * What the band and /gates show for one scope.
 * With the checker's report, its counts and unmet set win; without it, the boxes decide.
 * @param {ReturnType<typeof parseLedgers>} gates
 * @param {ReturnType<typeof parseChecker>} checker
 * @param {string[]} [regressed] qualified ids pause.mjs resume found broken
 */
export function summarize(gates, checker, regressed = []) {
  const unmetBy = new Map((checker ? checker.unmetGates : []).map((u) => [u.qid, u]))
  const cells = gates.map((g) => {
    if (g.abandonReason !== undefined) return { ...g, state: 'abandoned' }
    if (checker) return unmetBy.has(g.qid) ? { ...g, state: 'unmet', reason: unmetBy.get(g.qid).reason } : { ...g, state: 'met' }
    const state = boxState(g)
    return state === 'unmet' ? { ...g, state, reason: g.checked ? 'pending' : 'unchecked' } : { ...g, state }
  })
  const regressedSet = new Set(regressed)
  for (const c of cells) if (c.state === 'unmet' && regressedSet.has(c.qid)) c.regressed = true
  const count = (s) => cells.filter((c) => c.state === s).length
  const met = checker ? checker.met : count('met')
  const unmet = checker ? checker.unmet : count('unmet')
  const abandoned = checker ? checker.abandoned : count('abandoned')
  const next = cells.find((c) => c.state === 'unmet') || null
  return {
    source: checker ? 'checker' : 'boxes',
    total: met + unmet + abandoned,
    met,
    unmet,
    abandoned,
    cells,
    next,
    regressed: cells.filter((c) => c.regressed).map((c) => c.qid),
    blockers: checker ? checker.blockers : [],
  }
}

/** Text cut to `max` characters, an ellipsis at the end when cut. */
export function clip(text, max) {
  const s = String(text).replace(/\s+/g, ' ').trim()
  if (max <= 1) return s.slice(0, Math.max(0, max))
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'
}

const capital = (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1)
// Inline code marks say nothing to a person reading the pane
const plain = (s) => String(s).replace(/`([^`]*)`/g, '$1').replace(/\s+/g, ' ').trim()
// A gate title's lead before its separator is its name when it is this short
const MAX_NAME = 60
// What parts a gate's short name from its details: a spaced dash, or a colon as in older titles
const DASHES = [' — ', ' – ']
const OPEN = '«(['
const CLOSE = '»)]'

/**
 * Where a title's short name ends: at the first spaced dash or colon outside quotes and brackets,
 * whichever comes first, so a name may quote «a word» and a colon written later in the details
 * does not cut it. Returns the separator's start and length, or null without one.
 * @param {string} text
 */
function nameEnd(text) {
  let depth = 0
  let straight = false
  for (let i = 0; i < text.length && i <= MAX_NAME; i++) {
    const ch = text[i]
    if (ch === '"') straight = !straight
    else if (OPEN.includes(ch)) depth++
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1)
    if (depth > 0 || straight || i === 0) continue
    const dash = DASHES.find((d) => text.startsWith(d, i))
    if (dash) return { at: i, length: dash.length }
    if (ch === ':' && /\s/.test(text[i + 1] ?? '')) return { at: i, length: 1 }
  }
  return null
}

/**
 * A gate title as a short name and the rest of its sentence: the part before its first spaced dash
 * (or colon) when there is a short one, capitalised, and what follows it; without one, the whole
 * title and no rest.
 * @param {string} title
 */
export function splitTitle(title) {
  const text = plain(title)
  const end = nameEnd(text)
  if (end) {
    return { name: capital(text.slice(0, end.at).trim()), rest: capital(text.slice(end.at + end.length).trim()) }
  }
  return { name: capital(text), rest: '' }
}

/**
 * The first sentence of the option BLOCKED.md recommends: what the stop is waiting for, in its own words.
 * @param {string} text
 */
export function bestOption(text) {
  const lines = String(text).split(/\r?\n/)
  const at = lines.findIndex((l) => /^##\s+(Найкращий варіант|Best option)\s*$/i.test(l))
  if (at < 0) return ''
  const body = []
  for (const line of lines.slice(at + 1)) {
    if (/^##\s/.test(line)) break
    if (line.trim()) body.push(line.trim())
  }
  const para = plain(body.join(' '))
  const first = para.match(/^.+?[.!?](?=\s|$)/)
  return first ? first[0] : para
}
