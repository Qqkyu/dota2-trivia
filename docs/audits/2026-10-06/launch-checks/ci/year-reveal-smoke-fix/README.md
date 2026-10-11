# Flashback year reveal smoke assertion

The final visual step in [run 38047885476](../runs/38047885476/README.md) rejected an intended Flashback year reveal. The test required the year slider to remain visible. The earlier [year-display fix](../../rights/year-reveal.md) deliberately removes the slider and Lock button at reveal, labels the correct year and retains the player's submitted year separately. The [source and screenshot diagnosis](../runs/38047885476/visual-smoke-diagnosis/diagnosis.json) found that this stale condition was sufficient to trigger the generic reveal/report-menu error.

Only `scripts/visual-smoke.mjs` changes for this correction. It now captures the submitted year before locking. At reveal, it checks the board phase, a four-digit correct-year data value, its agreement with the visible readout, the correct-year label, retained submitted answer, and absence of the slider and Lock button. It keeps the report-menu geometry assertion. It also logs the panel bounds before and after opening the menu and their comparison result. [Before source](visual-smoke-before.mjs.txt), [corrected source](visual-smoke-after.mjs.txt) and the [exact diff](visual-smoke.diff.txt) preserve the change.

| Focused check | Result | Evidence |
| --- | --- | --- |
| Legacy slider assertion | Rejected all four intended reveals; exit 1 | [Log](focused-year-red.log), [script](focused-year-red.mjs.txt) |
| Corrected assertion | Accepted all four reveals; exit 0 | [Log](focused-year-green.log), [script](focused-year-green.mjs.txt) |
| Report panel geometry | Before and after bounds matched in all eight executions | Same red and green logs |

The four cases combine 320 x 568 and 1440 x 1000 viewports with wrong and correct submitted years. Controlled TI first-year responses use 2011 as the correct answer. The original failed CI question used bounty runes and 2014. Both focused checks run the actual production page with controlled question responses. The green script evaluates the corrected assertion extracted from the recorded source hash. [Source check](source-check.json) records that extraction.

The [selected original result](original-result-summary.json) retains the game format, relevant flags, aggregate crowd result and final menu bounds. It omits room and round identifiers. The original output did not record the bounds before opening the report menu, so its movement remains unverified. The later focused checks do not fill that historical gap. They show unchanged bounds during their own executions.

Two temporary script generators selected the wrong source branches and produced syntax errors. They failed before browser or app access. Their [scripts and error logs](intermediate-predicate-extraction-failures/) remain separate from the product findings. The corrected generated script and focused result are the passing evidence.

A separate [predicate check](predicate-guards.json) passed 48 assertions. It accepted the four captured DOM states and rejected 44 mutations covering missing or malformed year metadata, a mismatching readout, labels, submitted answers, board state and stale controls. It checks that the displayed year agrees with the board metadata; it does not independently prove the factual answer if both values are wrong. The focused captures show the fixture answer, 2011. These are checks of the extracted predicate, not additional browser runs. The [replay script](check-reveal-predicate.mjs.txt) retains the inputs and mutations. [Lint](lint-result.json) passed for the exact corrected script hash.

The [full corrected visual smoke](verification/visual-smoke.log) passed at 11:55:50 UTC on October 10, 2026. It exercised Soundcheck and reports `flashbackYearReveal: "not-current-round"`. Its report-panel bounds matched. The four controlled year cases provide the year-format evidence; the full smoke provides the broader flow check.

The [multiplayer check](verification/multiplayer.log) passed. It recorded two persisted PostgreSQL votes, rejected duplicate votes and passed its synthetic account, report, privacy, review and rate-limit checks. Its Steam checks cover a synthetic OpenID boundary, not the owner signing into Steam. The [packaged cleanup dry run](verification/cleanup-dry-run.log) passed with no eligible temporary records. These are saved-environment preflights. A new exact-candidate GitHub CI run remains required, and the original run stays failed.

[Image and source binding](image-source-binding.json) records the unchanged production image and runtime build ID from the failed run. Only the smoke script changed in the diagnostic checkout. The image was not rebuilt, no new runner registration was created, and the outer runner kept its CPU and memory limits. [Summary](summary.json) binds all completed stages and their UTC times.

All [six selected screenshots](screenshot-review.json) were inspected. They retain the original pixels. The mobile correct-answer frame includes a first-blood animation over much of the question, and both mobile captures stop before the report panel below the viewport. Those frames do not prove an unobstructed full-page layout. The focused logs provide the measured panel geometry. Full-smoke images show Soundcheck, not the year format. Fixture crowd and point values do not establish scoring correctness.

After these checks, the CI owner [removed the diagnostic runner and its dedicated volume and registration](../runs/38047885476/cleanup-result.json) without reported problems. The separate packaged cleanup above is a database dry run.

[Provenance](provenance.json) records copied and sanitized inputs. The selected original result and multiplayer log omit room and round identifiers. No complete original-result duplicate, credentials, environment files or server logs are included. The [secret scan](evidence-secret-scan.json) and [manifest](manifest.json) check the archive.
