// SPDX-License-Identifier: MIT
// Everything gate-meter shows a person, in English. uk.mjs has the same keys.

export default {
  // The band above the prompt
  gates: 'Gates',
  count: (met, total) => `${met} of ${total}`,
  abandoned: (n) => `${n} abandoned`,
  allMet: (scope, total) => ` Gates ${scope}: all ${total} met`,
  next: (id) => `Next ${id}`,
  nextTitled: (id, title) => `Next ${id}: ${title}`,
  reason: { unchecked: '', pending: 'no evidence yet', stale: 'evidence is stale' },
  paused: 'paused',
  blocked: 'stopped, waiting for a decision',
  regressed: (ids) => `regressed: ${ids}`,
  waves: (n) => `${n} open in dispatch`,

  // /gates
  gatesDescription: "This session's /unlazy gates: what is met and what is not",
  noBinding: 'No /unlazy gates are bound to this session. They appear here once /unlazy binds a scope to it.',
  head: (scope, met, total) => `Gates ${scope}: ${met} of ${total} met`,
  sourceChecker: 'as the unlazy checker reads them (gate-check --status), the same state the Stop hook uses',
  sourceBoxes: 'by the check boxes in the file: the unlazy checker was not found or did not answer, so stale evidence is not caught',
  abandonedBecause: (reason) => `abandoned: ${reason}`,
  stateLine: { paused: 'Paused: the human typed /handoff; any later prompt lifts the pause.', blocked: 'Stopped: BLOCKED.md is waiting for a decision.' },
  regressedLine: (ids) => `Regressed after resume: ${ids}.`,
  wavesLine: (items) => `Open in dispatch: ${items}.`,
  where: (path) => `Ledger: ${path}`,
}
