// Усе, що handoff-relay показує людині, українською. Ключі ті самі, що в en.mjs.

export default {
  button: 'Handoff',
  heavy: (k) => ` Контекст ${k}k, час передавати`,
  cooling: ' Кеш скоро охолоне: передавати зараз дешевше',
  cold: ' Кеш охолов: хендоф коштуватиме як звичайне повідомлення',
  pending: 'Handoff: пишу документ і картку наступної фази…',
  created: 'Handoff створено: ',
  nextPhase: 'наступна фаза',
  launchHint: 'Запускай через Start locally або іншу кнопку на картці.',
  failed: (error) => `Handoff не запустився: ${error}`,
}
