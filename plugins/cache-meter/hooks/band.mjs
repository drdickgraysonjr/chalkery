// SPDX-License-Identifier: MIT
// The shared band above the prompt for this repository's mods. The file is the same in
// every mod (scripts/sync-shared.sh puts the copy there), since a mod is also installed
// alone, without its neighbours.
//
// The engine chains ui.render hooks, and the order of plugins in the chain is not
// documented: it depends on how and in what order they were installed. So a mod does not
// put its row "above" or "below" whatever came from further down; it places it in a shared
// column by its own slot. Whoever is on top of the chain, the band comes out the same:
// Handoff, cache, "What next?".

export const BAND = 'prompt-band'
const ROW = 'prompt-band-row:'

// A row's slot in the band. Anything foreign (the engine's row or a mod from elsewhere) goes below ours.
export const PLACE = { 'handoff-relay': 10, 'cache-meter': 20, 'next-steps': 30 }
const FOREIGN = 999

/** @param {any} row */
function placeOf(row) {
  const key = row && typeof row === 'object' && row.props ? String(row.props.key ?? '') : ''
  return key.startsWith(ROW) ? Number(key.slice(ROW.length).split(':')[0]) : FOREIGN
}

// The rows already in the band below us, or whatever someone else drew.
/** @param {(props: any) => any} Box @param {any} below @returns {any[]} */
function rowsOf(Box, below) {
  if (below === null || below === undefined || below === false) return []
  if (typeof below === 'object' && below.type === 'Box' && below.props && below.props.key === BAND) {
    return [...(below.children ?? [])]
  }
  return [Box({ key: `${ROW}${FOREIGN}:other`, flexDirection: 'column', children: [below] })]
}

// The band with mod `name`'s row in its slot. Half a line between rows: a whole one looks like an empty paragraph.
/**
 * @param {(props: any) => any} Box the column from the surface's table, $.ui.resolve(e).Box
 * @param {'handoff-relay' | 'cache-meter' | 'next-steps'} name
 * @param {any} mine this mod's row
 * @param {any} below what next(e) returned
 * @returns {any}
 */
export function joinBand(Box, name, mine, below) {
  const rows = rowsOf(Box, below)
  rows.push(Box({ key: `${ROW}${PLACE[name]}:${name}`, flexDirection: 'column', children: [mine] }))
  rows.sort((a, b) => placeOf(a) - placeOf(b))
  return Box({ key: BAND, flexDirection: 'column', rowGap: 0.5, children: rows })
}
