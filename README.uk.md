# chalkery

[English](README.md) | Українська

Chalkery — місце, де лежить крейда: дім для модів Claude Code, які малюють над полем вводу.

Три моди для Claude Code, які малюють смугу над полем вводу. Працюють у терміналі й у вкладці Code десктопного застосунку.

| Мод | Що робить |
| --- | --- |
| `handoff-relay` | Кнопка Handoff запускає `/handoff`. Від 180k токенів контексту вона підсвічується. |
| `cache-meter` | Показує, скільки ще кеш промпту лишатиметься теплим і скільки коштуватиме перекешування. «Тримати теплим» не дає кешу охолонути. Перед відправкою в охололий великий кеш мод питає підтвердження. |
| `next-steps` | Кнопка «Що далі?» пропонує до трьох наступних промптів. Обраний промпт стає чернеткою в полі вводу, Enter натискаєте ви. |

Моди можна ставити окремо або всі разом. У будь-якому поєднанні вони складаються в одну смугу з тим самим порядком рядків: Handoff, кеш, «Що далі?».

## Встановлення

Спершу додайте маркетплейс:

```bash
claude plugin marketplace add drdickgraysonjr/chalkery
```

Усі три моди однією командою. Пак називається primaries: три моди, як три основні кольори.

```bash
claude plugin install primaries@chalkery
```

Або лише потрібний:

```bash
claude plugin install cache-meter@chalkery
```

У десктопному застосунку те саме є в меню Plugins → Add plugin: вкладка Marketplaces, потім Add marketplace. Моди починають працювати з наступної сесії.

Коли виходить нова версія, спершу оновіть каталог, потім кожен встановлений мод:

```bash
claude plugin marketplace update chalkery
```

```bash
claude plugin update cache-meter@chalkery
```

Видалити пак: `claude plugin uninstall primaries@chalkery`. Три моди, які він поставив, після цього лишаються встановленими. Щоб прибрати і їх, виконайте `claude plugin prune`.

## Мова

Моди говорять англійською й українською. Кожен має опцію `language` зі значеннями `auto` (за замовчуванням), `en` або `uk`. З `auto` моди беруть мову відповідей Claude з `/config`, тож одне налаштування діє на всі три. Якщо мову там не задано або модам вона невідома, вони показують англійську. Задати мову явно можна в `/config` або одразу при встановленні:

```bash
claude plugin install cache-meter@chalkery --config language=uk
```

## Опції next-steps

Після встановлення CLI повідомить, що частину опцій не задано. Усі вони мають значення за замовчуванням, тому задавати їх не обовʼязково.

| Опція | За замовчуванням | Що робить |
| --- | --- | --- |
| `language` | `auto` | `auto`, `en` або `uk`, як описано вище |
| `minAnswerChars` | `80` | Після коротших відповідей кнопки немає |
| `suggestSkills` | `true` | Пропозиція може бути скілом чи слеш-командою сесії |

## Для авторів

```
.claude-plugin/marketplace.json   каталог: пак і три моди
plugins/<мод>/                    кожен мод самодостатній, ставиться окремо
plugins/<мод>/hooks/locales/      en.mjs і uk.mjs: усі написи, які бачить людина
plugins/primaries/              пак: лише dependencies на три моди
shared/band.mjs                   договір спільної смуги
shared/i18n.mjs                   вибір мови за опцією language
scripts/sync-shared.sh            копіює shared/*.mjs у hooks/ кожного мода
```

**Спільна смуга.** Порядок, у якому рушій складає хуки `ui.render` різних плагінів, не задокументований і залежить від способу встановлення. Тому мод не ставить свій рядок над чи під тим, що повернув `next(e)`. Він вкладає рядок у спільний стовпець `prompt-band` на своє місце: Handoff 10, кеш 20, «Що далі?» 30. Чуже, тобто рядок рушія чи мода не з цього репо, опиняється під ними. Мод ставлять і без сусідів, тому `band.mjs` та `i18n.mjs` лежать копіями в кожному. Правити слід `shared/`, потім запустити `scripts/sync-shared.sh`. Перевірка, що копії однакові: `scripts/sync-shared.sh --check`.

**Мови.** У коді мода немає тексту, який бачить людина: мод бере його з `locales/<мова>.mjs`. Нова мова — це ще один файл у кожному моді, рядок у `LOCALES` і шаблон у `shared/i18n.mjs`. Тести кожного мода перевіряють, що в усіх мовах однаковий набір ключів.

**Перевірка.** Для кожного мода:

```bash
claude plugin validate plugins/cache-meter && claude plugin test plugins/cache-meter
```

Тести смуги підставляють сусідні моди окремими плагінами в обох порядках. Тести мови покривають `en`, `auto` без `/config` і `auto` з українською в `/config`.

**Розробка наживо.** Щоб працювати з робочою копією, а не встановленою версією, додайте теки модів у `CLAUDE_CODE_PLUGIN_DIRS` (розділювач — двокрапка). Плагін із такої теки перекриває встановлений з тією самою назвою.

**Випуск.** Підніміть `version` у `plugins/<мод>/.claude-plugin/plugin.json`. Без цього `claude plugin update` у колег не побачить змін.

## Ліцензії

`handoff-relay`, `prompt-band` і спільний код: MIT, Yehor Hunia. `cache-meter` — форк кешової частини cache-keeper з [nateherkai/claude-code-mods](https://github.com/nateherkai/claude-code-mods), MIT, Nate Herk. `next-steps` — форк [anthropics/claude-plugins-community/next-steps](https://github.com/anthropics/claude-plugins-community/tree/main/next-steps), Apache 2.0. Ліцензія кожного мода лежить у його теці.
