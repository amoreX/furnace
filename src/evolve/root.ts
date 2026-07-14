import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { prepareManagedFurnaceSource, type ManagedSourceDeps } from "./managed-source.js"
import type { FurnaceRootResult } from "./types.js"

const packageName = "cook-furnace"

/**
 * Resolve the furnace source root by walking up from a starting directory to
 * the nearest package.json named "cook-furnace" that also has the real source
 * entrypoints. The npm package includes src/ui/pi/LICENSE, so the presence of a
 * bare `src/` directory is not enough to identify a source checkout.
 *
 * Availability requires BOTH a source checkout (src/ present) and that the
 * root is a git worktree, since recovery points are git snapshots.
 */
export function resolveFurnaceRoot(startDir: string = moduleDir()): FurnaceRootResult {
  let current = resolve(startDir)
  while (true) {
    const candidate = resolve(current, "package.json")
    if (existsSync(candidate) && readPackageName(candidate) === packageName) {
      if (!hasFurnaceSource(current)) {
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

/**
 * Resolve a development checkout, or provision a version-matched managed
 * checkout when Furnace is running from a source-less npm installation.
 */
export async function resolveOrPrepareFurnaceRoot(input: {
  startDir?: string
  onStatus?: (message: string) => void
  managedSourceDeps?: ManagedSourceDeps
} = {}): Promise<FurnaceRootResult> {
  const startDir = input.startDir ?? moduleDir()
  const existing = resolveFurnaceRoot(startDir)
  if (existing.available) return existing

  const installedPackage = findPackage(startDir)
  if (!installedPackage || hasFurnaceSource(installedPackage.root)) return existing
  if (!installedPackage.version) {
    return {
      available: false,
      reason: "no-source",
      message: "Evolve could not determine the installed Furnace version needed for a managed source checkout.",
    }
  }

  try {
    return await prepareManagedFurnaceSource({
      deps: input.managedSourceDeps,
      onStatus: input.onStatus,
      version: installedPackage.version,
    })
  } catch (error) {
    return {
      available: false,
      reason: "no-source",
      message: `Could not prepare managed Furnace source: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}

function findPackage(startDir: string): { root: string; version?: string } | undefined {
  let current = resolve(startDir)
  while (true) {
    const candidate = resolve(current, "package.json")
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string; version?: string }
      if (parsed.name === packageName) return { root: current, version: parsed.version }
    } catch {
      // Keep walking toward the filesystem root.
    }
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

function readPackageName(packageJsonPath: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string }
    return parsed.name
  } catch {
    return undefined
  }
}

function hasFurnaceSource(root: string): boolean {
  return existsSync(resolve(root, "src", "cli.ts"))
    && existsSync(resolve(root, "src", "evolve", "orchestrator.ts"))
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
