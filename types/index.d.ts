export type Suggestion = { label: string; prompt: string }

// Що зараз над полем вводу: нічого; кнопка «Що далі?»; запит до моделі в дорозі; пропозиції.
// `id` запиту відсіює відповідь, що прийшла запізно: після нового ходу чи після «сховати».
export type View =
  | { kind: 'hidden' }
  | { kind: 'ready' }
  | { kind: 'loading'; id: number }
  | { kind: 'offer'; items: Suggestion[] }

// Те, що next-steps читає зі стану мода cache-meter (`cache-meter.cache`), якщо той встановлений.
// Не оголошуємо його в PluginState: це контракт cache-meter, а не наш.
export type CacheMeterView = {
  kind: 'unknown' | 'warm' | 'cooling' | 'cold' | 'kept'
  isBig: boolean
  rewriteUsd: number
}

declare module 'claude-code' {
  interface PluginState {
    'next-steps': {
      view: View
    }
  }
}
