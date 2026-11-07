"use client";

import { kindLabel } from "@/i18n/category";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArchiveX,
  ArrowLeft,
  BarChart3,
  Check,
  Flag,
  LoaderCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { useLocale } from "@/i18n/provider";
import { REPORT_REASON_LABEL_KEYS, type ReportReason } from "@/lib/calibration";
import type { CalibrationRecord, CalibrationSnapshot } from "@/lib/calibration-data";
import type { QuestionReviewState } from "@/lib/question-review";
import styles from "./calibration-dashboard.module.css";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

type CalibrationFilter = "all" | "review" | "reported" | "reviewed" | "quarantined";

const FILTERS = ["all", "review", "reported", "reviewed", "quarantined"] as const satisfies CalibrationFilter[];

function percentage(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function expectedBand(record: CalibrationRecord) {
  return `${Math.round(record.signal.expectedMinimum * 100)}–${Math.round(record.signal.expectedMaximum * 100)}%`;
}

function leadingReport(record: CalibrationRecord) {
  const result = (Object.entries(record.reports) as Array<[ReportReason, number]>).sort(
    (left, right) => right[1] - left[1],
  )[0];
  return result && result[1] > 0 ? result[0] : null;
}

function matchesFilter(record: CalibrationRecord, filter: CalibrationFilter) {
  if (filter === "review") return record.review.status === "open";
  if (filter === "reported") return record.reportTotal > 0;
  if (filter === "reviewed") return record.review.status === "reviewed";
  if (filter === "quarantined") return record.review.status === "quarantined";
  return true;
}

export function CalibrationDashboard({
  snapshot,
  logoUrl,
  canReview,
}: {
  snapshot: CalibrationSnapshot;
  logoUrl: string;
  canReview: boolean;
}) {
  const { t, number } = useLocale();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CalibrationFilter>("all");
  const [page, setPage] = useState(0);
  const [records, setRecords] = useState(snapshot.records);
  const [savingQuestion, setSavingQuestion] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      records.filter(
        (record) =>
          matchesFilter(record, filter) &&
          (!normalizedQuery ||
            record.prompt.toLowerCase().includes(normalizedQuery) ||
            record.questionId.toLowerCase().includes(normalizedQuery) ||
            record.kind.toLowerCase().includes(normalizedQuery)),
      ),
    [filter, normalizedQuery, records],
  );
  const pageSize = 80;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * pageSize;
  const visible = filtered.slice(pageStart, pageStart + pageSize);
  const reviewTotals = useMemo(
    () => ({
      open: records.filter((record) => record.review.status === "open").length,
      reviewed: records.filter((record) => record.review.status === "reviewed").length,
      quarantined: records.filter((record) => record.review.status === "quarantined").length,
    }),
    [records],
  );

  async function updateReview(record: CalibrationRecord, state: QuestionReviewState) {
    setSavingQuestion(record.questionId);
    setReviewError(null);
    try {
      const response = await fetch("/api/calibration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: snapshot.gameId,
          questionId: record.questionId,
          questionRevision: record.questionRevision,
          state,
        }),
      });
      const result = (await response.json()) as { review?: CalibrationRecord["review"]; error?: string };
      if (!response.ok || !result.review) throw new Error(result.error || "Review update failed.");
      setRecords((current) =>
        current.map((entry) => (entry.questionId === record.questionId ? { ...entry, review: result.review! } : entry)),
      );
    } catch {
      setReviewError(record.questionId);
    } finally {
      setSavingQuestion(null);
    }
  }

  return (
    <main className={styles.shell} data-testid="calibration-dashboard">
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span>
            <Image src={firstPartyArtSrc(logoUrl)} alt="" width={28} height={28} unoptimized />
          </span>
          <span>
            <strong>Queue Arcade</strong>
            <small>{t("calibration.brand")}</small>
          </span>
        </Link>
        <div className={styles.headerActions}>
          {canReview && (
            <Link href="/ops" className={styles.backLink}>
              <BarChart3 />
              {t("calibration.opsLink")}
            </Link>
          )}
          <Link href="/" className={styles.backLink}>
            <ArrowLeft />
            {t("calibration.backLink")}
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <BarChart3 />
            {t("shell.header.patch", { game: snapshot.gameLabel, patch: snapshot.patch })}
          </span>
          <h1>{t("calibration.title")}</h1>
          <p>{t("calibration.intro")}</p>
        </div>
        <div className={styles.guardrail}>
          <ShieldCheck />
          <span>
            <small>{t(canReview ? "calibration.guard.reviewerLabel" : "calibration.guard.publicLabel")}</small>
            <strong>{t(canReview ? "calibration.guard.reviewerValue" : "calibration.guard.publicValue")}</strong>
          </span>
        </div>
      </section>

      <section className={styles.stats} aria-label={t("calibration.stats.label")}>
        <article>
          <Users />
          <span>{t("calibration.stats.answers")}</span>
          <strong>{number(snapshot.totals.answers)}</strong>
          <small>{t("calibration.stats.seen", { count: snapshot.totals.answered })}</small>
        </article>
        <article>
          <Check />
          <span>{t("calibration.stats.sample")}</span>
          <strong>{snapshot.totals.sampled}</strong>
          <small>{t("calibration.stats.sampleNote")}</small>
        </article>
        <article>
          <AlertTriangle />
          <span>{t("calibration.stats.queue")}</span>
          <strong>{reviewTotals.open}</strong>
          <small>{t("calibration.stats.quarantined", { count: reviewTotals.quarantined })}</small>
        </article>
        <article>
          <Flag />
          <span>{t("calibration.stats.reports")}</span>
          <strong>{snapshot.totals.reports}</strong>
          <small>{t("calibration.stats.reportsNote")}</small>
        </article>
      </section>

      <section className={styles.workspace}>
        <div className={styles.controls}>
          <label>
            <Search />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder={t("calibration.search.placeholder")}
              aria-label={t("calibration.search.label")}
            />
          </label>
          <div role="group" aria-label={t("calibration.filter.label")}>
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => {
                  setFilter(option);
                  setPage(0);
                }}
              >
                {t(`calibration.filter.${option}`)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.resultMeta}>
          <span aria-live="polite">
            {t("calibration.showing", {
              start: filtered.length ? pageStart + 1 : 0,
              end: pageStart + visible.length,
              total: filtered.length,
            })}
          </span>
          <small>{t("calibration.currentQuestions", { count: snapshot.totals.questions })}</small>
        </div>

        <nav className={styles.pagination} aria-label={t("calibration.pages.top")}>
          <button
            type="button"
            data-testid="calibration-top-previous-page"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            {t("calibration.pages.previous")}
          </button>
          <span>{t("calibration.pages.position", { page: currentPage + 1, pages: pageCount })}</span>
          <button
            type="button"
            data-testid="calibration-top-next-page"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            {t("calibration.pages.next")}
          </button>
        </nav>

        <div className={styles.table} role="table" aria-label={t("calibration.table.label")}>
          <div className={styles.tableHeader} role="row">
            <span role="columnheader">{t("calibration.table.question")}</span>
            <span role="columnheader">{t("calibration.table.mode")}</span>
            <span role="columnheader">{t("calibration.table.tier")}</span>
            <span role="columnheader">{t("calibration.table.answers")}</span>
            <span role="columnheader">{t("calibration.table.accuracy")}</span>
            <span role="columnheader">{t("calibration.table.signal")}</span>
          </div>
          {visible.map((record) => {
            const report = leadingReport(record);
            const saving = savingQuestion === record.questionId;
            return (
              <div
                key={record.questionId}
                className={styles.row}
                data-testid="calibration-row"
                data-calibration-status={record.signal.status}
                data-review-status={record.review.status}
                role="row"
              >
                <div className={styles.questionCell} role="cell">
                  <small>{record.eyebrow}</small>
                  <strong>{record.prompt}</strong>
                  <span title={record.questionId}>{kindLabel(t, record.kind)}</span>
                </div>
                <span className={styles.modeCell} role="cell">
                  {t(`calibration.game.${record.game}`)}
                </span>
                <span className={styles.tierCell} role="cell">
                  {t("calibration.row.tier", { tier: record.difficulty })}
                </span>
                <span className={styles.numberCell} role="cell">
                  <strong>{number(record.total)}</strong>
                  <small>{t("calibration.row.correct", { count: record.correct })}</small>
                </span>
                <span className={styles.numberCell} role="cell">
                  <strong>{percentage(record.signal.accuracy)}</strong>
                  <small>{t("calibration.row.target", { band: expectedBand(record) })}</small>
                </span>
                <div className={styles.signalCell} role="cell">
                  <span data-status={record.signal.status}>{t(`calibration.status.${record.signal.status}`)}</span>
                  <strong>{t(record.signal.adviceKey, record.signal.adviceVars)}</strong>
                  {report && (
                    <small>
                      <Flag />
                      {record.reportTotal} · {t(REPORT_REASON_LABEL_KEYS[report])}
                    </small>
                  )}
                  <div className={styles.reviewState} data-review-status={record.review.status}>
                    <span>{t(`calibration.review.${record.review.status}`)}</span>
                    {canReview && record.review.status !== "unreviewed" && (
                      <div className={styles.reviewActions}>
                        {saving ? (
                          <span className={styles.reviewSaving}>
                            <LoaderCircle /> {t("calibration.action.saving")}
                          </span>
                        ) : record.review.status === "open" ? (
                          <>
                            <button type="button" onClick={() => void updateReview(record, "reviewed")}>
                              <Check /> {t("calibration.action.keep")}
                            </button>
                            <button type="button" onClick={() => void updateReview(record, "quarantined")}>
                              <ArchiveX /> {t("calibration.action.quarantine")}
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => void updateReview(record, "open")}>
                            <RotateCcw /> {t("calibration.action.reopen")}
                          </button>
                        )}
                      </div>
                    )}
                    {reviewError === record.questionId && <small role="alert">{t("calibration.action.failed")}</small>}
                  </div>
                </div>
              </div>
            );
          })}
          {!visible.length && (
            <div className={styles.empty}>
              <Search />
              <strong>{t("calibration.empty.title")}</strong>
              <span>{t("calibration.empty.body")}</span>
            </div>
          )}
        </div>
        <nav className={styles.pagination} aria-label={t("calibration.pages.bottom")}>
          <button
            type="button"
            data-testid="calibration-previous-page"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            {t("calibration.pages.previous")}
          </button>
          <span>{t("calibration.pages.position", { page: currentPage + 1, pages: pageCount })}</span>
          <button
            type="button"
            data-testid="calibration-next-page"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            {t("calibration.pages.next")}
          </button>
        </nav>
      </section>

      <footer className={styles.footer}>
        <span>{t("calibration.footer", { count: reviewTotals.reviewed })}</span>
      </footer>
      <SiteFooter current="calibration" />
    </main>
  );
}
