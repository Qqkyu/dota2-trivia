import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CrowdResult, PlayerVote, ReportResult, VoteResult } from "@/lib/arcade-contract";
import { emptyReportCounts, isReportReason, type ReportCounts, type ReportReason } from "@/lib/calibration";
import type { GameId } from "@/lib/game-catalogs";
import { MAP_SENSE_MAX_CROWD_PINS } from "@/lib/map-sense";
import type { MapPosition } from "@/lib/map-types";
import type { QuestionReviewState, StoredQuestionReview } from "@/lib/question-review";
import { anonymousVoterHash } from "@/lib/voter-hash";

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
  contentVersion?: string;
  questionId: string;
  questionRevision?: string;
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

export interface RoundVoteInput {
  roundId: string;
  roomId: string;
  gameId: GameId;
  contentVersion: string;
  questionId: string;
  questionRevision: string;
  correctIndex: number;
  answerIndex: number;
  answerKey?: string;
  mapPosition?: MapPosition;
  voterId: string;
  submittedAt: number;
}

export interface QuestionReportInput {
  gameId: GameId;
  contentVersion: string;
  questionId: string;
  questionRevision: string;
  correctIndex: number;
  reason: ReportReason;
  voterId: string;
  submittedAt: number;
}

export interface QuestionReviewInput {
  gameId: GameId;
  questionId: string;
  questionRevision: string;
  state: QuestionReviewState;
  reportTotalAtReview: number;
  signalStatusAtReview: StoredQuestionReview["signalStatusAtReview"];
  updatedAt: number;
}

export interface VoteStoreHealth {
  backend: "file" | "postgres";
  ok: true;
}

interface PersistentVoteState {
  version: 1 | 2 | 3;
  rounds: Record<string, StoredRound>;
  questions: Record<string, StoredQuestion>;
  reviews?: Record<string, StoredQuestionReview>;
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
    version: 3,
    rounds: {},
    questions: {},
    reviews: {},
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
  return (
    (candidate.version === 1 || candidate.version === 2 || candidate.version === 3) &&
    Boolean(candidate.rounds) &&
    Boolean(candidate.questions)
  );
}

async function loadState(): Promise<PersistentVoteState> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ runtime.filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!validState(parsed)) throw new Error("Unsupported persistent vote format.");
    return { ...parsed, version: 3 as const, reviews: parsed.reviews ?? {} };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "ENOENT") return emptyState();
    throw error;
  }
}

function stateForRuntime(): Promise<PersistentVoteState> {
  if (runtime.statePromise) return runtime.statePromise;
  const statePromise = loadState();
  runtime.statePromise = statePromise;
  return statePromise;
}

function crowdFor(round: StoredRound | undefined): CrowdResult {
  const counts: CrowdResult["counts"] = round && validCounts(round.counts) ? [...round.counts] : [0, 0, 0, 0];
  const positions = round
    ? Object.values(round.voters)
        .flatMap((vote) => (vote.mapPosition ? [{ ...vote.mapPosition }] : []))
        .slice(-MAP_SENSE_MAX_CROWD_PINS)
    : [];
  const keyCountMap = new Map<string, number>();
  for (const vote of Object.values(round?.voters ?? {})) {
    if (vote.answerKey) keyCountMap.set(vote.answerKey, (keyCountMap.get(vote.answerKey) ?? 0) + 1);
  }
  const keyCounts = [...keyCountMap.entries()]
    .map(([answerKey, count]) => ({ answerKey, count }))
    .sort((left, right) => right.count - left.count || left.answerKey.localeCompare(right.answerKey));
  return {
    counts,
    total: counts.reduce((sum, count) => sum + count, 0),
    positions,
    keyCounts,
  };
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

function questionKey(gameId: GameId, questionId: string, questionRevision: string) {
  return `${gameId}:${questionId}:${questionRevision}`;
}

function legacyQuestionKey(gameId: GameId, contentVersion: string, questionId: string) {
  return `${gameId}:${contentVersion}:${questionId}`;
}

function questionForMutation(
  state: PersistentVoteState,
  input: {
    gameId: GameId;
    contentVersion: string;
    questionId: string;
    questionRevision: string;
    correctIndex: number;
    submittedAt: number;
  },
) {
  const key = questionKey(input.gameId, input.questionId, input.questionRevision);
  const legacyKey = legacyQuestionKey(input.gameId, input.contentVersion, input.questionId);
  let question = state.questions[key];

  if (!question) {
    const legacy = state.questions[legacyKey];
    if (legacy && !legacy.questionRevision && legacy.contentVersion === input.contentVersion) {
      question = { ...legacy, contentVersion: undefined, questionRevision: input.questionRevision };
      delete state.questions[legacyKey];
    }
  }

  question ??= {
    gameId: input.gameId,
    questionId: input.questionId,
    questionRevision: input.questionRevision,
    counts: [0, 0, 0, 0],
    total: 0,
    correctIndex: input.correctIndex,
    updatedAt: input.submittedAt,
  };

  if (
    question.gameId !== input.gameId ||
    question.questionId !== input.questionId ||
    question.questionRevision !== input.questionRevision
  ) {
    throw new Error("Persistent question identity mismatch.");
  }

  state.questions[key] = question;
  return { key, question };
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
      state.version = 3;
      state.reviews ??= {};
      const result = operation(state);
      const retentionHours = Number(process.env.ARCADE_ROUND_RETENTION_HOURS ?? 2);
      const retentionMs = (Number.isFinite(retentionHours) && retentionHours > 0 ? retentionHours : 2) * 60 * 60 * 1000;
      const expiresBefore = Date.now() - retentionMs;
      for (const [roundId, round] of Object.entries(state.rounds)) {
        if (round.updatedAt < expiresBefore) delete state.rounds[roundId];
      }
      await persist(state);
      return result;
    });

  runtime.writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function fileGetRoundCrowd(roundId: string, roomId: string, voterId?: string) {
  await runtime.writeQueue;
  const state = await stateForRuntime();
  const round = state.rounds[roundId];
  const hash = voterId ? anonymousVoterHash(roomId, voterId) : null;

  return {
    ...crowdFor(round),
    playerVote: hash && round?.voters[hash] ? { ...round.voters[hash] } : null,
  };
}

async function fileGetPlayerQuestionReport(
  gameId: GameId,
  contentVersion: string,
  questionId: string,
  questionRevision: string,
  voterId?: string,
) {
  if (!voterId) return null;
  await runtime.writeQueue;
  const state = await stateForRuntime();
  const key = questionKey(gameId, questionId, questionRevision);
  const legacyKey = legacyQuestionKey(gameId, contentVersion, questionId);
  const question = state.questions[key] ?? state.questions[legacyKey];
  const hash = anonymousVoterHash(`report:${key}`, voterId);
  const legacyHash = anonymousVoterHash(`report:${legacyKey}`, voterId);
  const reason = question?.reporters?.[hash] ?? question?.reporters?.[legacyHash];
  return isReportReason(reason) ? reason : null;
}

async function fileGetQuestionStats(
  gameId: GameId,
  contentVersion: string,
  questionRevisions: ReadonlyMap<string, string>,
): Promise<QuestionStats[]> {
  await runtime.writeQueue;
  const state = await stateForRuntime();
  const currentQuestions = new Map<string, StoredQuestion>();
  for (const question of Object.values(state.questions)) {
    if (question.gameId !== gameId) continue;
    const expectedRevision = questionRevisions.get(question.questionId);
    if (!expectedRevision) continue;
    const isCurrentRevision = question.questionRevision === expectedRevision;
    const isCurrentLegacy = !question.questionRevision && question.contentVersion === contentVersion;
    if (!isCurrentRevision && !isCurrentLegacy) continue;
    const existing = currentQuestions.get(question.questionId);
    if (!existing || isCurrentRevision) currentQuestions.set(question.questionId, question);
  }

  return [...currentQuestions.values()].map((question) => ({
    gameId: question.gameId,
    contentVersion,
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

async function fileGetQuestionReviews(
  gameId: GameId,
  questionRevisions: ReadonlyMap<string, string>,
): Promise<StoredQuestionReview[]> {
  await runtime.writeQueue;
  const state = await stateForRuntime();
  return Object.values(state.reviews ?? {})
    .filter(
      (review) => review.gameId === gameId && questionRevisions.get(review.questionId) === review.questionRevision,
    )
    .map((review) => ({ ...review }));
}

async function fileSetQuestionReview(input: QuestionReviewInput): Promise<StoredQuestionReview> {
  return mutate((state) => {
    const key = questionKey(input.gameId, input.questionId, input.questionRevision);
    const review: StoredQuestionReview = { ...input };
    state.reviews ??= {};
    state.reviews[key] = review;
    return { ...review };
  });
}

async function fileRecordRoundVote(input: RoundVoteInput): Promise<VoteResult> {
  return mutate((state) => {
    const hash = anonymousVoterHash(input.roomId, input.voterId);
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
      ...(input.answerKey ? { answerKey: input.answerKey } : {}),
      ...(input.mapPosition ? { mapPosition: { ...input.mapPosition } } : {}),
    };
    round.voters[hash] = playerVote;
    round.counts[input.answerIndex] += 1;
    round.updatedAt = input.submittedAt;
    state.rounds[input.roundId] = round;

    const { key, question } = questionForMutation(state, input);
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

async function fileRecordQuestionReport(input: QuestionReportInput): Promise<ReportResult> {
  return mutate((state) => {
    const { key, question } = questionForMutation(state, input);

    const reporters =
      question.reporters && typeof question.reporters === "object"
        ? question.reporters
        : ({} as Record<string, ReportReason>);
    const hash = anonymousVoterHash(`report:${key}`, input.voterId);
    const legacyKey = legacyQuestionKey(input.gameId, input.contentVersion, input.questionId);
    const legacyHash = anonymousVoterHash(`report:${legacyKey}`, input.voterId);
    const existingReason = reporters[hash] ?? reporters[legacyHash];
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

type PostgresVoteStore = typeof import("@/lib/vote-store-postgres");

let postgresStorePromise: Promise<PostgresVoteStore> | null = null;

function usesPostgres() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function postgresStore() {
  postgresStorePromise ??= import("@/lib/vote-store-postgres");
  return postgresStorePromise;
}

export function configuredVoteStoreBackend(): VoteStoreHealth["backend"] {
  return usesPostgres() ? "postgres" : "file";
}

export async function getVoteStoreHealth(): Promise<VoteStoreHealth> {
  if (usesPostgres()) return (await postgresStore()).getPostgresVoteStoreHealth();
  await runtime.writeQueue;
  await stateForRuntime();
  return { backend: "file", ok: true };
}

export async function getRoundCrowd(roundId: string, roomId: string, voterId?: string) {
  if (usesPostgres()) return (await postgresStore()).getRoundCrowd(roundId, roomId, voterId);
  return fileGetRoundCrowd(roundId, roomId, voterId);
}

export async function getPlayerQuestionReport(
  gameId: GameId,
  contentVersion: string,
  questionId: string,
  questionRevision: string,
  voterId?: string,
) {
  if (usesPostgres()) {
    return (await postgresStore()).getPlayerQuestionReport(
      gameId,
      contentVersion,
      questionId,
      questionRevision,
      voterId,
    );
  }
  return fileGetPlayerQuestionReport(gameId, contentVersion, questionId, questionRevision, voterId);
}

export async function getQuestionStats(
  gameId: GameId,
  contentVersion: string,
  questionRevisions: ReadonlyMap<string, string>,
): Promise<QuestionStats[]> {
  if (usesPostgres()) {
    return (await postgresStore()).getQuestionStats(gameId, contentVersion, questionRevisions);
  }
  return fileGetQuestionStats(gameId, contentVersion, questionRevisions);
}

export async function getQuestionReviews(
  gameId: GameId,
  questionRevisions: ReadonlyMap<string, string>,
): Promise<StoredQuestionReview[]> {
  if (usesPostgres()) return (await postgresStore()).getQuestionReviews(gameId, questionRevisions);
  return fileGetQuestionReviews(gameId, questionRevisions);
}

export async function recordRoundVote(input: RoundVoteInput): Promise<VoteResult> {
  if (usesPostgres()) return (await postgresStore()).recordRoundVote(input);
  return fileRecordRoundVote(input);
}

export async function recordQuestionReport(input: QuestionReportInput): Promise<ReportResult> {
  if (usesPostgres()) return (await postgresStore()).recordQuestionReport(input);
  return fileRecordQuestionReport(input);
}

export async function setQuestionReview(input: QuestionReviewInput): Promise<StoredQuestionReview> {
  if (usesPostgres()) return (await postgresStore()).setQuestionReview(input);
  return fileSetQuestionReview(input);
}
