export type Tokens = number | null

// The phase handed off: the card's title, or the document's name when no card was made.
export type HandedOff = { title: string; hasCard: boolean } | null

// What handoff-relay reads from cache-meter's state (`cache-meter.cache`) when that mod is installed.
// Not declared in PluginState: it is cache-meter's contract, not ours.
export type CacheMeterView = {
  kind: 'unknown' | 'warm' | 'cooling' | 'cold' | 'kept'
  isBig: boolean
  rewriteUsd: number
}

declare module 'claude-code' {
  interface PluginState {
    'handoff-relay': {
      tokens: Tokens
      isPending: boolean
      // /handoff runs in this turn (from the button, typed by hand, or called by the model).
      isHandoffTurn: boolean
      // The first .md file written during the handoff turn, by name; it hands off once the turn answers.
      writtenDoc: string | null
      // Set once the phase is handed off; the button is gone for the rest of the session.
      handedOff: HandedOff
    }
  }
}
