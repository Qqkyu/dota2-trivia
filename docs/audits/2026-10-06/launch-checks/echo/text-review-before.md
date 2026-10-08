Reviewed all 123 current Echo (`hero-voice`) questions against the pinned selected response records and 91,246 response records from 226 local source files. Every expected transcript, keyed hero, hero/voice ID and audio path matches its pinned source. The source file hashes also match. No single-word or nonverbal-only selection remains. The shortest normalized texts have four words.

One full line is shared across heroes. `hero-voice:npc_dota_hero_bounty_hunter:bount_ability_track_04` expects “Where do you think you're going?” The same words, ignoring punctuation, occur in 17 records for 11 other heroes: Clockwerk, Earth Spirit, Faceless Void, Hoodwink, Magnus, Mars, Meepo, Monkey King, Muerta, Sand King and Vengeful Spirit. None is a current distractor for this question. This does not make the audio key wrong. It means ASR text cannot by itself prove the speaker.

Thirty chosen lines start with First Blood. Fifty-three share their first three normalized words with another hero's source response. These are common dialogue openings, not evidence of a wrong voice. The JSON lists each collision and keeps the full expected line.

These source-supported words need care in ASR comparison:

| Record suffix                      | Expected text detail                   | Treatment                                                                                                        |
| ---------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `bristle_kill_06`                  | “Yeah, that chinned ya, didn't it?”    | Slang; do not silently replace the verb.                                                                         |
| `riki_kill_12`                     | “I'd've done that one for free.”       | Expanding I'd've to I would have does not change the speech.                                                     |
| `pud_level_09`                     | “Time for a choppin block party!”      | Choppin/chopping is a dialect spelling difference.                                                               |
| `tusk_kill_05`                     | “You were out of your weightclass!”    | Weightclass/weight class is a spacing difference.                                                                |
| `skg_kill_09`                      | “You were expecting...Sandy Claws?”    | Deliberate Santa Claus wordplay; preserve the source text.                                                       |
| `terr_kill_09`                     | “Let's bare your soul, shall we?”      | Bare/bear is a homophone issue for recognition.                                                                  |
| `drag_kill_01` under Skywrath Mage | “Skree'auk's talons pierce your soul.” | Proper name. The shared internal drag prefix does not override source hero ID 101 and the Skywrath audio folder. |
| `winwyv_cast_01`                   | “You have tangled with an Eldwurm!”    | Eldwurm is a lore term, not corrupt text.                                                                        |

Invoker's `kidvo_la_first_02` is the young persona, correctly attributed to Invoker by the source. Alchemist, Ogre Magi and Techies can have more than one speaking character while remaining a single hero answer. These distinctions belong in the audio review; this pass did not judge their sound.

All 123 lines were read individually. `echo-text-review.json` stores the expected text, exact pinned URL, attribution checks, shared-text matches and individual wording notes. No confirmed transcript or attribution correction is required from this text review. No app files or earlier audit archives were changed. No audio listening or ASR was performed here.

## Corpus reconciliation

The full pinned manifest contains 226 response files with 91,246 records. The final pass verifies every file hash and compares all 86655 nonempty text records, including non-hero and persona records. The other 4591 records have no nonempty transcript. The first pass counted only 213 files whose first entry contained text and filtered the comparison to 123 playable hero identities. That narrower count is superseded.

Exact full-text matches outside the keyed hero remain limited to Bounty Hunter. The JSON records all matching source entries, including any non-hero source. No new wrong key or source mismatch was found.
