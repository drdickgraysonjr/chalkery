// Усе, що next-steps показує людині, українською. Ключі ті самі, що в en.mjs.

export default {
  ask: 'Що далі?',
  // An amount in tokens, as cache-meter shows it on a subscription
  tok: (tokens) => `${tokens} ток.`,
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
