# Russian rule sheet

Every Russian line in Queue Arcade follows this sheet. Translators and readers get it with their task. When a reader finds a new rule, add it here and add a check to `tests/i18n.test.mjs` or `scripts/check-locale.mjs` where a machine can catch it.

Queue Arcade is a browser trivia game for the wait between Find Match and Accept. Each question has 15 seconds, so each line must read at a glance. The reader is a Russian-speaking Dota 2 player, 18 to 35, with years in the game. The text must read as written by such a player for other players. It must not read as a translation or as AI text.

## Source of truth

Valve's Russian client text decides any term. Pairs are in `~/.cache/queue-arcade-valve/hero-*-russian.json` next to `hero-*-english.json`, from `https://www.dota2.com/datafeed/herodata?language=russian&hero_id=<id>`. A reader's memory of the game does not overrule it. Search those files before you call a term wrong.

## Names

- Names of heroes, items, abilities and talents stay in Latin letters, as in the client: Pudge, Blink Dagger, Meat Hook, Aghanim's Scepter, Aghanim's Shard.
- Latin names do not decline. Build the sentence so the name needs no ending: "у героя Pudge", "предмет Blink Dagger", "способность Meat Hook".
- A past-tense verb needs a gender, and a Latin name does not show one. Write "герой {name}" and keep the verb masculine, or rebuild the sentence without a past verb.
- Team, tournament and event names stay in Latin: Team Spirit, OG, The International, Wings Gaming. "TI9" stays as written.
- Roshan is "Рошан" and declines, as in the client ("Рошана"). This is the exception.
- "Queue Arcade" and "Dota 2" stay as written.

## Client terms

| English | Russian |
| --- | --- |
| cooldown | перезарядка (never "кулдаун" in game text; "кд" only in a casual label) |
| mana cost | стоимость маны, "сколько маны стоит" |
| damage / pure damage / magic | урон / чистый урон / магический |
| stun | оглушение, оглушает |
| silence | безмолвие, накладывает безмолвие |
| root | обездвиживание, обездвиживает |
| dispel | развеивание, развеивает |
| debuff immunity, spell immunity | невосприимчивость к эффектам |
| channeled | поддерживаемая способность, поддерживать |
| interrupt | прерывать |
| illusion | иллюзия |
| creep, ancient creep | крип, древний крип |
| ward, Observer, Sentry | вард |
| Watcher | Наблюдатель |
| Outpost | Аванпост |
| Wisdom Shrine | Святилище мудрости |
| Secret Shop | Тайная лавка |
| shop | лавка |
| recipe | рецепт |
| talent | талант |
| facet | аспект; check the client when a question names one |
| Nuker, Carry, Support | нюкер, керри, саппорт |
| attack range | дальность атаки |
| movement speed | скорость передвижения |
| patch | патч, "в патче 7.41" |
| level | уровень; "max level" is "на максимальном уровне" |

Kill streak announcer names are the only ones that may stay in English, as they are heard in the game: Wicked Sick, Godlike, Rampage.

## Writing

- Address the player as "ты", informally. Never "Вы".
- Keep the length close to the English, shorter when you can. Buttons and labels stay short.
- Write plain, spoken Russian. Avoid "является", "данный", "осуществлять", "производить", strings of genitives, long participle phrases and English word order. Split a long line into two sentences.
- Do not pad. A quote may rebuild a joke, but it must not add content.
- Use ё, as the client does.
- Numbers: gold is "золота" in sentences and "зол." in tight lists. Seconds are "сек." with a space. Match scores use a colon, 3:2. Decimals use a comma. Thousands use a non-breaking space.
- Quotes: «ёлочки». Dash: — with spaces. No curly English quotes.
- Dates: 9 июля 2013.

## Fairness

- Never add a fact, lose a fact, or change what the answer depends on. Keep every number and qualifier ("before talents", "at max level").
- A clue must not name the hero or the ability, in Latin or in Cyrillic, and must not get easier or harder.
- Answer options must stay parallel and must not give away the right one by length or form.
- Keep `{n0}`, `{x1}`, `{q0}`, `{p0}` and `{name}` slots exactly, with the same count. Slots may move within the sentence.

## Hero quotes

Write the line as that hero would say it in Russian, with the hero's voice and rhythm. Do not translate word by word. If a pun cannot survive, keep the attitude and rebuild it. Plain beats clever.

## Interface

- One word for one thing across the app: "раунд", "пати" for a party, "зал" is not used, "комната" for the public room.
- Round type names are fixed:

| English | Russian |
| --- | --- |
| Classic Trivia | Викторина |
| Shopkeeper Rush | Лавочник |
| Spell Link | Чья способность |
| Fogged Vision | Туман войны |
| Echo Hunt | Чей голос |
| Soundcheck | Саундчек |
| Quote Hunt | Чья реплика |
| Aghanim's Lab | Лаборатория Aghanim |
| Order Up | По порядку |
| Flashback | Флешбэк |

- Attributes are Сила, Ловкость, Интеллект, Универсальный.
- A pattern with a name slot can receive a hero, an item or an ability, so its grammar must suit all three.
- Timer lines must say when something opens, not how long it lasts: "откроется через 5 сек." or "на отметке 5 сек.", never "откроется на 5 сек.".
- Room copy keeps one shape for any room size. Never "только ты" or "никто не ответил".
