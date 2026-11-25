import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPOSITORY = "queue-arcade-native-audio";
const docker = process.env.DOCKER_BIN ?? "docker";

function quiet(...args) {
  return spawnSync(docker, args, { encoding: "utf8" });
}

// Built again when the Dockerfile changes and once a month, so Chrome stays current.
function ensureImage(root) {
  const directory = join(root, "scripts/native-audio");
  const hash = createHash("sha256")
    .update(readFileSync(join(directory, "Dockerfile")))
    .digest("hex")
    .slice(0, 12);
  const image = `${REPOSITORY}:${new Date().toISOString().slice(0, 7)}-${hash}`;
  if (quiet("image", "inspect", image).status === 0) return image;
  console.log(`Building ${image} for the native sound check.`);
  const build = spawnSync(docker, ["build", "--no-cache", "--tag", image, directory], { stdio: "inherit" });
  if (build.status !== 0) throw new Error("Could not build the native sound check container.");
  const tags = quiet("image", "ls", "--format", "{{.Repository}}:{{.Tag}}", REPOSITORY).stdout.split("\n");
  const old = tags.filter((tag) => tag && tag !== image);
  if (old.length) quiet("image", "rm", ...old);
  return image;
}

/**
 * Runs the native sound check in a Linux container and returns its exit code.
 * The container sees only the app's URL and three read-only source folders.
 */
export async function runNativeAudioInContainer(args, { appUrl }) {
  const info = quiet("info", "--format", "{{.ServerVersion}}");
  if (info.status !== 0) {
    throw new Error(
      `The native sound check needs a running Docker engine (on macOS: colima start). ${
        info.error?.message ?? info.stderr.trim()
      }`,
    );
  }
  const root = resolve(import.meta.dirname, "../..");
  const image = ensureImage(root);
  const name = `${REPOSITORY}-${randomBytes(4).toString("hex")}`;
  const url = new URL(appUrl);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  const mounts = ["scripts", "src", "public"].flatMap((folder) => [
    "--mount",
    `type=bind,src=${join(root, folder)},dst=/app/${folder},readonly`,
  ]);
  const child = spawn(
    docker,
    [
      "run",
      "--rm",
      "--init",
      ...["--name", name],
      ...["--cap-drop", "ALL"],
      ...["--security-opt", "no-new-privileges"],
      ...["--shm-size", "1g"],
      ...["--env", `APP_URL=${appUrl}`],
      ...(local ? ["--env", `HOST_APP_PORT=${url.port || 80}`] : []),
      ...mounts,
      image,
      "node",
      "scripts/native-audio/entry.mjs",
      ...args,
    ],
    { stdio: "inherit" },
  );
  const stop = () => quiet("rm", "--force", name);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      stop();
      process.exit(1);
    });
  }
  return new Promise((done, fail) => {
    child.on("error", fail);
    child.on("exit", (code) => done(code ?? 1));
  });
}
