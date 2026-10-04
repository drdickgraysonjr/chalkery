// What cache-meter publishes for other mods to read. A reader must work
// without it: when cache-meter is not installed, the value is absent.
export type CacheMeterKind = 'unknown' | 'warm' | 'cooling' | 'cold' | 'kept'

export type CacheMeterCache = {
  kind: CacheMeterKind
  // Tokens in context, as the last request or measure reported them.
  ctx: number
  // ctx is at or above the /cache big threshold (150k by default).
  isBig: boolean
  // Dollars to write the whole context into the cache again, at list prices.
  rewriteUsd: number
  ttlMin: number
  model: string
}

declare module 'claude-code' {
  interface PluginState {
    'cache-meter': {
      cache: CacheMeterCache
    }
  }
}
