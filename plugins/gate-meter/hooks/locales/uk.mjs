// SPDX-License-Identifier: MIT
// Усе, що gate-meter показує людині, українською. Ключі ті самі, що в en.mjs.

export default {
  // Смуга над полем вводу
  gates: 'Гейти',
  count: (met, total) => `${met} з ${total}`,
  abandoned: (n) => `покинуто ${n}`,
  allMet: (scope, total) => ` Гейти ${scope}: усі ${total} закрито`,
  next: (id) => `Далі ${id}`,
  nextTitled: (id, title) => `Далі ${id}: ${title}`,
  reason: { unchecked: '', pending: 'без свідчення', stale: 'свідчення застаріло' },
  paused: 'на паузі',
  blocked: 'зупинено, чекає рішення',
  regressed: (ids) => `регресія: ${ids}`,
  waves: (n) => `відкрито в диспетчері: ${n}`,

  // /gates
  gatesDescription: 'Гейти /unlazy цієї сесії: що закрито, а що ні',
  noBinding: 'До цієї сесії не привʼязано гейтів /unlazy. Вони зʼявляться тут, щойно /unlazy привʼяже до неї набір.',
  head: (scope, met, total) => `Гейти ${scope}: закрито ${met} з ${total}`,
  sourceChecker: 'так їх читає перевірник unlazy (gate-check --status), той самий стан, що бачить Stop-хук',
  sourceBoxes: 'за позначками у файлі: перевірник unlazy не знайдено або він не відповів, тож застарілі свідчення не видно',
  abandonedBecause: (reason) => `покинуто: ${reason}`,
  stateLine: { paused: 'На паузі: людина набрала /handoff; будь-який наступний промпт знімає паузу.', blocked: 'Зупинено: BLOCKED.md чекає рішення.' },
  regressedLine: (ids) => `Регресія після відновлення: ${ids}.`,
  wavesLine: (items) => `Відкрито в диспетчері: ${items}.`,
  where: (path) => `Набір: ${path}`,
}
