// SPDX-License-Identifier: Apache-2.0
// Modified by Yehor Hunia, 2026, from anthropics/claude-plugins-community@87c843d (next-steps).
// Усе, що next-steps показує людині, українською. Ключі ті самі, що в en.mjs.

export default {
  ask: 'Що далі?',
  // An amount in tokens, as cache-meter shows it on a subscription.
  // Bare, as 200k: at these sizes tokens come in thousands, and no $ means they are not dollars
  tok: (tokens) => tokens,
  dismiss: 'Сховати',
  loading: 'Що далі: підбираю…',
  nothing: 'Що далі: модель не має що запропонувати',
  failed: (why) => `Що далі: ${why}`,
  fillFailed: 'Не вдалося вставити промпт у поле вводу',
  noReply: {
    'nothing-to-fork': 'ще немає розмови, з якої підбирати',
    'api-error': 'API відповів помилкою',
    'empty-reply': 'модель відповіла порожньо',
    aborted: 'запит перервано',
  },
}
