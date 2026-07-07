import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"

const furnaceStateDir = ".furnace"

export function ensureFurnaceStateExcluded(cwd: string): void {
  const worktreeRoot = findGitWorktreeRoot(cwd)
  if (!worktreeRoot) return
  const gitDir = resolveGitDir(worktreeRoot)
  if (!gitDir) return

  const relativeStatePath = toGitExcludePath(relative(worktreeRoot, resolve(cwd, furnaceStateDir)) || furnaceStateDir)
  if (relativeStatePath.startsWith("../")) return
  appendExcludeEntry(gitDir, `${relativeStatePath}/`)
}

function findGitWorktreeRoot(start: string): string | undefined {
  let current = resolve(start)
  while (true) {
    if (existsSync(resolve(current, ".git"))) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

function resolveGitDir(worktreeRoot: string): string | undefined {
  const dotGit = resolve(worktreeRoot, ".git")
  try {
    const info = statSync(dotGit)
    if (info.isDirectory()) return dotGit
    if (!info.isFile()) return undefined
  } catch {
    return undefined
  }

  const content = readFileSync(dotGit, "utf8").trim()
  const match = /^gitdir:\s*(.+)$/i.exec(content)
  if (!match) return undefined
  const gitDir = match[1]?.trim()
  if (!gitDir) return undefined
  return isAbsolute(gitDir) ? gitDir : resolve(worktreeRoot, gitDir)
}

function appendExcludeEntry(gitDir: string, entry: string): void {
  const excludePath = resolve(gitDir, "info", "exclude")
  mkdirSync(dirname(excludePath), { recursive: true })
  const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : ""
  const lines = existing.split(/\r?\n/).map((line) => line.trim())
  if (lines.includes(entry)) return
  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : ""
  writeFileSync(excludePath, `${existing}${prefix}${entry}\n`, "utf8")
}

function toGitExcludePath(path: string): string {
  return path.split(sep).join("/")
}
