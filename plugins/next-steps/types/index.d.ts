// SPDX-License-Identifier: Apache-2.0
// Modified by Yehor Hunia, 2026, from anthropics/claude-plugins-community@87c843d (next-steps).
export type Suggestion = { label: string; prompt: string }

// What is above the prompt now: nothing; the "What next?" button; a request to the model in flight; suggestions.
// The request's `id` drops a reply that came too late: after a new turn or after "hide".
export type View =
  | { kind: 'hidden' }
  | { kind: 'ready' }
  | { kind: 'loading'; id: number }
  | { kind: 'offer'; items: Suggestion[] }

// What next-steps reads from the cache-meter mod's state (`cache-meter.cache`), if that mod is installed.
// Not declared in PluginState: it is cache-meter's contract, not ours.
export type CacheMeterView = {
  kind: 'unknown' | 'warm' | 'cooling' | 'cold' | 'kept'
  isBig: boolean
  rewriteUsd: number
  // Since cache-meter 0.3.0: the tokens a re-cache writes, and whether to show them instead of dollars
  rewriteTokens?: number
  unit?: 'usd' | 'tokens'
}

declare module 'claude-code' {
  interface PluginState {
    'next-steps': {
      view: View
    }
  }
}
