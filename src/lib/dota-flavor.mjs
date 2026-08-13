export function accuracyRate(correct, answered) {
  if (!answered) return 0;
  return Math.round((correct / answered) * 100);
}

/** Live reveal line, using Dota fight callouts. */
export function revealCallout({ correct, timedOut, firstBlood, streak }) {
  if (timedOut) return "Time expired";
  if (!correct) return "Denied";
  if (firstBlood) return "First Blood";
  if (streak >= 8) return "Godlike";
  if (streak >= 5) return "Rampage";
  if (streak >= 3) return "Killing Spree";
  return "Correct";
}

/** Session honorific. Strong runs get the chat-wheel line. */
export function sessionHonorific(correct, answered) {
  const rate = accuracyRate(correct, answered);
  if (rate >= 70) return "Well Played.";
  if (rate >= 50) return "Knowledge is power";
  return "One more queue";
}

export function acceptWindowMs(answerDuration) {
  const duration = Math.max(0, answerDuration);
  return Math.min(5_000, duration / 3);
}
