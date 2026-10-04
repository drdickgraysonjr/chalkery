// Мова того, що мод показує людині. Файл однаковий у кожному моді (копію кладе
// scripts/sync-shared.sh), бо мод ставлять і окремо, без сусідів.
//
// Опція мода `language`: auto, en або uk. auto бере мову відповідей Claude з /config
// (рядок language), тож один параметр Claude Code задає мову всім модам одразу.
// Мова, якої в модів немає, або не задана, дає англійську.

export const LANGUAGES = ['en', 'uk']

/**
 * Мова модів для значення з /config: «ukrainian», «українська», «uk» дають uk, решта en.
 * @param {unknown} value
 * @returns {'en' | 'uk'}
 */
export function languageOf(value) {
  const v = String(value ?? '').trim().toLowerCase()
  return /^(uk|ua)\b|ukrain|україн|укр/.test(v) ? 'uk' : 'en'
}

/**
 * Мова для опції мода: en чи uk як є, auto (або порожньо) за мовою відповідей Claude.
 * Рядки /config мод читає сам ($ не передають у функції з іншого файлу).
 * @param {unknown} option
 * @param {readonly { key: string, value: unknown }[]} rows рядки $.config.list(), або [] коли їх не прочитати
 * @returns {'en' | 'uk'}
 */
export function resolveLanguage(option, rows) {
  if (option === 'en' || option === 'uk') return option
  const row = rows.find((r) => r.key === 'language') ?? rows.find((r) => isLanguageKey(r.key))
  return languageOf(row?.value)
}

/**
 * Чи зміна рядка /config може змінити мову модів.
 * @param {string} key
 */
export function isLanguageKey(key) {
  return !key.includes('.') && /language/i.test(key)
}
