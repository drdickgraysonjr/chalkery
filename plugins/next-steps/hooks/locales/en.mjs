// SPDX-License-Identifier: Apache-2.0
// Modified by Yehor Hunia, 2026, from anthropics/claude-plugins-community@87c843d (next-steps).
// Everything next-steps shows a person, in English. Same keys as uk.mjs.

export default {
  ask: 'What next?',
  // An amount in tokens, as cache-meter shows it on a subscription.
  // Bare, as 200k: at these sizes tokens come in thousands, and no $ means they are not dollars
  tok: (tokens) => tokens,
  dismiss: 'Hide',
  loading: 'What next: thinking…',
  nothing: 'What next: the model has nothing to suggest',
  failed: (why) => `What next: ${why}`,
  fillFailed: 'Could not put the prompt into the input box',
  noReply: {
    'nothing-to-fork': 'no conversation to suggest from yet',
    'api-error': 'the API returned an error',
    'empty-reply': 'the model replied with nothing',
    aborted: 'the request was aborted',
  },
}
