// SPDX-License-Identifier: MIT
// Everything gate-meter shows a person, in English. uk.mjs has the same keys.

export default {
  // The band above the prompt
  gates: 'Gates',
  count: (met, total) => `${met} of ${total}`,
  abandoned: (n) => `${n} abandoned`,
  allMet: 'All met',
  paused: 'Paused',
  blocked: 'Waiting for a decision',
  regressed: (ids) => `Regressed ${ids}`,
  waves: (n) => `${n} in dispatch`,
  details: 'Details',

  // The details pane
  paneTitle: (scope) => `Gates ${scope}`,
  metOf: (met, total) => `${met} of ${total} met`,
  sourceShort: { checker: 'by the unlazy checker', boxes: 'by the check boxes in the file' },
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  manualGate: 'A manual gate: a person decides it',
  evidenceName: 'Evidence',
  evidenceNone: 'none yet',
  evidenceAuto: (exit, matched) => `automatic: exit ${exit ?? '?'}, EXPECT ${matched ? 'matched' : 'did not match'}`,
  whyOpen: 'Open because',
  whyAbandoned: 'Abandoned because',
  upNext: (id) => `First open: ${id}`,
  allMetLine: (total) => `All ${total} met.`,
  reasonLong: { unchecked: 'not checked yet', pending: 'the box is ticked but there is no evidence', stale: 'the evidence no longer matches the definition' },
  regressedShort: 'broke on resume',

  // /gates
  gatesDescription: "This session's /unlazy gates: what is met and what is not",
  noBinding: 'No /unlazy gates are bound to this session. They appear here once /unlazy binds a scope to it.',
  head: (scope, met, total) => `Gates ${scope}: ${met} of ${total} met`,
  sourceChecker: 'as the unlazy checker reads them (gate-check --status), the same state the Stop hook uses',
  sourceBoxes: 'by the check boxes in the file: the unlazy checker was not found or did not answer, so stale evidence is not caught',
  reason: { unchecked: '', pending: 'no evidence yet', stale: 'evidence is stale' },
  abandonedBecause: (reason) => `abandoned: ${reason}`,
  stateLine: { paused: 'Paused after /handoff: any later prompt lifts the pause.', blocked: 'Waiting for a decision: the reason and the option are in BLOCKED.md.' },
  regressedLine: (ids) => `Regressed after resume: ${ids}.`,
  wavesLine: (items) => `Open in dispatch: ${items}.`,
  where: (path) => `Ledger: ${path}`,
}
