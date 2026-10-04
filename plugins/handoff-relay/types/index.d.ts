export type Tokens = number | null

// Те, що handoff-relay читає зі стану мода cache-meter (`cache-meter.cache`), якщо той встановлений.
// Не оголошуємо його в PluginState: це контракт cache-meter, а не наш.
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
      // У цьому ході працює /handoff (з кнопки чи набраний вручну).
      isHandoffTurn: boolean
      // Назва картки наступної фази, щойно її створено; тоді кнопка зникає до кінця сесії.
      handedOff: string | null
    }
  }
}
