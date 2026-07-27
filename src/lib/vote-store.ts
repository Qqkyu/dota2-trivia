import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CrowdResult, PlayerVote, ReportResult, VoteResult } from "@/lib/arcade-contract";
import { emptyReportCounts, isReportReason, type ReportCounts, type ReportReason } from "@/lib/calibration";
import type { GameId } from "@/lib/game-catalogs";
import { MAP_SENSE_MAX_CROWD_PINS } from "@/lib/map-sense";
import type { MapPosition } from "@/lib/map-types";

interface StoredRound {
  roomId: string;
  gameId: GameId;
  contentVersion: string;
  questionId: string;
  counts: CrowdResult["counts"];
  voters: Record<string, PlayerVote>;
  createdAt: number;
  updatedAt: number;
}

interface StoredQuestion {
  gameId: GameId;
  contentVersion: string;
  questionId: string;
  counts: CrowdResult["counts"];
  total: number;
  correctIndex: number;
  reports?: ReportCounts;
  reporters?: Record<string, ReportReason>;
  updatedAt: number;
}

export interface QuestionStats {
  gameId: GameId;
  contentVersion: string;
  questionId: string;
  counts: CrowdResult["counts"];
  total: number;
  correctIndex: number;
  reports: ReportCounts;
  updatedAt: number;
}

interface PersistentVoteState {
  version: 1;
  rounds: Record<string, StoredRound>;
  questions: Record<string, StoredQuestion>;
}

interface RuntimeVoteStore {
  filePath: string;
  statePromise: Promise<PersistentVoteState> | null;
  writeQueue: Promise<void>;
}

const globalVoteStore = globalThis as typeof globalThis & {
  __queueArcadePersistentVotes?: RuntimeVoteStore;
};

function configuredFilePath() {
  const configured = process.env.ARCADE_DATA_FILE?.trim();
  if (configured && path.isAbsolute(configured)) return configured;
  return path.join(/* turbopackIgnore: true */ process.cwd(), configured || ".data/queue-arcade-votes.json");
}

const runtime =
  globalVoteStore.__queueArcadePersistentVotes ??
  ({
    filePath: configuredFilePath(),
    statePromise: null,
    writeQueue: Promise.resolve(),
  } satisfies RuntimeVoteStore);

globalVoteStore.__queueArcadePersistentVotes = runtime;

function emptyState(): PersistentVoteState {
  return {
    version: 1,
    rounds: {},
    questions: {},
  };
}

function validCounts(value: unknown): value is CrowdResult["counts"] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0)
  );
}

function validState(value: unknown): value is PersistentVoteState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PersistentVoteState>;
  return candidate.version === 1 && Boolean(candidate.rounds) && Boolean(candidate.questions);
}

async function loadState() {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ runtime.filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!validState(parsed)) throw new Error("Unsupported persistent vote format.");
    return parsed;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "ENOENT") return emptyState();
    throw error;
  }
}

function stateForRuntime() {
  runtime.statePromise ??= loadState();
  return runtime.statePromise;
}

function crowdFor(round: StoredRound | undefined): CrowdResult {
  const counts: CrowdResult["counts"] = round && validCounts(round.counts) ? [...round.counts] : [0, 0, 0, 0];
  const positions = round
    ? Object.values(round.voters)
        .flatMap((vote) => (vote.mapPosition ? [{ ...vote.mapPosition }] : []))
        .slice(-MAP_SENSE_MAX_CROWD_PINS)
    : [];
  return {
    counts,
    total: counts.reduce((sum, count) => sum + count, 0),
    positions,
  };
}

function anonymousHash(scope: string, voterId: string) {
  const salt = process.env.ARCADE_VOTER_SALT || "queue-arcade-local-v1";
  return createHash("sha256").update(`${salt}:${scope}:${voterId}`).digest("base64url");
}

function reportsFor(question: StoredQuestion | undefined): ReportCounts {
  const reports = emptyReportCounts();
  if (!question?.reports || typeof question.reports !== "object") return reports;

  for (const reason of Object.keys(reports) as ReportReason[]) {
    const count = question.reports[reason];
    if (typeof count === "number" && Number.isInteger(count) && count >= 0) reports[reason] = count;
  }
  return reports;
}

function questionKey(gameId: GameId, contentVersion: string, questionId: string) {
  return `${gameId}:${contentVersion}:${questionId}`;
}

async function persist(state: PersistentVoteState) {
  const directory = path.dirname(runtime.filePath);
  const temporaryPath = `${runtime.filePath}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, runtime.filePath);
}

async function mutate<T>(operation: (state: PersistentVoteState) => T) {
  const task = runtime.writeQueue
    .catch(() => undefined)
    .then(async () => {
      const state = await stateForRuntime();
      const result = operation(state);
      await persist(state);
      return result;
    });

  runtime.writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export async function getRoundCrowd(roundId: string, roomId: string, voterId?: string) {
  await runtime.writeQueue;
  const state = await stateForRuntime();
  const round = state.rounds[roundId];
  const hash = voterId ? anonymousHash(roomId, voterId) : null;

  return {
    ...crowdFor(round),
    playerVote: hash && round?.voters[hash] ? { ...round.voters[hash] } : null,
  };
}

export async function getPlayerQuestionReport(
  gameId: GameId,
  contentVersion: string,
  questionId: string,
  voterId?: string,
) {
  if (!voterId) return null;
  await runtime.writeQueue;
  const state = await stateForRuntime();
  const key = questionKey(gameId, contentVersion, questionId);
  const question = state.questions[key];
  const hash = anonymousHash(`report:${key}`, voterId);
  const reason = question?.reporters?.[hash];
  return isReportReason(reason) ? reason : null;
}

export async function getQuestionStats(gameId: GameId, contentVersion: string): Promise<QuestionStats[]> {
  await runtime.writeQueue;
  const state = await stateForRuntime();
  return Object.values(state.questions)
    .filter((question) => question.gameId === gameId && question.contentVersion === contentVersion)
    .map((question) => ({
      gameId: question.gameId,
      contentVersion: question.contentVersion,
      questionId: question.questionId,
      counts: validCounts(question.counts) ? [...question.counts] : [0, 0, 0, 0],
      total: Number.isInteger(question.total) && question.total >= 0 ? question.total : 0,
      correctIndex:
        Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex <= 3
          ? question.correctIndex
          : 0,
      reports: reportsFor(question),
      updatedAt: Number.isFinite(question.updatedAt) ? question.updatedAt : 0,
    }));
}

export async function recordRoundVote(input: {
  roundId: string;
  roomId: string;
  gameId: GameId;
  contentVersion: string;
  questionId: string;
  correctIndex: number;
  answerIndex: number;
  mapPosition?: MapPosition;
  voterId: string;
  submittedAt: number;
}): Promise<VoteResult> {
  return mutate((state) => {
    const hash = anonymousHash(input.roomId, input.voterId);
    const existingRound = state.rounds[input.roundId];
    const round =
      existingRound ??
      ({
        roomId: input.roomId,
        gameId: input.gameId,
        contentVersion: input.contentVersion,
        questionId: input.questionId,
        counts: [0, 0, 0, 0],
        voters: {},
        createdAt: input.submittedAt,
        updatedAt: input.submittedAt,
      } satisfies StoredRound);

    if (
      round.roomId !== input.roomId ||
      round.gameId !== input.gameId ||
      round.contentVersion !== input.contentVersion ||
      round.questionId !== input.questionId
    ) {
      throw new Error("Persistent round identity mismatch.");
    }

    const existingVote = round.voters[hash];
    if (existingVote) {
      return {
        accepted: false,
        ...crowdFor(round),
        playerVote: { ...existingVote },
      };
    }

    const playerVote = {
      answerIndex: input.answerIndex,
      submittedAt: input.submittedAt,
      ...(input.mapPosition ? { mapPosition: { ...input.mapPosition } } : {}),
    };
    round.voters[hash] = playerVote;
    round.counts[input.answerIndex] += 1;
    round.updatedAt = input.submittedAt;
    state.rounds[input.roundId] = round;

    const key = questionKey(input.gameId, input.contentVersion, input.questionId);
    const question =
      state.questions[key] ??
      ({
        gameId: input.gameId,
        contentVersion: input.contentVersion,
        questionId: input.questionId,
        counts: [0, 0, 0, 0],
        total: 0,
        correctIndex: input.correctIndex,
        updatedAt: input.submittedAt,
      } satisfies StoredQuestion);
    question.correctIndex = input.correctIndex;
    question.counts[input.answerIndex] += 1;
    question.total += 1;
    question.updatedAt = input.submittedAt;
    state.questions[key] = question;

    return {
      accepted: true,
      ...crowdFor(round),
      playerVote,
    };
  });
}

export async function recordQuestionReport(input: {
  gameId: GameId;
  contentVersion: string;
  questionId: string;
  correctIndex: number;
  reason: ReportReason;
  voterId: string;
  submittedAt: number;
}): Promise<ReportResult> {
  return mutate((state) => {
    const key = questionKey(input.gameId, input.contentVersion, input.questionId);
    const question =
      state.questions[key] ??
      ({
        gameId: input.gameId,
        contentVersion: input.contentVersion,
        questionId: input.questionId,
        counts: [0, 0, 0, 0],
        total: 0,
        correctIndex: input.correctIndex,
        reports: emptyReportCounts(),
        reporters: {},
        updatedAt: input.submittedAt,
      } satisfies StoredQuestion);

    if (
      question.gameId !== input.gameId ||
      question.contentVersion !== input.contentVersion ||
      question.questionId !== input.questionId
    ) {
      throw new Error("Persistent question identity mismatch.");
    }

    const reporters =
      question.reporters && typeof question.reporters === "object"
        ? question.reporters
        : ({} as Record<string, ReportReason>);
    const hash = anonymousHash(`report:${key}`, input.voterId);
    const existingReason = reporters[hash];
    if (isReportReason(existingReason)) {
      return { accepted: false, reason: existingReason };
    }

    const reports = reportsFor(question);
    reports[input.reason] += 1;
    reporters[hash] = input.reason;
    question.correctIndex = input.correctIndex;
    question.reports = reports;
    question.reporters = reporters;
    question.updatedAt = input.submittedAt;
    state.questions[key] = question;

    return { accepted: true, reason: input.reason };
  });
}
