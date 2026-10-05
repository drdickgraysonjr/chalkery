// Усе, що cache-meter показує людині, українською. Ключі ті самі, що в en.mjs.

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

// A sentence that ends in an amount in tokens ends with the unit's own dot
const dot = (text) => (text.endsWith('.') ? text : text + '.')

export default {
  minutes: (m) => (m <= 60 ? `${m} хв` : `${Math.floor(m / 60)} год ${String(m % 60).padStart(2, '0')} хв`),
  times: (n) => `${n} ${plural(n, 'раз', 'рази', 'разів')}`,
  pings: (n) => `${n} ${plural(n, 'пінг', 'пінги', 'пінгів')}`,
  ttlSource: { default: 'типово', subscription: 'підписка', api: 'API', measured: 'виміряно', engine: 'від рушія', manual: 'задано вручну на цю сесію' },
  // An amount in tokens, where dollars would not be real: on a subscription or for a model without prices
  tok: (tokens) => `${tokens} ток.`,
  apiEquivalent: (usd) => `API-еквівалент ${usd}`,
  unpricedModel: (model) => `${model}, ціни невідомі`,
  limit: { five_hour: '5 год', seven_day: 'тиждень', spend_limit: 'витрати' },
  onOff: (on) => (on ? 'увімкнено' : 'вимкнено'),

  // Смуга над полем вводу
  kept: (until, pings, amount) => `◆ Тримаю кеш теплим до ${until}, ${pings} ${amount}`,
  warm: (left) => ` Кеш теплий ще ${left}`,
  cooling: (left) => `◐ Кеш охолоне за ${left}`,
  cold: (ago) => `○ Кеш охолов ${ago} тому`,
  nextRewrites: (amount) => `Наступне повідомлення перекешує ≈ ${amount}`,
  rewriteWouldCost: (amount) => `Перекешування коштуватиме ≈ ${amount}`,
  rewritten: (times, amount) => `Перекешовано ${times}: ${amount}`,
  limits: (text) => `Ліміти: ${text}`,
  keepWarm: 'Тримати теплим',
  stopKeeping: 'Не тримати',

  // Підпис у футері
  footerKept: 'кеш тримаю теплим',
  footerCooling: (left, command) => `кеш охолоне за ${left}, /${command}`,
  footerCold: (amount) => `кеш охолов, перекешування коштуватиме ≈ ${amount}`,
  footerLimits: (text) => `ліміти: ${text}`,

  // Тости
  keepingUntil: (until, pings, each) => dot(`Тримаю кеш теплим до ${until}: ≈ ${pings}, кожен ${each}`),
  keepingNoPing: (until) => `Тримаю кеш теплим до ${until}: стільки він протримається й без пінгу.`,
  eachReads: (amount) => `читає ≈ ${amount}`,
  eachCosts: (usd) => `коштує ≈ ${usd}`,
  notKeeping: (limits) => `Не тримаю кеш теплим: ліміт плану вже від 90% (${limits}), а кожен пінг витрачав би його далі.`,
  stoppedKeeping: (why, pings, amount) => dot(`Більше не тримаю кеш теплим: ${why}. Було ${pings} на ${amount}`),
  whyTimeUp: 'вийшов час',
  whyOff: 'вимкнено',
  whyNoReply: 'пінг лишився без відповіді, тож кеш, схоже, уже охолов',
  whyWrote: (tokens) => `пінг записав ${tokens} токенів замість того, щоб прочитати кеш`,
  whyLimit: (limits) => `ліміт плану дійшов до 90% (${limits})`,
  coolingAlert: (tokens, left, amount, command) =>
    `Кеш на ${tokens} токенів охолоне за ${left}. Перекешування коштуватиме ≈ ${amount}. Набери /${command} або натисни «Тримати теплим», щоб він не охолов.`,

  // Питання перед відправкою в охололий кеш
  send: 'Надіслати все одно',
  compact: 'Стиснути й надіслати',
  cancel: 'Скасувати',
  runHandoff: (command) => `Запустити /${command}`,
  // usd is null where dollars would not be real; the token count already says how much
  coldQuestion: (ago, tokens, usd) =>
    `Кеш охолов ${ago} тому. Якщо надіслати зараз, ${tokens} токенів контексту запишуться в кеш заново${usd ? ` (≈ ${usd})` : ''}. Що робимо?`,
  handoffFailed: (command, error) => `Не вдалося запустити /${command}: ${error}`,
  droppedForHandoff: (command, amount) =>
    `Не надіслано: запускаю /${command}. Він один раз перекешує контекст (≈ ${amount}), зате наступна сесія почнеться з малого контексту.`,
  droppedToast: 'Не надіслано. Нова сесія з коротким хендофом обійдеться без цього перекешування.',
  dropped: 'Скасовано: cache-meter зупинив перекешування',

  // /cache і /keepwarm
  cacheDescription: 'Стан кешу промпту і налаштування cache-meter',
  keepwarmDescription: 'Тримати кеш цієї сесії теплим (типово 4 год) або /keepwarm off',
  keepwarmHint: '[години|off]',
  statusHead: (tokens, model, ttl, source) => `cache-meter: у контексті ${tokens} токенів, модель ${model}, кеш живе ${ttl} хв (${source}).`,
  statusUnknown: 'У цій сесії ще не було запиту, тож стан кешу невідомий.',
  statusWarm: (left) => `Кеш теплий ще ≈ ${left}.`,
  statusCold: (ago, amount) => dot(`Кеш охолов ${ago} тому. Наступне повідомлення перекешує його: ≈ ${amount}`),
  statusKept: (until, pings, amount) => dot(`Тримаю кеш теплим до ${until}: поки що ${pings}, ≈ ${amount}`),
  statusLimits: (text) => `Використано лімітів плану: ${text}.`,
  statusCost: (cost, times) => `Вартість сесії поки: ${cost}. Перекешовано ${times}.`,
  statusRestarts: (times) => `Перекешовано ${times}.`,
  statusGuard: (guard, tokens, alerts) =>
    `Питання перед відправкою в охололий кеш: ${guard}, для контексту від ${tokens} токенів. Попередження: ${alerts}.`,
  statusSettings: (cache, keepwarm) =>
    `Налаштування: /${cache} ttl 5|60|auto, /${cache} guard on|off, /${cache} big 150k, /${cache} alerts on|off. Тримати теплим: /${keepwarm} [години|off].`,
}
