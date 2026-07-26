export interface CrowdResult {
  counts: [number, number, number, number];
  total: number;
}

interface QuestionVotes {
  counts: CrowdResult["counts"];
  voters: Set<string>;
}

interface VoteStore {
  questions: Map<string, QuestionVotes>;
}

const globalVoteStore = globalThis as typeof globalThis & {
  __queueArcadeVotes?: VoteStore;
  __queueTriviaVotes?: VoteStore;
};

const store =
  globalVoteStore.__queueArcadeVotes ??
  globalVoteStore.__queueTriviaVotes ??
  ({
    questions: new Map(),
  } satisfies VoteStore);

globalVoteStore.__queueArcadeVotes = store;
globalVoteStore.__queueTriviaVotes = store;

function bucketFor(questionId: string) {
  let bucket = store.questions.get(questionId);

  if (!bucket) {
    bucket = {
      counts: [0, 0, 0, 0],
      voters: new Set(),
    };
    store.questions.set(questionId, bucket);
  }

  return bucket;
}

function resultFor(bucket: QuestionVotes): CrowdResult {
  const counts: CrowdResult["counts"] = [...bucket.counts];
  return {
    counts,
    total: counts.reduce((sum, count) => sum + count, 0),
  };
}

export function getCrowdResult(questionId: string) {
  return resultFor(bucketFor(questionId));
}

export function recordVote(questionId: string, answerIndex: number, voterId: string) {
  const bucket = bucketFor(questionId);

  if (bucket.voters.has(voterId)) {
    return {
      accepted: false,
      ...resultFor(bucket),
    };
  }

  bucket.voters.add(voterId);
  bucket.counts[answerIndex] += 1;

  return {
    accepted: true,
    ...resultFor(bucket),
  };
}
