# Council decisions

Read these before a run. Add owner rulings and intentionally rejected findings after a round. Keep target scores and previous reviews out of judge packets.

## Owner agreement, 8 November 2026

- Broad polish of the existing player-facing app is in scope. Substantial layout, typography, hierarchy, spacing, controls, and feedback changes are welcome.
- Preserve the Dota visual identity, game rules, the shared room, and existing round formats. New modes and an identity redesign are outside this run.
- Use Opus 5.5 and GPT-6.1 Sol at high effort. Each round gets fresh, read-only reviewers. They see neither the private target nor previous scores, peer findings, or the conversation.
- Continue through useful improvements. Pause for the owner if three rounds stay flat and the remaining work requires an owner decision or conflicts with agreed constraints. Do not stop after one fix pass by default.
- The owner reviews after the full loop. Keep the entire run uncommitted. No commit, push, merge, or deployment before that approval.
- Open a scrollable before/after sheet with red rectangles and short explanations for every changed screen. Keep individual pairs available. The owner may approve or veto each change.
- Review first, then implement accepted council findings. A self-directed implementation pass before the baseline council is not authorized.
- Score at least two other products, not just describe them. Keep their evidence and committed main fixed across rounds, score every reference again, and report reference-score drift separately from the candidate's change.

## Existing constraints

- The public count and answer split have one home in the Room split card. Improve its placement instead of repeating its figures in other public UI. Parties have no side rail and retain inline shares. See `docs/audits/2026-11-07/simplicity.md`.
- Gameplay controls must not move as clues unlock. Preserve server-owned timing, answer secrecy, scoring, and the feedback-sound contract.
- No help page. Existing local explanations and controls should explain the task.
- Do not add new claims, fake activity, or testimonials. Mock review data is evidence only, never a live-player claim.

## Approved candidate decisions, 14 November 2026

- Keep the smaller Spell Link and Aghanim artwork. One reviewer preferred larger art; the other found the smaller art useful for clue readability. Keep the primary clue readable and answer controls stable.
- Order Up shows the submitted sequence when it differs from the correct sequence. A correct fixture omits that duplicate. Check a wrong submission before accepting a finding that the player's order is missing.
- Keep one final Create action after the party settings in reading and Tab order. Its fixed position keeps it reachable during scrolling. Bottom padding and focus margins protect the last settings row. The owner approved this presentation.
- Hero reveals use named correct/chosen cards. Party reveals also retain every voted hero and its inline share. Public counts and distributions remain in the Room split.
- Review scores remain raw. A changed score for unchanged main or a competitor is reference drift, not an implementation gain. Use the within-round candidate gap as a separate comparison.
- Duplicate reviewer requests in the second candidate round were cancelled before any scores arrived. Only the first dispatched pair counts. Its session IDs and the cancelled requests are recorded in the parent evidence ledger.
- Entry-wait connection errors replace the numerical countdown with unknown-time dashes. Restore timing only from the next server response; practice stays available.
- The round header owns live worth and generic lock status. A hidden helper retains its layout slot after locking; named selections stay beside their controls.
- Show speed and clue-penalty contributions as included in the awarded total, with the existing crowd multiplier applied. The scoring formula does not change.
- Use spare phone height for party players while keeping Start and chat stable as player counts change. Short windows retain native scrolling and an accurate overflow cue.
- Keep the existing fonts and selected-answer stripes. The mechanical design scan flags them as generic preferences, not new defects; changing the visual identity is outside this run.
- Shopkeeper reveals remove the inactive catalogue. Keep submitted/correct compositions, repeated ingredients, included recipe scrolls, and every positive party share. Answering and locked controls retain their geometry.
- Put compact input guidance before boards. Hide it after locking but retain its space. Order Up keeps its single local instruction. The separate keyboard practice lesson still teaches A–D.
- Put the accurate roster overflow cue in the Players heading. Keep names uncovered, native scrolling, and stable Start/chat positions.

## Owner review checkpoint, 11 November 2026

The council loop paused after six reassessments with no sustained gain in the last three. The final full gate passed. At this checkpoint, the work was uncommitted and awaiting visual approval.

Open `.local/council-polish/candidate-6-comparison/comparison-sheet.html` for the complete comparison. Raw reports, scores, reference drift, coverage masks, frozen packets, and check logs are in `.local/council-polish/evidence/`.

A pinned phone timer remains an optional separate proposal. It is not part of the checked candidate.

## Owner approval, 14 November 2026

The owner approved the party and clue chunks, then the reveal chunk and the full candidate. The owner waived the remaining individual reviews and asked to apply the changes. This approves the current fixed Create bar, smaller clue artwork, and the other accepted polish. It does not mean every remaining capture was individually reviewed.

Commit and push the checked candidate under the normal repository workflow. Keep the comparison archive and raw scores. A merge or production deployment was not requested.
