// Everything next-steps shows a person, in English. Same keys as uk.mjs.

export default {
  ask: 'What next?',
  // An amount in tokens, as cache-meter shows it on a subscription
  tok: (tokens) => `${tokens} tok`,
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
