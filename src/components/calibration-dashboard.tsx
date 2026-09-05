"use client";

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
import { REPORT_REASON_LABELS, type CalibrationStatus, type ReportReason } from "@/lib/calibration";
import type { CalibrationRecord, CalibrationSnapshot } from "@/lib/calibration-data";
import type { QuestionReviewState, QuestionReviewStatus } from "@/lib/question-review";
import styles from "./calibration-dashboard.module.css";

type CalibrationFilter = "all" | "review" | "reported" | "reviewed" | "quarantined";

const FILTERS: Array<{ id: CalibrationFilter; label: string }> = [
  { id: "all", label: "All questions" },
  { id: "review", label: "Review queue" },
  { id: "reported", label: "Reported" },
  { id: "reviewed", label: "Reviewed" },
  { id: "quarantined", label: "Quarantined" },
];

const STATUS_LABELS: Record<CalibrationStatus, string> = {
  reported: "Reported",
  collecting: "Collecting",
  "too-easy": "Too easy",
  "too-hard": "Too hard",
  "on-target": "On target",
};

const REVIEW_LABELS: Record<QuestionReviewStatus, string> = {
  unreviewed: "No signal",
  open: "Open review",
  reviewed: "Reviewed",
  quarantined: "Quarantined",
};

const GAME_LABELS = {
  trivia: "Classic Trivia",
  shopkeeper: "Shopkeeper",
  "spell-link": "Spell Link",
  "fogged-vision": "Fogged Vision",
  "echo-hunt": "Echo Hunt",
  soundcheck: "Soundcheck",
  "quote-hunt": "Quote Hunt",
  "aghanim-lab": "Aghanim's Lab",
  "order-up": "Order Up",
  flashback: "Flashback",
};

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
  return result && result[1] > 0 ? REPORT_REASON_LABELS[result[0]] : null;
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CalibrationFilter>("all");
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
  const visible = filtered.slice(0, 80);
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
            <Image src={logoUrl} alt="" width={28} height={28} unoptimized />
          </span>
          <span>
            <strong>Queue Arcade</strong>
            <small>Calibration lab</small>
          </span>
        </Link>
        <div className={styles.headerActions}>
          {canReview && (
            <Link href="/ops" className={styles.backLink}>
              <BarChart3 />
              Alpha ops
            </Link>
          )}
          <Link href="/" className={styles.backLink}>
            <ArrowLeft />
            Back to arcade
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <BarChart3 />
            {snapshot.gameLabel} · {snapshot.contentLabel}
          </span>
          <h1>Question calibration</h1>
          <p>
            Real answer rates, anonymous reports, and explicit review state. Quarantine marks content for the next
            release; it never changes the live deck automatically.
          </p>
        </div>
        <div className={styles.guardrail}>
          <ShieldCheck />
          <span>
            <small>{canReview ? "Reviewer controls" : "Calibration guardrail"}</small>
            <strong>{canReview ? "Protected by your Steam account" : "20 answers before difficulty signals"}</strong>
          </span>
        </div>
      </section>

      <section className={styles.stats} aria-label="Calibration overview">
        <article>
          <Users />
          <span>Answers collected</span>
          <strong>{snapshot.totals.answers.toLocaleString("en-US")}</strong>
          <small>{snapshot.totals.answered} questions seen</small>
        </article>
        <article>
          <Check />
          <span>Sample ready</span>
          <strong>{snapshot.totals.sampled}</strong>
          <small>20+ answers</small>
        </article>
        <article>
          <AlertTriangle />
          <span>Review queue</span>
          <strong>{reviewTotals.open}</strong>
          <small>{reviewTotals.quarantined} quarantined</small>
        </article>
        <article>
          <Flag />
          <span>Player reports</span>
          <strong>{snapshot.totals.reports}</strong>
          <small>deduplicated signals</small>
        </article>
      </section>

      <section className={styles.workspace}>
        <div className={styles.controls}>
          <label>
            <Search />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search prompt, kind, or question ID"
              aria-label="Search calibration questions"
            />
          </label>
          <div role="group" aria-label="Calibration filter">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.resultMeta}>
          <span>
            Showing {visible.length} of {filtered.length}
          </span>
          <small>{snapshot.totals.questions} current-version questions</small>
        </div>

        <div className={styles.table} role="table" aria-label="Question calibration">
          <div className={styles.tableHeader} role="row">
            <span role="columnheader">Question</span>
            <span role="columnheader">Mode</span>
            <span role="columnheader">Tier</span>
            <span role="columnheader">Answers</span>
            <span role="columnheader">Accuracy</span>
            <span role="columnheader">Signal</span>
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
                  <span title={record.questionId}>{record.kind.replaceAll("-", " ")}</span>
                </div>
                <span className={styles.modeCell} role="cell">
                  {GAME_LABELS[record.game]}
                </span>
                <span className={styles.tierCell} role="cell">
                  D{record.difficulty}
                </span>
                <span className={styles.numberCell} role="cell">
                  <strong>{record.total.toLocaleString("en-US")}</strong>
                  <small>{record.correct} correct</small>
                </span>
                <span className={styles.numberCell} role="cell">
                  <strong>{percentage(record.signal.accuracy)}</strong>
                  <small>target {expectedBand(record)}</small>
                </span>
                <div className={styles.signalCell} role="cell">
                  <span data-status={record.signal.status}>{STATUS_LABELS[record.signal.status]}</span>
                  <strong>{record.signal.recommendation}</strong>
                  {report && (
                    <small>
                      <Flag />
                      {record.reportTotal} · {report}
                    </small>
                  )}
                  <div className={styles.reviewState} data-review-status={record.review.status}>
                    <span>{REVIEW_LABELS[record.review.status]}</span>
                    {canReview && record.review.status !== "unreviewed" && (
                      <div className={styles.reviewActions}>
                        {saving ? (
                          <span className={styles.reviewSaving}>
                            <LoaderCircle /> Saving
                          </span>
                        ) : record.review.status === "open" ? (
                          <>
                            <button type="button" onClick={() => void updateReview(record, "reviewed")}>
                              <Check /> Keep
                            </button>
                            <button type="button" onClick={() => void updateReview(record, "quarantined")}>
                              <ArchiveX /> Quarantine
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => void updateReview(record, "open")}>
                            <RotateCcw /> Reopen
                          </button>
                        )}
                      </div>
                    )}
                    {reviewError === record.questionId && <small role="alert">Couldn’t save · retry</small>}
                  </div>
                </div>
              </div>
            );
          })}
          {!visible.length && (
            <div className={styles.empty}>
              <Search />
              <strong>No matching questions</strong>
              <span>Try a broader search or another calibration filter.</span>
            </div>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Aggregates only · no raw player IDs · {reviewTotals.reviewed} reviewed</span>
      </footer>
      <SiteFooter current="calibration" />
    </main>
  );
}
