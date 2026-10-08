import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";

const MANIFEST_PATH = "docs/content-review.json";
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRepoPath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\\") &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

async function collectFiles(root, directory, extension) {
  const paths = [];
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Review inputs must not be symbolic links: ${path}`);
    if (entry.isDirectory()) paths.push(...(await collectFiles(root, path, extension)));
    else if (entry.isFile() && path.endsWith(extension)) paths.push(path);
  }
  return paths;
}

async function snapshot(root) {
  const paths = [
    ...(await collectFiles(root, "src/data", ".json")),
    ...(await collectFiles(root, "scripts", ".mjs")),
  ].sort();
  const files = {};
  for (const path of paths) files[path] = sha256(await readFile(join(root, path)));
  const metadata = JSON.parse(await readFile(join(root, "src/data/trivia-meta.generated.json"), "utf8"));
  if (metadata.patch !== CLIENT_CONSTANT_AUDIT.patch) {
    throw new Error(
      `Catalog patch ${metadata.patch} does not match the client audit patch ${CLIENT_CONSTANT_AUDIT.patch}.`,
    );
  }
  return { gameplayPatch: metadata.patch, files };
}

/** Record a completed review. This function does not perform the factual review. */
export async function recordContentReview(root, { reviewedBy, evidence }) {
  if (typeof reviewedBy !== "string" || !reviewedBy.trim()) throw new Error("A named reviewer is required.");
  if (!isRepoPath(evidence) || !evidence.endsWith(".md") || evidence === MANIFEST_PATH) {
    throw new Error("Review evidence must be a Markdown file inside the repository.");
  }
  const evidenceBytes = await readFile(join(root, evidence));
  if (!evidenceBytes.toString("utf8").trim()) throw new Error("Review evidence is empty.");
  const current = await snapshot(root);
  const manifest = {
    schemaVersion: 1,
    reviewedAt: new Date().toISOString(),
    reviewedBy: reviewedBy.trim(),
    gameplayPatch: current.gameplayPatch,
    sourceAudit: CLIENT_CONSTANT_AUDIT,
    evidence: { path: evidence, sha256: sha256(evidenceBytes) },
    scope: "Committed catalog and content scripts. Original upstream downloads are not pinned by this record.",
    files: current.files,
  };
  await mkdir(dirname(join(root, MANIFEST_PATH)), { recursive: true });
  await writeFile(join(root, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Reject a release when its content differs from the last recorded review. */
export async function validateContentRelease(root) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, MANIFEST_PATH), "utf8"));
  } catch (error) {
    throw new Error(
      `Content review is missing or unreadable: ${MANIFEST_PATH}. Record a completed review before release.`,
      { cause: error },
    );
  }
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.reviewedBy !== "string" ||
    !manifest.reviewedBy.trim() ||
    typeof manifest.reviewedAt !== "string" ||
    !Number.isFinite(Date.parse(manifest.reviewedAt)) ||
    !manifest.files ||
    Array.isArray(manifest.files) ||
    typeof manifest.files !== "object" ||
    !isRepoPath(manifest.evidence?.path) ||
    !HASH_PATTERN.test(manifest.evidence?.sha256 ?? "")
  ) {
    throw new Error("Content review record has an invalid schema.");
  }
  const current = await snapshot(root);
  const problems = [];
  if (manifest.gameplayPatch !== current.gameplayPatch) problems.push("The reviewed gameplay patch changed.");
  if (JSON.stringify(manifest.sourceAudit) !== JSON.stringify(CLIENT_CONSTANT_AUDIT))
    problems.push("The source audit metadata changed.");
  for (const [path, hash] of Object.entries(current.files)) {
    if (!Object.hasOwn(manifest.files, path)) problems.push(`Unreviewed file: ${path}`);
    else if (manifest.files[path] !== hash) problems.push(`Changed reviewed file: ${path}`);
  }
  for (const path of Object.keys(manifest.files)) {
    if (!Object.hasOwn(current.files, path)) problems.push(`Missing reviewed file: ${path}`);
  }
  try {
    if (sha256(await readFile(join(root, manifest.evidence.path))) !== manifest.evidence.sha256) {
      problems.push(`Review evidence changed: ${manifest.evidence.path}`);
    }
  } catch {
    problems.push(`Review evidence is missing: ${manifest.evidence.path}`);
  }
  if (problems.length)
    throw new Error(`${problems.join("\n")}\nComplete a content review before recording a new release manifest.`);
  return manifest;
}

async function main() {
  const args = process.argv.slice(2);
  const record = args.includes("--record-review");
  for (const arg of args) {
    if (arg !== "--record-review" && !arg.startsWith("--reviewed-by=") && !arg.startsWith("--evidence=")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!record && args.length) throw new Error("Reviewer and evidence options require --record-review.");
  const root = process.cwd();
  const manifest = record
    ? await recordContentReview(root, {
        reviewedBy: args.find((arg) => arg.startsWith("--reviewed-by="))?.slice("--reviewed-by=".length),
        evidence: args.find((arg) => arg.startsWith("--evidence="))?.slice("--evidence=".length),
      })
    : await validateContentRelease(root);
  console.log(
    `${record ? "Recorded" : "Validated"} content review for patch ${manifest.gameplayPatch}: ${Object.keys(manifest.files).length} files, reviewed ${manifest.reviewedAt} by ${manifest.reviewedBy}.`,
  );
  console.log(
    "This check verifies reviewed file hashes. It does not check current upstream facts or asset permissions.",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
