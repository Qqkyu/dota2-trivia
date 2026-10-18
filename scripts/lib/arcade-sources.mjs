import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// The arcade client lives in queue-arcade.tsx plus src/components/arcade/*.
// Validators that check UI contracts as source text read the whole set.
async function readAll(root, files) {
  const texts = await Promise.all(files.map((file) => readFile(join(root, file), "utf8")));
  return files.map((file, index) => `/* ${file} */\n${texts[index]}`).join("\n\n");
}

async function arcadeFiles(root, test) {
  const entries = await readdir(join(root, "src", "components", "arcade"));
  return entries
    .filter(test)
    .sort()
    .map((entry) => `src/components/arcade/${entry}`);
}

/** Every TypeScript source of the arcade client, concatenated. */
export async function readArcadeSource(root) {
  const files = ["src/components/queue-arcade.tsx", ...(await arcadeFiles(root, (f) => /\.(ts|tsx)$/.test(f)))];
  return readAll(root, files);
}

/** Every CSS module of the arcade client, concatenated. */
export async function readArcadeStyles(root) {
  const files = [
    "src/components/queue-arcade.module.css",
    ...(await arcadeFiles(root, (f) => f.endsWith(".module.css"))),
  ];
  return readAll(root, files);
}
