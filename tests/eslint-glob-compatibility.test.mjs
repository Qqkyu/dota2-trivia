import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Linter } from "eslint";

const require = createRequire(import.meta.url);
const nextConfigRequire = createRequire(require.resolve("eslint-config-next"));
const pluginPath = nextConfigRequire.resolve("@next/eslint-plugin-next");
const pluginRequire = createRequire(pluginPath);
const pluginModule = pluginRequire(pluginPath);
const plugin = pluginModule.default ?? pluginModule;
const { getRootDirs } = pluginRequire(path.join(path.dirname(pluginPath), "utils/get-root-dirs.js"));
const root = mkdtempSync(path.join(tmpdir(), "queue-arcade-lint-glob-"));
for (const directory of [
  "apps/web/pages",
  "apps/admin/pages",
  "apps/admin/src/app/dashboard",
  "packages/library",
  "apps/.hidden",
]) {
  mkdirSync(path.join(root, directory), { recursive: true });
}
writeFileSync(path.join(root, "apps/web/pages/about.jsx"), "export default function Page() { return null; }\n");
writeFileSync(path.join(root, "apps/admin/pages/dashboard.jsx"), "export default function Page() { return null; }\n");
writeFileSync(
  path.join(root, "apps/admin/src/app/dashboard/page.jsx"),
  "export default function Page() { return null; }\n",
);
writeFileSync(path.join(root, "apps/file.txt"), "This file is not a Next.js directory.\n");
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("Next ESLint directory matcher replacement", () => {
  it("resolves only the plugin's fast-glob dependency to the maintained replacement", () => {
    expect(pluginRequire("fast-glob/package.json").name).toBe("tinyglobby");
    expect(typeof pluginRequire("fast-glob").globSync).toBe("function");
  });

  it.each([
    ["apps/*", ["apps/admin", "apps/web"]],
    ["apps/{web,admin}", ["apps/admin", "apps/web"]],
    ["apps/**/pages", ["apps/admin/pages", "apps/web/pages"]],
    ["apps/**/app", ["apps/admin/src/app"]],
    ["apps/.hidden", ["apps/.hidden"]],
    ["missing/*", []],
  ])("finds Next roots using %s and excludes files", (pattern, expected) => {
    const found = getRootDirs({ cwd: root, settings: { next: { rootDir: path.join(root, pattern) } } });
    expect(found.map((directory) => path.relative(root, directory)).sort()).toEqual(expected.sort());
  });

  it("preserves the default root and arrays of root patterns", () => {
    expect(getRootDirs({ cwd: root, settings: {} })).toEqual([root]);
    const found = getRootDirs({
      cwd: root,
      settings: { next: { rootDir: [path.join(root, "apps/web"), path.join(root, "packages/*")] } },
    });
    expect(found.map((directory) => path.relative(root, directory)).sort()).toEqual(["apps/web", "packages/library"]);
  });

  it.each(["/about", "/dashboard"])("still reports native links to Next pages discovered through globs: %s", (href) => {
    const linter = new Linter();
    const messages = linter.verify(
      `export default function Component() { return <a href="${href}">Internal page</a>; }`,
      [
        {
          files: ["**/*.jsx"],
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          plugins: { "@next/next": plugin },
          settings: { next: { rootDir: path.join(root, "apps/{web,admin}") } },
          rules: { "@next/next/no-html-link-for-pages": "error" },
        },
      ],
      { filename: "component.jsx" },
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("@next/next/no-html-link-for-pages");
    expect(messages[0].message).toContain(href);
  });
});
