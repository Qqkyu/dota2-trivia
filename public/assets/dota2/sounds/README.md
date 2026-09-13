# Dota 2 feedback sounds

`panorama_generic_button_click_01.wav` is the clip behind
`ui_generic_button_click`. The surviving Queue Trivia stylesheet assigns that
event to an activated answer button, so it now confirms a locked answer here.

- Browser-ready source: <https://dotabase.dillerm.io/vpk/sounds/ui/panorama/panorama_generic_button_click_01.wav>
- SHA-256: `10abf2f53e7b3f9af78b843cac79eaef053c463663a5f099dcd5c538b2d62fe0`

The runtime uses `panorama_generic_button_click_01_padded.wav`: the same stereo
samples with 882 silent frames (20 ms at 44.1 kHz) added at the start. Native
Chrome output fades the beginning of a media voice, which otherwise removes
most of this short click's energy. `scripts/validate-feedback-sounds.mjs` checks
the silent prefix and every preserved sample against the original above.

- Runtime SHA-256: `4b0c2a51cf3fc4206855813a1c8253dfaf1e894d638b9da223a7f6884e756eea`

`panorama_find_match_find_01.wav` and `panorama_select_md_01.wav` are the two
layers of `ui.matchmaking_find`. They play together when a player enters an
arcade room, preserving the event's original `0.6` and `1.0` gains.

- Browser-ready sources: <https://dotabase.dillerm.io/vpk/sounds/ui/panorama/panorama_find_match_find_01.wav> and <https://dotabase.dillerm.io/vpk/sounds/ui/panorama/panorama_select_md_01.wav>
- SHA-256: `cadf33b5f47ca29cbeb37e063a8f5364cd92db4dadd2c8befabfa6fe623fcd33` and `7b39cbbd7e80f9ff671b3c45f4e6d5818dd04e5057ab391faa1929f028cae5ad`

`coins.wav` is the payoff in the linked “farming” soundboard and the current
client asset behind the 2D `General.Coins` event. Queue Arcade uses that event's
original `1.0` gain as its correct-answer cue. The soundboard WAV and current
client WAV have identical decoded audio; the checked-in file is the current
client encoding.

- Browser-ready source: <https://dotabase.dillerm.io/vpk/sounds/ui/coins.wav>
- Referenced soundboard: <https://howdoiplay.com/meepmerp/#farming>
- SHA-256: `f9f3e5565295588e4714adae9c645e149bf5c2191d0e3aa71e9177902c8e88e5`

`challenge_success.wav` is a legacy Dota 2 UI success sting. It remains in the
asset audit as a reviewed archive, but Queue Arcade no longer plays it.

- Browser-ready source: <https://dotabase.dillerm.io/vpk/sounds/ui/challenge_success.wav>
- SHA-256: `d2ed6c53d6ce4a0c437ebc8fcde95959bf0284089e56d0c224e17d497a3bdacb`

`magic_immune.wav` is the original Dota 2 cue used by the
`General.InvalidTarget_Invulnerable` sound event (the familiar “meep merp”).

- Browser-ready source: <https://dotabase.dillerm.io/vpk/sounds/ui/magic_immune.wav>
- SHA-256: `b4fcca8d22df1e73d70b4bffefec2df17fb45451b82e14f22194a4cf6223dd96`

Client files, Queue Trivia styling, event composition, and mappings were checked
against Dota 2 build `6872` / patch `7.41d`.

Dota 2 and these sounds are property of Valve Corporation. This unofficial fan
project is not affiliated with or endorsed by Valve.
