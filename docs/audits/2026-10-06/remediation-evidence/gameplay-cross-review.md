# Gameplay cross-review

I reviewed the current gameplay changes and ran the real browser UI against local development port 3220 with controlled API responses. Real API calls were blocked. I changed no application code for this review.

Confirmed at review time, then sent to the functional agent for repair:

- An accepted vote that commits after the next round loads can lose all session and lifetime credit. The late POST response cannot add a pending ID because the current round changed. The next same-round response includes the accepted previous result but the client processes recovery only on a round transition. The fixture showed gold 0 and streak 0 with an empty pending list through the following round.
- The client cannot revise settled points after a late vote changes the crowd multiplier. The fixture changed authoritative player points from 400 to 200; the score stayed 400 and streak stayed 1.
- The client can grade its local selection instead of the accepted server selection. A same-account conflict fixture accepted the correct answer but held that POST response after the tab picked a different answer. Gold was 200 but streak stayed 0, both before and after the delayed POST response.
- A pending public entry can overwrite Party navigation. Before releasing the response, the URL was /party, the phase was lobby, and the party form was visible. After release, the URL was /play and the phase was waiting, while the party form remained visible.
- Development Strict Mode cleanup aborts initial /play entry but leaves the one-shot entry flag set. The browser stayed in the lobby after one rounds request. This was a development behavior check, not a production failure claim.
- The shared pending-vote storage list has a lost-update race outside the lifetime Web Lock. A controlled storage interleaving let one tab add an accepted vote between another tab's read and cleanup write. The second tab's pending entry disappeared.

Reproduction files:

- /tmp/queue-arcade-fixes/gameplay-cross-review.mjs
- /tmp/queue-arcade-fixes/navigation-cross-review.mjs

The functional agent reports fixes for these cases. A final browser rerun remains necessary against the updated client.

## Independent rerun after fixes

Both browser scripts now pass the four main reproductions:

- Late accepted commit gives gold 200 and streak 1 and remains counted once through the following round.
- Authoritative points changing from 400 to 200 change displayed gold to 200 without another streak increment.
- An accepted correct server selection overrides a conflicting local selection. Gold is 200 and streak is 1 both before and after the delayed POST response.
- Releasing the obsolete public entry response leaves the user at /party in the lobby.

The functional agent moved pending votes to tab session storage, removing the shared pending-list write race. New initial entry also passed on the development server. The remaining observation is that historical guest bestScore can retain an earlier provisional crowd bonus after current session points decrease. This was sent to the functional agent and root for follow-up.
