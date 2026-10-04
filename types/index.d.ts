export type Tokens = number | null

declare module 'claude-code' {
  interface PluginState {
    'handoff-relay': {
      tokens: Tokens
      isPending: boolean
      // У цьому ході працює /handoff (з кнопки чи набраний вручну).
      isHandoffTurn: boolean
      // Назва картки наступної фази, щойно її створено; тоді кнопка зникає до кінця сесії.
      handedOff: string | null
    }
  }
}
