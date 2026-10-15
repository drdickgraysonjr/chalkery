// SPDX-License-Identifier: MIT
// Усе, що gate-meter показує людині, українською. Ключі ті самі, що в en.mjs.

export default {
  // Смуга над полем вводу
  gates: 'Гейти',
  count: (met, total) => `${met} з ${total}`,
  percent: (n) => `${n} %`,
  abandoned: (n) => `покинуто ${n}`,
  allMet: 'Усі закрито',
  paused: 'На паузі',
  blocked: 'Очікує на рішення',
  regressed: (ids) => `Регресія ${ids}`,
  waves: (n) => `у диспетчері ${n}`,
  details: 'Деталі',

  // Панель деталей
  paneTitle: (scope) => `Гейти ${scope}`,
  metOf: (met, total) => `Закрито ${met} з ${total}`,
  expandAll: 'Розгорнути все',
  collapseAll: 'Згорнути все',
  groupOpen: 'Відкриті',
  groupAbandoned: 'Покинуті',
  groupMet: 'Закриті',
  howChecked: 'Як перевіряється',
  about: 'Про набір',
  status: {
    metAuto: 'Закрито автоматичною перевіркою.',
    metBy: (evidence) => `Закрито: ${evidence}`,
    unchecked: 'Ще не перевірено.',
    pending: 'Позначено як закритий, але перевірку ще не прогнано.',
    stale: 'Перевірку змінили після закриття, треба прогнати знову.',
    regressed: 'Був закритий і зламався після відновлення.',
    waitsHuman: 'Чекає на людину: ручний гейт.',
    abandoned: (reason) => `Покинуто: ${reason}`,
  },
  evidenceName: 'Свідчення',
  evidenceNone: 'ще немає',
  evidenceAuto: (exit, matched) => `автоматичне: код виходу ${exit ?? '?'}, EXPECT ${matched ? 'збігся' : 'не збігся'}`,
  regressedShort: 'зламався після відновлення',
  allMetLine: (total) => `Усі ${total} закрито.`,

  // /gates
  gatesDescription: 'Гейти /unlazy цієї сесії: що закрито, а що ні',
  noBinding: 'До цієї сесії не привʼязано гейтів /unlazy. Вони зʼявляться тут, щойно /unlazy привʼяже до неї набір.',
  head: (scope, met, total) => `Гейти ${scope}: закрито ${met} з ${total}`,
  sourceChecker: 'так їх читає перевірник unlazy (gate-check --status), той самий стан, що бачить Stop-хук',
  sourceBoxes: 'за позначками у файлі: перевірник unlazy не знайдено або він не відповів, тож застарілі свідчення не видно',
  reason: { unchecked: '', pending: 'без свідчення', stale: 'свідчення застаріло' },
  abandonedBecause: (reason) => `покинуто: ${reason}`,
  stateLine: { paused: 'На паузі після /handoff: будь-який наступний промпт знімає паузу.', blocked: 'Очікує на рішення: причина й варіант у BLOCKED.md.' },
  regressedLine: (ids) => `Регресія після відновлення: ${ids}.`,
  wavesLine: (items) => `Відкрито в диспетчері: ${items}.`,
  where: (path) => `Набір: ${path}`,
}
