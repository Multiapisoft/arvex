import { existsSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const SUFFIX = ".staticbak";
const moved = [];

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function hide(filePath) {
  const dest = `${filePath}${SUFFIX}`;
  if (!existsSync(filePath) || existsSync(dest)) return;
  renameSync(filePath, dest);
  moved.push([filePath, dest]);
}

function restore() {
  for (const [from, to] of moved.reverse()) {
    if (existsSync(to) && !existsSync(from)) renameSync(to, from);
  }
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
}

try {
  hide("middleware.ts");
  for (const file of walkFiles(path.join("app", "api"))) hide(file);
  rmSync(".next", { recursive: true, force: true });
  run("pnpm", ["exec", "next", "build"], { CF_PAGES_STATIC: "1" });
  run("pnpm", [
    "exec",
    "wrangler",
    "pages",
    "deploy",
    "out",
    "--project-name=arvex-dev",
    "--branch=master",
    "--commit-dirty=true",
  ]);
} finally {
  restore();
}
