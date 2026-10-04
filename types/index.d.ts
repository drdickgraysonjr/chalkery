export type Tokens = number | null

declare module 'claude-code' {
  interface PluginState {
    'handoff-relay': { tokens: Tokens; isPending: boolean }
  }
}
