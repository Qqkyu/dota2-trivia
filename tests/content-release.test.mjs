import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { recordContentReview, validateContentRelease } from "../scripts/validate-content-release.mjs";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function catalog() {
  const root = await mkdtemp(join(tmpdir(), "queue-content-review-"));
  roots.push(root);
  for (const directory of ["src/data", "scripts", "docs"]) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, "src/data/trivia-meta.generated.json"), '{"patch":"7.41f"}\n');
  await writeFile(join(root, "src/data/questions.generated.json"), '[{"id":"one","answer":"reviewed"}]\n');
  await writeFile(join(root, "scripts/sync-dota-data.mjs"), "// reviewed generator\n");
  await writeFile(join(root, "docs/fact-review.md"), "Checked the answer against the patch source.\n");
  return root;
}

describe("content release approval", () => {
  it("blocks changed question data even when the patch stays the same", async () => {
    const root = await catalog();
    await recordContentReview(root, { reviewedBy: "Content reviewer", evidence: "docs/fact-review.md" });
    await expect(validateContentRelease(root)).resolves.toMatchObject({ gameplayPatch: "7.41f" });
    await writeFile(join(root, "src/data/questions.generated.json"), '[{"id":"one","answer":"unreviewed"}]\n');
    await expect(validateContentRelease(root)).rejects.toThrow(
      "Changed reviewed file: src/data/questions.generated.json",
    );
  });

  it.each([
    ["new catalog", "src/data/new-questions.json", "[]\n", "Unreviewed file"],
    ["changed generator", "scripts/sync-dota-data.mjs", "// new upstream source\n", "Changed reviewed file"],
    ["changed review evidence", "docs/fact-review.md", "Different review.\n", "Review evidence changed"],
  ])("blocks a %s until it is reviewed", async (_label, path, bytes, message) => {
    const root = await catalog();
    await recordContentReview(root, { reviewedBy: "Content reviewer", evidence: "docs/fact-review.md" });
    await writeFile(join(root, path), bytes);
    await expect(validateContentRelease(root)).rejects.toThrow(message);
  });

  it("blocks a missing catalog file", async () => {
    const root = await catalog();
    await recordContentReview(root, { reviewedBy: "Content reviewer", evidence: "docs/fact-review.md" });
    await rm(join(root, "src/data/questions.generated.json"));
    await expect(validateContentRelease(root)).rejects.toThrow(
      "Missing reviewed file: src/data/questions.generated.json",
    );
  });

  it("requires a recorded review and its named evidence", async () => {
    const root = await catalog();
    await expect(validateContentRelease(root)).rejects.toThrow("Content review is missing or unreadable");
    await expect(recordContentReview(root, { reviewedBy: "", evidence: "docs/fact-review.md" })).rejects.toThrow(
      "named reviewer",
    );
    await expect(recordContentReview(root, { reviewedBy: "Reviewer", evidence: "../outside.md" })).rejects.toThrow(
      "inside the repository",
    );
  });
});
