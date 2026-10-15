// SPDX-License-Identifier: MIT
// What gate-meter publishes for other mods to read. A reader must work without it:
// when gate-meter is not installed, the value is absent.
// Fields are only ever added; a reader written for an older version keeps working.
export type GateMeterState = 'met' | 'unmet' | 'abandoned'

export type GateMeterGate = {
  // The id qualified with its ledger's file stem, as unlazy reports it: GATES:G3.
  qid: string
  id: string
  title: string
  state: GateMeterState
  // Why an open gate is open: not checked yet, checked without evidence, or evidence older than its definition.
  reason?: 'unchecked' | 'pending' | 'stale'
  // Was met before `pause.mjs resume` and is not now.
  regressed?: boolean
  abandonReason?: string
  // The ledger's own lines for the gate, empty when absent.
  check?: string
  expect?: string
  cwd?: string
  evidence?: string
}

export type GateMeterScope = {
  scope: string
  // The first ledger's `# Gates:` heading and `Scope:` line, empty when absent.
  heading?: string
  scopeText?: string
  // The folder that holds .unlazy/.
  root: string
  // The scope's first ledger file.
  path: string
  multiFile: boolean
  // 'checker' when the counts come from `gate-check.mjs --status`, 'boxes' when from the ledger's check boxes.
  source: 'checker' | 'boxes'
  total: number
  met: number
  unmet: number
  abandoned: number
  cells: GateMeterGate[]
  next: { qid: string; id: string; title: string; reason: 'unchecked' | 'pending' | 'stale' } | null
  regressed: string[]
  // Open dispatch waves the checker counts as unmet, as it words them.
  blockers: string[]
  paused: boolean
  blocked: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'gate-meter': {
      // The scopes bound to this session, at most a few; empty without a binding.
      view: { scopes: GateMeterScope[] }
      // Gates opened in the details pane, as `<scope>/<qualified id>`.
      expanded: string[]
    }
  }
}
