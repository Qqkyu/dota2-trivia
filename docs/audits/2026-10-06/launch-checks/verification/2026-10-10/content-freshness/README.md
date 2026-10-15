# Content freshness check

The current playable questions need no changes for the Valve data differences checked on 2026-10-10. This check compares the current public responses with the sources used in the completed factual review. It does not repeat that review or claim that every upstream asset was fetched again.

Between 09:14:33 and 09:15:23 UTC, the check requested 349 distinct public Valve endpoints. All 349 returned HTTP 200 on the first attempt. There were no failed or unreachable endpoints. The [request record](upstream-comparison.json) includes URLs, retrieval times, response sizes, hashes, and cache headers.

The original archive contains 408 files. The 59 files outside this fetch are six local acquisition manifests, three old empty or error discovery responses, and 50 historical patch files. The check fetched the current patch list and 7.41f details. The [scope record](fetch-scope.json) names every file that was not fetched and gives its reason.

Valve's [patch list](https://www.dota2.com/datafeed/patchnoteslist?language=english) still ends at 7.41f, dated 2026-09-15 07:00 UTC. Both the list and the [7.41f details](https://www.dota2.com/datafeed/patchnotes?version=7.41f&language=english) are byte-identical to the October 6 records. The public profile responses contain no patch or client-build identifier, so the list does not bind every profile value to a specific build.

Of the 349 responses, 151 are byte-identical. Another 189 differ only because empty `facet_bonus` objects are absent. After excluding exactly those empty objects and comparing named special values, nine responses contain 37 other field differences. The [semantic comparison](semantic-deltas.json) retains every one. The [field review](field-impact.json) gives each difference its affected question IDs and a decision.

| Changed source | Question impact |
| --- | --- |
| Crystal Maiden's Freezing Field | The new fields still specify 100 explosions at 0.1-second intervals. Its only playable reference is a Soundcheck distractor. |
| Earthshaker's Fissure | Valve removed an internal pathing-radius field. The Shard question asks about the unchanged shorter Aftershock stun. |
| Venomancer's Plague Ward and talent | Health and displayed damage values are unchanged. No playable question refers to the changed ward fields or talent. |
| Kez, Largo, and Invoker abilities | Seventeen behavior values add bit `2^53` and preserve the previous bits. The numeric values, names, ownership, text, and upgrades used by the questions are unchanged. This review does not infer the meaning of the new bit. |
| Necronomicon recipe | No current or retired stored question refers to this item. |
| Consecrated Wraps | The new damage-source flag does not change its recipe. All four playable references concern recipes or recipe distractors. |

The [hero review](hero-impact.json) maps 22 playable references to the six changed hero responses. It includes exact prompts, marked answers, explanations, source hashes, and limits. The [item review](item-impact.json) maps the four recipe references and their answer fields. Primary source URLs are included in both records, including Valve's [item list](https://www.dota2.com/datafeed/itemlist?language=english) and [Consecrated Wraps profile](https://www.dota2.com/datafeed/itemdata?language=english&item_id=1854).

The saved local checks still match the current files. The question index covers all 1,517 playable questions. The release gate verifies all 124 reviewed files. These hash checks detect local changes; the upstream comparison above supplies the separate freshness evidence. See [local checks](local-checks.json), [question-index output](content-index.log), and [release-gate output](content-release.log).

The [changed-response archive](changed-responses.tar.gz) preserves all 198 fresh responses that differed. The other 151 responses match the existing source archive exactly. To replay all 349 response hashes and the complete field comparison without network access, run this command from the repository root:

```sh
python3 docs/audits/2026-10-06/launch-checks/verification/2026-10-10/content-freshness/compare-saved.py.txt
```

The original [fetch script](check-upstream.py.txt) deliberately reports a failure when it sees any changed JSON. The completed field review resolves those changes; the offline replay above passes. This work changed no application data. Historical research, audio recognition, sound capture, and live-client execution were not repeated here. Their earlier evidence and limits remain in force. The [manifest](evidence-manifest.json) binds this report and its evidence.
