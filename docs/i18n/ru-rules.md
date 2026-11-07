# Russian rule sheet

Every Russian line in Queue Arcade follows this sheet. Translators and readers get it with their task. When a reader finds a new rule, add it here and add a check to `tests/i18n.test.mjs` or `scripts/check-locale.mjs` where a machine can catch it.

Queue Arcade is a browser trivia game for the wait between Find Match and Accept. Each question has 15 seconds, so each line must read at a glance. The reader is a Russian-speaking Dota 2 player, 18 to 35, with years in the game. The text must read as written by such a player for other players. It must not read as a translation or as AI text.

## Source of truth

Valve's Russian client text decides any term. Pairs are in `~/.cache/queue-arcade-valve/hero-*-russian.json` next to `hero-*-english.json`, from `https://www.dota2.com/datafeed/herodata?language=russian&hero_id=<id>`. Items and map objects are in `https://www.dota2.com/datafeed/itemlist?language=russian` and `https://www.dota2.com/datafeed/patchnotes?language=russian&version=<patch>`. A reader's memory of the game does not overrule them. A mirror of the client's `dota_russian.txt` is at `~/.cache/queue-arcade-valve/dota_russian.d2vpkr.txt`. Search these sources before you call a term wrong. When a term in this sheet disagrees with Valve, Valve wins and the sheet gets corrected.

## Names

- Names of heroes, items, abilities and talents stay in Latin letters, as in the client: Pudge, Blink Dagger, Meat Hook, Aghanim's Scepter, Aghanim's Shard.
- Latin names do not decline. Build the sentence so the name needs no ending: "у героя Pudge", "предмет Blink Dagger", "способность Meat Hook".
- A past-tense verb needs a gender, and a Latin name does not show one. Write "герой {name}" and keep the verb masculine, or rebuild the sentence without a past verb.
- Team, tournament and event names stay in Latin: Team Spirit, OG, The International, Wings Gaming, Diretide, Frostivus. "TI9" stays as written. The client translates some event names, but players and answer options use the Latin ones.
- Roshan is "Рошан" and declines, as in the client ("Рошана"). This is the exception.
- "Queue Arcade" and "Dota 2" stay as written.
- Cities and countries are in Cyrillic (Шанхай, Гамбург) except inside a tournament name. Real people's names are in Cyrillic when they are writers or public figures with a Russian spelling; player and caster handles stay in Latin.
- Never repeat a word in two languages: not "Команда Team Spirit", not "Студия ... Studio".
- A Latin event name with a past or neuter verb takes "событие": "событие Diretide вышло".

## Client terms

| English | Russian |
| --- | --- |
| cooldown | перезарядка (never "кулдаун" in game text; "кд" only in a casual label) |
| mana cost | стоимость маны, "сколько маны стоит" |
| damage / pure damage / magic | урон / чистый урон / магический |
| stun | оглушение, оглушает |
| silence | безмолвие, накладывает безмолвие |
| root | оцепенение, цепенеет (Valve; "обездвиживает" only where Valve has it) |
| dispel | развеивание, развеивает |
| debuff immunity, spell immunity | невосприимчивость к эффектам |
| channeled | прерываемая способность, "ПРЕРЫВАЕМАЯ" in Valve notes |
| interrupt | прерывать |
| illusion | иллюзия |
| creep, ancient creep | крип, древний крип |
| ward, Observer, Sentry | вард |
| summoned ward (Healing Ward, Serpent Ward, Death Ward, Nether Ward) | тотем |
| disjoint | сбивает с цели летящие снаряды |
| vector targeted | векторное применение |
| disable | контроль; never "обезвреживать" |
| disarm | бессилие |
| active instances of an ability | эффекты, not "экземпляры" |
| Watcher | Смотритель; the verb is "включать" |
| Outpost | Аванпост |
| Wisdom Shrine | алтарь мудрости |
| Madstone | безумруд |
| enchantment (neutral) | чары |
| Selemene | Селемине, does not decline |
| Inai | Инай |
| Muerta's veil | вуаль |
| Secret Shop | Потайная лавка |
| Base Shop | Лавка на базе |
| Shrine | Святыня |
| net worth | общая ценность |
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
- Dates: "9 июля 2013". In a full sentence a year takes "году": "в 2013 году"; a bare year is for lists and answer options.
- Never put two numbers side by side: "15 декабря 2025 в патче 7.40", not "патче 7.23 26 ноября" or "Dota 2 9 июля".
- A film or TV series is "сериал", not "серия".

## Fairness

- Never add a fact, lose a fact, or change what the answer depends on. Keep every number and qualifier ("before talents", "at max level").
- A clue must not name the hero or the ability, in Latin or in Cyrillic, and must not get easier or harder.
- Answer options must stay parallel and must not give away the right one by length or form.
- If a wrong option has the same name as Valve's Russian term for the right answer, change the option. The Russian question must have one right answer.
- A question must not use a masculine noun when an option is a woman; "Какого ведущего" rules out Sheever.
- A label must not share a word with the right option, and the grammatical number of the question must fit every option.
- Keep `{n0}`, `{x1}`, `{q0}`, `{p0}` and `{name}` slots exactly, with the same count. Slots may move within the sentence.

## Hero quotes

Write the line as that hero would say it in Russian, with the hero's voice and rhythm. Do not translate word by word. If a pun cannot survive, keep the attitude and rebuild it. Plain beats clever.

Russian shows gender where English hides it. A past-tense verb or an adjective about the speaker ("я вернулась", "я готов") tells the player the hero's gender and can rule out answer options. Quote Hunt lines must not show the speaker's gender: use the present or future tense, a noun, or an impersonal form. This is a fairness rule, so it beats a closer translation.

The same rule covers short participles, gendered nouns, "сам" and sentences without "я", and labels about people in Flashback.

Use the Russian idiom, not the literal one: "дело в шляпе", never "в мешке". Keep required dashes: "Жить — значит...".

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
