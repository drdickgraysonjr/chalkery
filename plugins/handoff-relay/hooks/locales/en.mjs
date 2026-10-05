// SPDX-License-Identifier: MIT
// Everything handoff-relay shows a person, in English. Same keys as uk.mjs.

export default {
  button: 'Handoff',
  heavy: (k) => ` Context ${k}k, time to hand off`,
  cooling: ' Cache cools soon: handing off now is cheaper',
  cold: ' Cache is cold: the handoff costs as much as a regular message',
  pending: 'Handoff: writing the document…',
  created: 'Handoff created: ',
  nextPhase: 'next phase',
  launchHint: 'Start it with Start locally or another button on the card.',
  continueHint: 'Continue in a new session from that document.',
  failed: (error) => `Handoff did not start: ${error}`,
}
