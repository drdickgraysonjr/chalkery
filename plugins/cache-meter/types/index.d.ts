// What cache-meter publishes for other mods to read. A reader must work
// without it: when cache-meter is not installed, the value is absent.
// Fields are only ever added; a reader written for an older version keeps working.
export type CacheMeterKind = 'unknown' | 'warm' | 'cooling' | 'cold' | 'kept'

export type CacheMeterCache = {
  kind: CacheMeterKind
  // Tokens in context, as the last request or measure reported them.
  ctx: number
  // ctx is at or above the /cache big threshold (150k by default).
  isBig: boolean
  // Dollars to write the whole context into the cache again, at list prices.
  // A guess for a model the price table does not list: show it only when unit is 'usd'.
  rewriteUsd: number
  ttlMin: number
  model: string
  // Tokens a re-cache writes: the whole context. Since 0.3.0.
  rewriteTokens?: number
  // How cache-meter shows amounts, and how a neighbour in the band should: 'usd' on the API
  // for a model with known prices, 'tokens' on a subscription or for an unpriced model.
  // Since 0.3.0; absent from older versions, which always showed dollars.
  unit?: 'usd' | 'tokens'
}

// cache-meter's own session record; other mods should read `cache`, not this.
export type CacheMeterSession = {
  model: string
  lastActivity: number
  ctx: number
  costUsd: number
  plan: 'unknown' | 'subscription' | 'api'
  ttlMin: number
  ttlSource: 'default' | 'subscription' | 'api' | 'measured' | 'engine'
  manualTtlMin: number
  coldRestarts: { at: number; tokens: number; usd: number; gapMin: number }[]
  working: boolean
  keepWarm: boolean
  keepWarmUntil: number
  pings: number
  pingTokens: number
  pingUsd: number
  rateLimits: { kind: string; percentUsed: number }[]
  justCompacted: boolean
  alerted: string
}

declare module 'claude-code' {
  interface PluginState {
    'cache-meter': {
      cache: CacheMeterCache
      session: Shaped<CacheMeterSession>
    }
  }
}
