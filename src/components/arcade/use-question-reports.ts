import { useCallback, useEffect, useRef, useState } from "react";
import { isReportReason, QUESTION_REPORT_GRACE_MS, type ReportReason } from "@/lib/calibration";
import type { PublicRoomSettings, ReportResult, RoomSnapshot } from "@/lib/arcade-contract";
import { publicCorrectIndex } from "@/lib/public-question";
import { keyedAnswerLabel, type QuestionReportNotice, type QuestionReportTarget } from "./shared";

import type { useRoundRefs } from "./use-round-refs";

import type { RefObject } from "react";

export function useQuestionReports({
  phaseRef,
  currentQuestionRef,
  roundIdRef,
  identityGenerationRef,
  roomSettingsRef,
  roomSnapshotRef,
  ensurePlayerId,
  revealDeadline,
  activeRoundId,
}: ReturnType<typeof useRoundRefs> & {
  identityGenerationRef: RefObject<number>;
  roomSettingsRef: RefObject<PublicRoomSettings | null>;
  roomSnapshotRef: RefObject<RoomSnapshot | null>;
  ensurePlayerId: () => string;
  revealDeadline: number | null;
  activeRoundId: string;
}) {
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const [reportedReason, setReportedReason] = useState<ReportReason | null>(null);

  const [reportTarget, setReportTarget] = useState<QuestionReportTarget | null>(null);

  const [reportNotice, setReportNotice] = useState<QuestionReportNotice | null>(null);

  const reportTargetRef = useRef<QuestionReportTarget | null>(null);

  const reportFocusRef = useRef<string | null>(null);

  const reportStateRef = useRef<"idle" | "sending" | "sent" | "error">("idle");

  const updateReportTarget = useCallback((target: QuestionReportTarget | null) => {
    reportTargetRef.current = target;
    setReportTarget(target);
  }, []);

  const updateReportState = useCallback((state: "idle" | "sending" | "sent" | "error") => {
    reportStateRef.current = state;
    setReportState(state);
  }, []);

  const submitQuestionReport = useCallback(
    async (reason: ReportReason) => {
      const target = reportTargetRef.current;
      const settings = roomSettingsRef.current;
      if (!target || !settings || reportStateRef.current === "sending") return;

      const reportIdentityGeneration = identityGenerationRef.current;
      updateReportState("sending");

      try {
        const response = await fetch("/api/reports", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...settings,
            roundId: target.roundId,
            reason,
            voterId: ensurePlayerId(),
          }),
        });
        const payload: unknown = await response.json();
        if (!response.ok || !payload || typeof payload !== "object") throw new Error("REPORT_FAILED");

        const candidate = payload as Partial<ReportResult>;
        if (typeof candidate.accepted !== "boolean" || !isReportReason(candidate.reason)) {
          throw new Error("REPORT_FAILED");
        }

        if (
          reportTargetRef.current?.roundId !== target.roundId ||
          reportIdentityGeneration !== identityGenerationRef.current
        )
          return;

        if (roundIdRef.current === target.roundId) {
          setReportedReason(candidate.reason);
          updateReportState("sent");
        } else {
          const currentReport = roomSnapshotRef.current?.playerReport ?? null;
          setReportedReason(currentReport);
          updateReportState(currentReport ? "sent" : "idle");
        }
        updateReportTarget(null);
        setReportNotice({
          reason: candidate.reason,
          expiresAt: Date.now() + 5_000,
        });
      } catch {
        if (
          reportTargetRef.current?.roundId === target.roundId &&
          reportIdentityGeneration === identityGenerationRef.current
        ) {
          updateReportState("error");
        }
      }
    },
    [ensurePlayerId, updateReportState, updateReportTarget],
  );

  const toggleQuestionReport = useCallback(() => {
    const snapshot = roomSnapshotRef.current;
    const question = currentQuestionRef.current;
    const existingTarget = reportTargetRef.current;

    if (existingTarget?.roundId === snapshot?.round.id) {
      updateReportTarget(null);
      updateReportState("idle");
      return;
    }

    if (
      phaseRef.current !== "reveal" ||
      !snapshot ||
      !question ||
      snapshot.round.phase !== "reveal" ||
      snapshot.round.id !== roundIdRef.current
    ) {
      return;
    }

    updateReportState("idle");
    updateReportTarget({
      roundId: snapshot.round.id,
      prompt: question.prompt,
      answer: question.reveal?.correctAnswerKey
        ? keyedAnswerLabel(question.reveal.correctAnswerKey, question.eyebrow, question)
        : (question.answers[publicCorrectIndex(question)] ?? question.eyebrow),
      expiresAt: Math.max(Date.now() + 1_000, (revealDeadline ?? Date.now()) + QUESTION_REPORT_GRACE_MS),
    });
  }, [revealDeadline, updateReportState, updateReportTarget]);

  const dismissQuestionReport = useCallback(() => {
    updateReportTarget(null);
    const currentReport = roomSnapshotRef.current?.playerReport ?? null;
    setReportedReason(currentReport);
    updateReportState(currentReport ? "sent" : "idle");
  }, [updateReportState, updateReportTarget]);

  useEffect(() => {
    if (!reportTarget) return;
    const timeout = window.setTimeout(
      () => {
        if (reportTargetRef.current?.roundId !== reportTarget.roundId) return;
        updateReportTarget(null);
        const currentReport = roomSnapshotRef.current?.playerReport ?? null;
        setReportedReason(currentReport);
        updateReportState(currentReport ? "sent" : "idle");
      },
      Math.max(0, reportTarget.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [reportTarget, updateReportState, updateReportTarget]);

  useEffect(() => {
    const reason = reportFocusRef.current;
    if (!reason) return;
    const button = document.querySelector<HTMLButtonElement>(
      `[data-testid="report-carryover"] [data-report-reason="${reason}"]`,
    );
    if (button) {
      reportFocusRef.current = null;
      button.focus({ preventScroll: true });
    }
  }, [activeRoundId, reportTarget]);

  useEffect(() => {
    if (!reportNotice) return;
    const timeout = window.setTimeout(
      () => setReportNotice((notice) => (notice?.expiresAt === reportNotice.expiresAt ? null : notice)),
      Math.max(0, reportNotice.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [reportNotice]);

  return {
    reportState,
    reportedReason,
    setReportedReason,
    reportTarget,
    reportNotice,
    setReportNotice,
    reportTargetRef,
    reportFocusRef,
    updateReportTarget,
    updateReportState,
    submitQuestionReport,
    toggleQuestionReport,
    dismissQuestionReport,
  };
}
