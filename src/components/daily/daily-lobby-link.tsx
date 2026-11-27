"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/i18n/provider";
import { DAILY_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";
import { DAILY_MAX_POINTS, dailyNumberForDate, dailyTotal } from "@/lib/daily.mjs";
import { readDailyState } from "./daily-storage";

/** The lobby's first action. After today's daily it shows the score instead. */
export function DailyLobbyLink({ className }: { className: string }) {
  const { t } = useLocale();
  const [doneTotal, setDoneTotal] = useState<number | null>(null);

  useEffect(() => {
    const load = window.setTimeout(() => {
      const today = readDailyState().days[dailyNumberForDate()];
      setDoneTotal(today?.finished ? dailyTotal(today.results.map((result) => result?.points ?? 0)) : null);
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  return (
    <a href={DAILY_ARCADE_PATH} className={className} data-testid="daily-start">
      {doneTotal === null ? t("lobby.daily.play") : t("lobby.daily.done", { total: doneTotal, max: DAILY_MAX_POINTS })}
    </a>
  );
}
