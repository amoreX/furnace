import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { FurnaceRootResult } from "./types.js"

const packageName = "cook-furnace"

/**
 * Resolve the furnace source root by walking up from a starting directory to
 * the nearest package.json named "cook-furnace" that also has a `src/`
 * sibling. Mirrors how src/version.ts reads ../package.json relative to the
 * running module. Returns availability plus a reason when evolve cannot run.
 *
 * Availability requires BOTH a source checkout (src/ present) and that the
 * root is a git worktree, since recovery points are git snapshots.
 */
export function resolveFurnaceRoot(startDir: string = moduleDir()): FurnaceRootResult {
  let current = resolve(startDir)
  while (true) {
    const candidate = resolve(current, "package.json")
    if (existsSync(candidate) && readPackageName(candidate) === packageName) {
      if (!existsSync(resolve(current, "src"))) {
        return {
          available: false,
          reason: "no-source",
          message: "Evolve needs the furnace source. This looks like an installed build without a src/ checkout.",
        }
      }
      if (!isGitWorktree(current)) {
        return {
          available: false,
          reason: "not-git",
          message: "Evolve needs the furnace source root to be a git repository so it can create recovery points.",
        }
      }
      return { available: true, root: current }
    }
    const parent = dirname(current)
    if (parent === current) {
      return {
        available: false,
        reason: "no-source",
        message: "Evolve could not locate the furnace source root (no cook-furnace package.json with a src/ directory).",
      }
    }
    current = parent
  }
}

function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}

function readPackageName(packageJsonPath: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string }
    return parsed.name
  } catch {
    return undefined
  }
}

/** True when `root/.git` exists as a directory or a worktree gitdir file. */
export function isGitWorktree(root: string): boolean {
  const dotGit = resolve(root, ".git")
  try {
    const info = statSync(dotGit)
    if (info.isDirectory()) return true
    if (info.isFile()) return /^gitdir:\s*.+/im.test(readFileSync(dotGit, "utf8"))
    return false
  } catch {
    return false
  }
}
