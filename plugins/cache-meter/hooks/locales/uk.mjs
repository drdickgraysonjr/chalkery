// Усе, що cache-meter показує людині, українською. Ключі ті самі, що в en.mjs.

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

export default {
  minutes: (m) => (m <= 60 ? `${m} хв` : `${Math.floor(m / 60)} год ${String(m % 60).padStart(2, '0')} хв`),
  times: (n) => `${n} ${plural(n, 'раз', 'рази', 'разів')}`,
  pings: (n) => `${n} ${plural(n, 'пінг', 'пінги', 'пінгів')}`,
  ttlSource: { default: 'типово', measured: 'виміряно', manual: 'задано вручну' },
  limit: { five_hour: '5 год', seven_day: 'тиждень', spend_limit: 'витрати' },
  onOff: (on) => (on ? 'увімкнено' : 'вимкнено'),

  // Смуга над полем вводу
  kept: (until, pings, usd) => `◆ Тримаю кеш теплим до ${until}, ${pings} ${usd}`,
  warm: (left) => ` Кеш теплий ще ${left}`,
  cooling: (left) => `◐ Кеш охолоне за ${left}`,
  cold: (ago) => `○ Кеш охолов ${ago} тому`,
  nextRewrites: (usd) => `Наступне повідомлення перекешує ≈ ${usd}`,
  rewriteWouldCost: (usd) => `Перекешування коштуватиме ≈ ${usd}`,
  rewritten: (times, usd) => `Перекешовано ${times}: ${usd}`,
  limits: (text) => `Ліміти: ${text}`,
  keepWarm: 'Тримати теплим',
  stopKeeping: 'Не тримати',

  // Підпис у футері
  footerKept: 'кеш тримаю теплим',
  footerCooling: (left, command) => `кеш охолоне за ${left}, /${command}`,
  footerCold: (usd) => `кеш охолов, перекешування коштуватиме ≈ ${usd}`,
  footerLimits: (text) => `ліміти: ${text}`,

  // Тости
  keepingUntil: (until) => `Тримаю кеш теплим до ${until}: перед кожним охолодженням маленький запит його перечитає.`,
  stoppedKeeping: (why, pings, usd) => `Більше не тримаю кеш теплим: ${why}. Було ${pings} на ${usd}.`,
  whyTimeUp: 'вийшов час',
  whyOff: 'вимкнено',
  whyNoReply: 'пінг лишився без відповіді, тож кеш, схоже, уже охолов',
  whyWrote: (tokens) => `пінг записав ${tokens} токенів замість того, щоб прочитати кеш`,
  coolingAlert: (tokens, left, usd, command) =>
    `Кеш на ${tokens} токенів охолоне за ${left}. Перекешування коштуватиме ≈ ${usd}. Набери /${command} або натисни «Тримати теплим», щоб він не охолов.`,

  // Питання перед відправкою в охололий кеш
  send: 'Надіслати все одно',
  compact: 'Стиснути й надіслати',
  cancel: 'Скасувати',
  runHandoff: (command) => `Запустити /${command}`,
  coldQuestion: (ago, tokens, usd) =>
    `Кеш охолов ${ago} тому. Якщо надіслати зараз, ${tokens} токенів контексту запишуться в кеш заново (≈ ${usd}). Що робимо?`,
  handoffFailed: (command, error) => `Не вдалося запустити /${command}: ${error}`,
  droppedForHandoff: (command, usd) =>
    `Не надіслано: запускаю /${command}. Він один раз перекешує контекст (≈ ${usd}), зате наступна сесія почнеться з малого контексту.`,
  droppedToast: 'Не надіслано. Нова сесія з коротким хендофом обійдеться без цього перекешування.',
  dropped: 'Скасовано: cache-meter зупинив перекешування',

  // /cache і /keepwarm
  cacheDescription: 'Стан кешу промпту і налаштування cache-meter',
  keepwarmDescription: 'Тримати кеш цієї сесії теплим (типово 4 год) або /keepwarm off',
  keepwarmHint: '[години|off]',
  statusHead: (tokens, model, ttl, source) => `cache-meter: у контексті ${tokens} токенів, модель ${model}, кеш живе ${ttl} хв (${source}).`,
  statusUnknown: 'У цій сесії ще не було запиту, тож стан кешу невідомий.',
  statusWarm: (left) => `Кеш теплий ще ≈ ${left}.`,
  statusCold: (ago, usd) => `Кеш охолов ${ago} тому. Наступне повідомлення перекешує його ≈ за ${usd}.`,
  statusKept: (until, pings, usd) => `Тримаю кеш теплим до ${until}: поки що ${pings} на ${usd}.`,
  statusLimits: (text) => `Використано лімітів плану: ${text}.`,
  statusCost: (usd, times) => `Сесія поки коштувала ${usd}. Перекешовано ${times}.`,
  statusGuard: (guard, tokens, alerts) =>
    `Питання перед відправкою в охололий кеш: ${guard}, для контексту від ${tokens} токенів. Попередження: ${alerts}.`,
  statusSettings: (cache, keepwarm) =>
    `Налаштування: /${cache} ttl 5|60|auto, /${cache} guard on|off, /${cache} big 150k, /${cache} alerts on|off. Тримати теплим: /${keepwarm} [години|off].`,
}
