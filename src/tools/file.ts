import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { retrieveContextArtifact } from "../compression/artifacts.js"
import type { FileReadReceipt, FileReadSnapshot } from "../session/types.js"
import {
  assertReadablePath,
  displayPath,
  exists,
  optionalNumber,
  optionalBoolean,
  requiredString,
  resolveToolPath,
  truncate,
} from "./common.js"
import type { ToolContext } from "./types.js"

type FileReadTracker = {
  latestByFile: Map<string, FileReadSnapshot>
  returnedRanges: Map<string, FileReadReceipt>
}

const maxReadChars = 200_000
const fileReadTrackers = new Map<string, FileReadTracker>()

export async function readTool(args: unknown, context: ToolContext): Promise<string> {
  const path = requiredString(args, "path")
  const file = resolveToolPath(context.cwd, path)
  assertReadablePath(context.cwd, file)
  const fileInfo = await stat(file)
  const snapshot = fileSnapshot(fileInfo)
  const offset = optionalNumber(args, "offset")
  const limit = optionalNumber(args, "limit")
  const rangeKey = readRangeKey(context, file, offset, limit)
  const previousReceipt = getFileReadReceipt(context, file, offset, limit, rangeKey)
  if (previousReceipt && sameSnapshot(previousReceipt, snapshot)) {
    const range = readRangeLabel(offset, limit)
    return `File unchanged since last read: ${previousReceipt.displayPath}${range ? ` (${range})` : ""}.\nUse the previously returned content unless you need a different line range.`
  }

  const contents = await readFile(file, "utf8")
  const lines = contents.split(/\r?\n/)
  const start = Math.max(0, (offset || 1) - 1)
  const selected = typeof limit === "number" ? lines.slice(start, start + Math.max(0, limit)) : lines.slice(start)
  recordFileRead(context, file, snapshot, rangeKey, offset, limit)
  return truncate(selected.map((line, index) => `${start + index + 1}|${line}`).join("\n"), maxReadChars)
}

export async function contextRetrieveTool(args: unknown, context: ToolContext): Promise<string> {
  const id = requiredString(args, "id")
  const offset = optionalNumber(args, "offset")
  const limit = optionalNumber(args, "limit") ?? 500
  const artifact = await retrieveContextArtifact({ cwd: context.cwd, id, offset, limit })
  const range = artifact.lineCount > 0 ? `lines ${artifact.startLine}-${artifact.endLine} of ${artifact.totalLines}` : `no lines selected from ${artifact.totalLines} total lines`
  return [
    `Context artifact ${artifact.id}`,
    `Path: ${artifact.relativePath}`,
    `Size: ${artifact.bytes.toLocaleString()} bytes`,
    `Returned: ${range}`,
    "",
    artifact.content,
  ].join("\n")
}

export async function writeTool(args: unknown, context: ToolContext): Promise<string> {
  const path = requiredString(args, "path")
  const content = requiredString(args, "content")
  const overwrite = optionalBoolean(args, "overwrite") || false
  const file = resolveToolPath(context.cwd, path)
  const warning = overwrite ? await staleWriteWarning(context, file) : undefined
  if (!overwrite && (await exists(file))) throw new Error(`File already exists: ${displayPath(context.cwd, file)}`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content, "utf8")
  await recordFileWrite(context, file)
  return [warning, `Wrote ${displayPath(context.cwd, file)} (${content.length} bytes).`].filter(Boolean).join("\n")
}

export async function editTool(args: unknown, context: ToolContext): Promise<string> {
  const patch = requiredString(args, "patch")
  const targets = patchTargets(context.cwd, patch)
  const warnings = await staleWriteWarnings(context, targets.filter((target) => target.kind !== "add").map((target) => target.file))
  const result = await applyPatchEnvelope(context.cwd, patch)
  await Promise.all(targets.map((target) => recordFileWrite(context, target.file)))
  return [...warnings, ...result].join("\n")
}

function fileReadTrackerKey(context: ToolContext): string {
  return [resolve(context.cwd), context.sessionId || "workspace"].join("\0")
}

function fileSnapshot(info: Awaited<ReturnType<typeof stat>>): FileReadSnapshot {
  return {
    mtimeMs: Number(info.mtimeMs),
    size: Number(info.size),
  }
}

function sameSnapshot(left: FileReadSnapshot, right: FileReadSnapshot): boolean {
  return left.mtimeMs === right.mtimeMs && left.size === right.size
}

function readRangeKey(context: ToolContext, file: string, offset: number | undefined, limit: number | undefined): string {
  return [fileReadTrackerKey(context), resolve(file), offset ?? "", limit ?? ""].join("\0")
}

function readRangeLabel(offset: number | undefined, limit: number | undefined): string {
  if (typeof offset !== "number" && typeof limit !== "number") return ""
  if (typeof limit !== "number") return `from line ${offset || 1}`
  return `lines ${offset || 1}-${(offset || 1) + Math.max(0, limit) - 1}`
}

function getFileReadTracker(context: ToolContext): FileReadTracker {
  const key = fileReadTrackerKey(context)
  const existing = fileReadTrackers.get(key)
  if (existing) return existing
  const tracker: FileReadTracker = {
    latestByFile: new Map(),
    returnedRanges: new Map(),
  }
  fileReadTrackers.set(key, tracker)
  return tracker
}

function getFileReadReceipt(context: ToolContext, file: string, offset: number | undefined, limit: number | undefined, rangeKey: string): FileReadReceipt | undefined {
  const normalizedFile = resolve(file)
  if (context.sessionId && context.fileReadStore) {
    return context.fileReadStore.getFileReadReceipt({
      cwd: resolve(context.cwd),
      file: normalizedFile,
      limit: limit ?? null,
      offset: offset ?? null,
      sessionId: context.sessionId,
    })
  }

  return getFileReadTracker(context).returnedRanges.get(rangeKey)
}

function recordFileRead(context: ToolContext, file: string, snapshot: FileReadSnapshot, rangeKey: string, offset: number | undefined, limit: number | undefined): void {
  const normalizedCwd = resolve(context.cwd)
  const tracker = getFileReadTracker(context)
  const normalizedFile = resolve(file)
  const receipt: FileReadReceipt = {
    ...snapshot,
    displayPath: displayPath(normalizedCwd, normalizedFile),
  }
  if (context.sessionId && context.fileReadStore) {
    context.fileReadStore.recordFileRead({
      cwd: normalizedCwd,
      file: normalizedFile,
      limit: limit ?? null,
      offset: offset ?? null,
      sessionId: context.sessionId,
      ...receipt,
    })
  }
  tracker.latestByFile.set(normalizedFile, snapshot)
  tracker.returnedRanges.set(rangeKey, receipt)
}

async function staleWriteWarnings(context: ToolContext, files: string[]): Promise<string[]> {
  const uniqueFiles = [...new Set(files.map((file) => resolve(file)))]
  const warnings = await Promise.all(uniqueFiles.map((file) => staleWriteWarning(context, file)))
  return warnings.filter((warning): warning is string => Boolean(warning))
}

async function staleWriteWarning(context: ToolContext, file: string): Promise<string | undefined> {
  const normalizedFile = resolve(file)
  const previous =
    context.sessionId && context.fileReadStore
      ? context.fileReadStore.getFileReadSnapshot({
          cwd: resolve(context.cwd),
          file: normalizedFile,
          sessionId: context.sessionId,
        })
      : getFileReadTracker(context).latestByFile.get(normalizedFile)
  if (!previous) return undefined
  try {
    const current = fileSnapshot(await stat(normalizedFile))
    if (sameSnapshot(previous, current)) return undefined
    return `Warning: ${displayPath(context.cwd, normalizedFile)} changed since Furnace last read it before this write. The requested modification was still applied; re-read/review if that change was not expected.`
  } catch {
    return `Warning: ${displayPath(context.cwd, normalizedFile)} changed since Furnace last read it and was no longer readable before this write.`
  }
}

async function recordFileWrite(context: ToolContext, file: string): Promise<void> {
  const tracker = getFileReadTracker(context)
  const normalizedFile = resolve(file)
  for (const key of tracker.returnedRanges.keys()) {
    if (key.includes(`\0${normalizedFile}\0`)) tracker.returnedRanges.delete(key)
  }
  try {
    const snapshot = fileSnapshot(await stat(normalizedFile))
    if (context.sessionId && context.fileReadStore) {
      context.fileReadStore.recordFileWrite({
        cwd: resolve(context.cwd),
        file: normalizedFile,
        sessionId: context.sessionId,
        snapshot,
      })
    }
    tracker.latestByFile.set(normalizedFile, snapshot)
  } catch {
    if (context.sessionId && context.fileReadStore) {
      context.fileReadStore.recordFileWrite({
        cwd: resolve(context.cwd),
        file: normalizedFile,
        sessionId: context.sessionId,
      })
    }
    tracker.latestByFile.delete(normalizedFile)
  }
}

function patchTargets(cwd: string, patch: string): Array<{ file: string; kind: "add" | "delete" | "update" }> {
  const targets: Array<{ file: string; kind: "add" | "delete" | "update" }> = []
  for (const line of patch.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("*** Add File: ")) targets.push({ file: resolveToolPath(cwd, line.slice("*** Add File: ".length).trim()), kind: "add" })
    else if (line.startsWith("*** Update File: ")) targets.push({ file: resolveToolPath(cwd, line.slice("*** Update File: ".length).trim()), kind: "update" })
    else if (line.startsWith("*** Delete File: ")) targets.push({ file: resolveToolPath(cwd, line.slice("*** Delete File: ".length).trim()), kind: "delete" })
  }
  return targets
}

async function applyPatchEnvelope(cwd: string, patch: string): Promise<string[]> {
  const lines = patch.replace(/\r\n/g, "\n").split("\n")
  if (lines[0] !== "*** Begin Patch") throw new Error("Patch must start with *** Begin Patch")
  if (!lines.some((line) => line === "*** End Patch")) throw new Error("Patch must end with *** End Patch")
  if (lines.some((line) => line.startsWith("--- ") || line.startsWith("+++ "))) throw new Error("Unified diff syntax is not supported. Use Furnace patch envelope syntax: *** Begin Patch, *** Update File: <path>, @@, context/removal/addition lines, *** End Patch.")

  const results: string[] = []
  let index = 1
  while (index < lines.length) {
    const line = lines[index]
    if (line === "*** End Patch") break
    if (!line) {
      index += 1
      continue
    }
    if (line.startsWith("*** Add File: ")) {
      const file = resolveToolPath(cwd, line.slice("*** Add File: ".length).trim())
      const contentLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith("*** ") && !lines[index].startsWith("@@")) {
        const current = lines[index]
        if (!current.startsWith("+")) throw new Error(`Add file lines must start with + near ${displayPath(cwd, file)}`)
        contentLines.push(current.slice(1))
        index += 1
      }
      if (await exists(file)) throw new Error(`File already exists: ${displayPath(cwd, file)}`)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, `${contentLines.join("\n")}${contentLines.length > 0 ? "\n" : ""}`, "utf8")
      results.push(`Added ${displayPath(cwd, file)}`)
      continue
    }
    if (line.startsWith("*** Update File: ")) {
      const file = resolveToolPath(cwd, line.slice("*** Update File: ".length).trim())
      let contents = await readFile(file, "utf8")
      index += 1
      let hunks = 0
      while (index < lines.length && !lines[index].startsWith("*** ")) {
        if (!lines[index].startsWith("@@")) throw new Error(`Expected hunk header in ${displayPath(cwd, file)}`)
        index += 1
        const oldLines: string[] = []
        const newLines: string[] = []
        while (index < lines.length && !lines[index].startsWith("@@") && !lines[index].startsWith("*** ")) {
          const current = lines[index]
          if (current === "*** End of File") {
            index += 1
            continue
          }
          const marker = current[0]
          const text = current.slice(1)
          if (marker === " ") {
            oldLines.push(text)
            newLines.push(text)
          } else if (marker === "-") {
            oldLines.push(text)
          } else if (marker === "+") {
            newLines.push(text)
          } else if (current === "") {
            oldLines.push("")
            newLines.push("")
          } else {
            throw new Error(`Invalid hunk line in ${displayPath(cwd, file)}: ${current}`)
          }
          index += 1
        }
        contents = replaceHunk(contents, oldLines.join("\n"), newLines.join("\n"), displayPath(cwd, file))
        hunks += 1
      }
      await writeFile(file, contents, "utf8")
      results.push(`Updated ${displayPath(cwd, file)} (${hunks} hunks)`)
      continue
    }
    if (line.startsWith("*** Delete File: ")) {
      const file = resolveToolPath(cwd, line.slice("*** Delete File: ".length).trim())
      await rm(file)
      results.push(`Deleted ${displayPath(cwd, file)}`)
      index += 1
      continue
    }
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      throw new Error("Unified diff syntax is not supported. Use Furnace patch envelope syntax with *** Update File: <path> instead of ---/+++ file headers.")
    }
    throw new Error(`Unknown patch operation: ${line}. Expected *** Add File:, *** Update File:, *** Delete File:, or *** End Patch.`)
  }
  return results
}

function replaceHunk(contents: string, oldText: string, newText: string, file: string): string {
  if (contents.includes(oldText)) return contents.replace(oldText, newText)
  if (contents.includes(`${oldText}\n`)) return contents.replace(`${oldText}\n`, `${newText}\n`)
  throw new Error(`Could not find hunk context in ${file}`)
}
