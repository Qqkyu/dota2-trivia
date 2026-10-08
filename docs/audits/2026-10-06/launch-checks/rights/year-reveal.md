# Flashback year reveal

The rights browser review found a separate answer-display defect. For TI1's year question, the reveal kept `2017` in large type after an unanswered round or a submitted wrong answer of `2017`. The explanation gave the correct year, `2011`, but the year board did not identify it. The correct year existed only in a DOM data attribute.

The previous visual fixture submitted `2011` and then checked that `2011` remained visible. That test could not detect the wrong-answer or unanswered cases. [The failing run](year-reveal-red.log) records all six new cases against production build `2156i_Ft_RgrUFq0svQeJ`. They cover unanswered, wrong and correct submissions at 320×568 and 1440×1000. [The phone screenshot](year-reveal-before/flashback-year-320-wrong.png) shows the wrong year before the fix.

The year board now labels and displays the correct year at reveal. A separate line retains the player's submitted year, or says "No answer locked." The slider and Lock button remain available while answering and no longer appear at reveal. The board keeps its minimum height.

`scripts/visual-flashback.mjs` now checks the rendered year, the visible label and the retained player choice in each case. It also rejects the old reveal controls and horizontal overflow. The existing slider, explicit-lock, ordering and winner-reveal checks remain in that browser flow. The tests use controlled question responses on the real production page. They do not claim a real Steam login or a physical-device test.

All six cases passed on production build `NsjBPH5Ygi5SqnYfuwSHz`. The [passing log](standard-flashback-browser.log) contains each rendered value. All six after screenshots were visually inspected. The phone [unanswered case](year-reveal-after/flashback-year-320-unanswered.png) shows "Correct year", `2011` and "No answer locked." The phone [wrong-answer case](year-reveal-after/flashback-year-320-wrong.png) and [desktop case](year-reveal-after/flashback-year-1440-wrong.png) show `2011` with "Your answer: 2017." Both have no horizontal overflow.

The fixture supplies fixed synthetic crowd and point values. The screenshots verify the year board and text layout; their point totals are not scoring evidence. The separate 256-state rights run also passed on this build after the year change.
