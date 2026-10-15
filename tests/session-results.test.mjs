import { describe, expect, it } from "vitest";
import { reconcileSessionResult, sessionResultTotals } from "../src/lib/session-results";

const result = (number, changes = {}) => ({
  id: `room:round:${number}`,
  accepted: true,
  correct: true,
  points: 200,
  ...changes,
});
describe("session result reconciliation", () => {
  it("corrects changing crowd awards without counting the answer twice", () => {
    const initial = reconcileSessionResult([], result(1));
    expect(reconcileSessionResult(initial, result(1))).toBe(initial);
    const corrected = reconcileSessionResult(initial, result(1, { points: 100 }));
    expect(sessionResultTotals(corrected)).toEqual({ score: 100, correctCount: 1, streak: 1 });
  });
  it("upgrades a provisional no-vote once the accepted vote becomes visible", () => {
    const provisional = result(1, { accepted: false, correct: false, points: 0 });
    const accepted = reconcileSessionResult(reconcileSessionResult([], provisional), result(1));
    expect(sessionResultTotals(accepted)).toEqual({ score: 200, correctCount: 1, streak: 1 });
    expect(reconcileSessionResult(accepted, provisional)).toBe(accepted);
  });
  it("uses round order for the streak when missed results arrive out of order", () => {
    let records = reconcileSessionResult([], result(3));
    records = reconcileSessionResult(records, result(1));
    records = reconcileSessionResult(records, result(2, { correct: false, points: 0 }));
    expect(sessionResultTotals(records)).toEqual({ score: 400, correctCount: 2, streak: 1 });
    expect(records.map((record) => record.id)).toEqual([1, 2, 3].map((number) => result(number).id));
  });
});
