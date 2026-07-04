import { basename } from "node:path"
import { readdir, readFile, stat } from "node:fs/promises"
import {
  clamp,
  displayPath,
  globToRegExp,
  isInsideNoisyDirectory,
  isSecretLikePath,
  listFiles,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredString,
  resolveToolPath,
} from "./common.js"
import type { ToolContext } from "./types.js"

const maxSearchFileBytes = 1_000_000

export async function lsTool(args: unknown, context: ToolContext): Promise<string> {
  const target = resolveToolPath(context.cwd, optionalString(args, "path") || ".")
  const entries = await readdir(target, { withFileTypes: true })
  return entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
    .join("\n")
}

export async function findTool(args: unknown, context: ToolContext): Promise<string> {
  const requestedPath = optionalString(args, "path")
  const root = resolveToolPath(context.cwd, requestedPath || ".")
  const query = (optionalString(args, "query") || "").toLowerCase()
  const maxResults = clamp(optionalNumber(args, "maxResults") || 100, 1, 1000)
  const files = await listFiles(root, context.cwd, maxResults, query, {
    skipNoisyDirs: !isInsideNoisyDirectory(root),
  })
  return files.map((file) => displayPath(context.cwd, file)).join("\n") || "No files found."
}

export async function globTool(args: unknown, context: ToolContext): Promise<string> {
  const pattern = requiredString(args, "pattern")
  const requestedPath = optionalString(args, "path")
  const root = resolveToolPath(context.cwd, requestedPath || ".")
  const maxResults = clamp(optionalNumber(args, "maxResults") || 100, 1, 1000)
  const matcher = globToRegExp(pattern)
  const files = (await listFiles(root, context.cwd, 10_000, "", { skipNoisyDirs: !isInsideNoisyDirectory(root) })).filter((file) => {
    const label = displayPath(context.cwd, file)
    return matcher.test(label) || (!pattern.includes("/") && matcher.test(basename(file)))
  })
  return files.slice(0, maxResults).map((file) => displayPath(context.cwd, file)).join("\n") || "No files found."
}

export async function grepTool(args: unknown, context: ToolContext): Promise<string> {
  const pattern = requiredString(args, "pattern")
  const requestedPath = optionalString(args, "path")
  const root = resolveToolPath(context.cwd, requestedPath || ".")
  const maxResults = clamp(optionalNumber(args, "maxResults") || 100, 1, 1000)
  const matcher = optionalBoolean(args, "regex") ? new RegExp(pattern) : undefined
  const needle = matcher ? "" : pattern.toLowerCase()
  const files = (await stat(root)).isDirectory() ? await listFiles(root, context.cwd, 10_000, "", { skipNoisyDirs: !isInsideNoisyDirectory(root) }) : [root]
  const results: string[] = []

  for (const relativeFile of files) {
    if (results.length >= maxResults) break
    const file = resolveToolPath(context.cwd, relativeFile)
    if (isSecretLikePath(file)) continue
    const info = await stat(file)
    if (info.size > maxSearchFileBytes) continue
    let contents: string
    try {
      contents = await readFile(file, "utf8")
    } catch {
      continue
    }
    const lines = contents.split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      const matched = matcher ? matcher.test(line) : line.toLowerCase().includes(needle)
      if (!matched) continue
      results.push(`${displayPath(context.cwd, file)}:${index + 1}:${line}`)
      if (results.length >= maxResults) break
    }
  }

  return results.join("\n") || "No matches found."
}
