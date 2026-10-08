import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);

/** Load the real store modules with a separate module cache for each fixture. */
export function sourceStores() {
  const cache = new Map();
  const load = (filename) => {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const output = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const require = (specifier) => {
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const resolved = specifier.startsWith("@/")
          ? path.join(root, "src", specifier.slice(2))
          : path.resolve(path.dirname(filename), specifier);
        return /\.(mjs|json)$/.test(resolved)
          ? nativeRequire(resolved)
          : load(resolved.endsWith(".ts") ? resolved : `${resolved}.ts`);
      }
      return nativeRequire(specifier);
    };
    new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
    return loaded.exports;
  };
  return (name) => load(path.join(root, "src/lib", `${name}.ts`));
}

export function resetStoreGlobals() {
  for (const key of [
    "__queueArcadeAccounts",
    "__queueArcadeAlphaStore",
    "__queueArcadePersistentVotes",
    "__queueArcadePostgresLastPrune",
    "__queueArcadePostgres",
    "__queueArcadeTransactions",
    "__queueArcadeAccountLocks",
  ]) {
    delete globalThis[key];
  }
}
