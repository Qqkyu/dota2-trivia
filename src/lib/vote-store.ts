import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CrowdResult, PlayerVote, VoteResult } from "@/lib/arcade-contract";
import type { GameId } from "@/lib/game-catalogs";

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
  return {
    counts,
    total: counts.reduce((sum, count) => sum + count, 0),
  };
}

function voterHash(roomId: string, voterId: string) {
  const salt = process.env.ARCADE_VOTER_SALT || "queue-arcade-local-v1";
  return createHash("sha256").update(`${salt}:${roomId}:${voterId}`).digest("base64url");
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
  const hash = voterId ? voterHash(roomId, voterId) : null;

  return {
    ...crowdFor(round),
    playerVote: hash && round?.voters[hash] ? { ...round.voters[hash] } : null,
  };
}

export async function recordRoundVote(input: {
  roundId: string;
  roomId: string;
  gameId: GameId;
  contentVersion: string;
  questionId: string;
  correctIndex: number;
  answerIndex: number;
  voterId: string;
  submittedAt: number;
}): Promise<VoteResult> {
  return mutate((state) => {
    const hash = voterHash(input.roomId, input.voterId);
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
    };
    round.voters[hash] = playerVote;
    round.counts[input.answerIndex] += 1;
    round.updatedAt = input.submittedAt;
    state.rounds[input.roundId] = round;

    const questionKey = `${input.gameId}:${input.contentVersion}:${input.questionId}`;
    const question =
      state.questions[questionKey] ??
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
    state.questions[questionKey] = question;

    return {
      accepted: true,
      ...crowdFor(round),
      playerVote,
    };
  });
}
