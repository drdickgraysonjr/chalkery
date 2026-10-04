// Спільна смуга над полем вводу для модів цього репозиторію. Файл однаковий у кожному
// моді (копію кладе scripts/sync-shared.sh), бо мод ставлять і окремо, без сусідів.
//
// Рушій складає хуки ui.render ланцюжком, і порядок плагінів у ланцюжку не задокументований:
// він залежить від того, як і в якому порядку їх встановили. Тому кожен мод не ставить свій
// рядок «над» чи «під» тим, що прийшло знизу, а вкладає його в спільний стовпець за своїм
// місцем. Хто б не був зверху ланцюжка, смуга виходить однакова: Handoff, кеш, «Що далі?».

export const BAND = 'prompt-band'
const ROW = 'prompt-band-row:'

// Місце рядка в смузі. Чуже (рядок рушія чи мода не з цього репо) стоїть під нашими.
export const PLACE = { 'handoff-relay': 10, 'cache-meter': 20, 'next-steps': 30 }
const FOREIGN = 999

/** @param {any} row */
function placeOf(row) {
  const key = row && typeof row === 'object' && row.props ? String(row.props.key ?? '') : ''
  return key.startsWith(ROW) ? Number(key.slice(ROW.length).split(':')[0]) : FOREIGN
}

// Рядки, які вже лежать у смузі під нами, або те, що намалював хтось інший.
/** @param {(props: any) => any} Box @param {any} below @returns {any[]} */
function rowsOf(Box, below) {
  if (below === null || below === undefined || below === false) return []
  if (typeof below === 'object' && below.type === 'Box' && below.props && below.props.key === BAND) {
    return [...(below.children ?? [])]
  }
  return [Box({ key: `${ROW}${FOREIGN}:other`, flexDirection: 'column', children: [below] })]
}

// Смуга з рядком мода `name` на своєму місці. Пів рядка між рядками: цілий виглядає як порожній абзац.
/**
 * @param {(props: any) => any} Box стовпець із таблиці поверхні, $.ui.resolve(e).Box
 * @param {'handoff-relay' | 'cache-meter' | 'next-steps'} name
 * @param {any} mine рядок цього мода
 * @param {any} below те, що повернув next(e)
 * @returns {any}
 */
export function joinBand(Box, name, mine, below) {
  const rows = rowsOf(Box, below)
  rows.push(Box({ key: `${ROW}${PLACE[name]}:${name}`, flexDirection: 'column', children: [mine] }))
  rows.sort((a, b) => placeOf(a) - placeOf(b))
  return Box({ key: BAND, flexDirection: 'column', rowGap: 0.5, children: rows })
}
