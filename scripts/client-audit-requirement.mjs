export function reportMissingClientSource(error, audit, args = process.argv) {
  if (error?.code !== "ENOENT") throw error;
  const message = `${audit}: client-source comparison did not complete; missing ${error.path ?? "client file"}.`;
  if (args.includes("--require-client")) throw new Error(message, { cause: error });
  console.warn(`SKIPPED ${message} Use --require-client for release checks.`);
}
