"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, BarChart3, Check, Flag, Search, ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { REPORT_REASON_LABELS, type CalibrationStatus, type ReportReason } from "@/lib/calibration";
import type { CalibrationRecord, CalibrationSnapshot } from "@/lib/calibration-data";
import styles from "./calibration-dashboard.module.css";

type CalibrationFilter = "all" | "attention" | "reported" | "sampled" | "collecting";

const FILTERS: Array<{ id: CalibrationFilter; label: string }> = [
  { id: "all", label: "All questions" },
  { id: "attention", label: "Needs attention" },
  { id: "reported", label: "Reported" },
  { id: "sampled", label: "Sample ready" },
  { id: "collecting", label: "Collecting" },
];

const STATUS_LABELS: Record<CalibrationStatus, string> = {
  reported: "Reported",
  collecting: "Collecting",
  "too-easy": "Too easy",
  "too-hard": "Too hard",
  "on-target": "On target",
};

const GAME_LABELS = {
  trivia: "Trivia",
  shopkeeper: "Shopkeeper",
  "spell-link": "Spell Link",
  "fogged-vision": "Fogged Vision",
  "echo-hunt": "Echo Hunt",
  soundcheck: "Soundcheck",
  "quote-hunt": "Quote Hunt",
  "map-sense": "Map Sense",
  counterplay: "Counterplay",
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
  if (filter === "attention") return ["reported", "too-easy", "too-hard"].includes(record.signal.status);
  if (filter === "reported") return record.reportTotal > 0;
  if (filter === "sampled") return record.signal.sampleReady;
  if (filter === "collecting") return !record.signal.sampleReady && record.reportTotal === 0;
  return true;
}

export function CalibrationDashboard({ snapshot, logoUrl }: { snapshot: CalibrationSnapshot; logoUrl: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CalibrationFilter>("all");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      snapshot.records.filter(
        (record) =>
          matchesFilter(record, filter) &&
          (!normalizedQuery ||
            record.prompt.toLowerCase().includes(normalizedQuery) ||
            record.questionId.toLowerCase().includes(normalizedQuery) ||
            record.kind.toLowerCase().includes(normalizedQuery)),
      ),
    [filter, normalizedQuery, snapshot.records],
  );
  const visible = filtered.slice(0, 80);

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
        <Link href="/" className={styles.backLink}>
          <ArrowLeft />
          Back to arcade
        </Link>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <BarChart3 />
            {snapshot.gameLabel} · {snapshot.contentLabel}
          </span>
          <h1>Question calibration</h1>
          <p>
            Real answer rates and anonymous reports, separated from the live deck. These are recommendations only:
            challenge tiers never change automatically.
          </p>
        </div>
        <div className={styles.guardrail}>
          <ShieldCheck />
          <span>
            <small>Calibration guardrail</small>
            <strong>20 answers before difficulty signals</strong>
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
          <span>Needs attention</span>
          <strong>{snapshot.totals.attention}</strong>
          <small>reports or tier mismatch</small>
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
            <span>Question</span>
            <span>Mode</span>
            <span>Tier</span>
            <span>Answers</span>
            <span>Accuracy</span>
            <span>Signal</span>
          </div>
          {visible.map((record) => {
            const report = leadingReport(record);
            return (
              <article
                key={record.questionId}
                className={styles.row}
                data-testid="calibration-row"
                data-calibration-status={record.signal.status}
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
                </div>
              </article>
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
        <span>Aggregates only · no raw player IDs</span>
        <span>Generated {new Date(snapshot.generatedAt).toLocaleString("en-GB")}</span>
      </footer>
    </main>
  );
}
