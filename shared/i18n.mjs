// SPDX-License-Identifier: MIT
// The language of what a mod shows a person. The file is the same in every mod
// (scripts/sync-shared.sh puts the copy there), since a mod is also installed alone,
// without its neighbours.
//
// The mod option `language`: auto, en or uk. auto takes the language of Claude's replies
// from /config (the language row), so one Claude Code setting sets the language for all
// mods at once. A language the mods do not have, or none set, gives English.

export const LANGUAGES = ['en', 'uk']

/**
 * The mods' language for a /config value: "ukrainian", "uk" or the word in Ukrainian give uk, anything else en.
 * @param {unknown} value
 * @returns {'en' | 'uk'}
 */
export function languageOf(value) {
  const v = String(value ?? '').trim().toLowerCase()
  return /^(uk|ua)\b|ukrain|україн|укр/.test(v) ? 'uk' : 'en'
}

/**
 * The language for the mod option: en or uk as is, auto (or empty) by the language of Claude's replies.
 * The mod reads the /config rows itself ($ is not passed to functions from another file).
 * @param {unknown} option
 * @param {readonly { key: string, value: unknown }[]} rows the rows of $.config.list(), or [] when they cannot be read
 * @returns {'en' | 'uk'}
 */
export function resolveLanguage(option, rows) {
  if (option === 'en' || option === 'uk') return option
  const row = rows.find((r) => r.key === 'language') ?? rows.find((r) => isLanguageKey(r.key))
  return languageOf(row?.value)
}

/**
 * Whether a change to a /config row can change the mods' language.
 * @param {string} key
 */
export function isLanguageKey(key) {
  return !key.includes('.') && /language/i.test(key)
}
