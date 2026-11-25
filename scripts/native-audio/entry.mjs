// Inside the container: make the host's app answer on the same 127.0.0.1 address,
// so the page keeps its origin (and its secure context), then run the check.
import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";

const port = Number(process.env.HOST_APP_PORT);
if (port) {
  const forward = createServer((client) => {
    const host = connect(port, "host.docker.internal");
    client.pipe(host).pipe(client);
    client.on("error", () => host.destroy());
    host.on("error", () => client.destroy());
  });
  await new Promise((resolve, reject) => {
    forward.once("error", reject);
    forward.listen(port, "127.0.0.1", resolve);
  });
}
const check = spawn(process.execPath, ["scripts/check-native-feedback-sounds.mjs", ...process.argv.slice(2)], {
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => check.kill(signal));
check.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
check.on("exit", (code) => process.exit(code ?? 1));
