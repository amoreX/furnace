import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import type { FurnaceRootResult } from "./types.js"
import { performSwap, verifyToTemp } from "./verify.js"

const FURNACE_REPOSITORY = "https://github.com/amoreX/furnace.git"

export type ManagedSourceCommand = {
  args: string[]
  command: string
  cwd: string
}

export type ManagedSourceDeps = {
  prepareBaseline: (root: string) => Promise<{ ok: boolean; log: string }>
  run: (input: ManagedSourceCommand) => Promise<{ ok: boolean; log: string }>
}

export function managedSourceRoot(version: string): string {
  return join(homedir(), ".furnace", "evolve", "sources", `v${version}`)
}

export async function prepareManagedFurnaceSource(input: {
  version: string
  onStatus?: (message: string) => void
  deps?: ManagedSourceDeps
}): Promise<FurnaceRootResult> {
  const root = managedSourceRoot(input.version)
  if (isUsableCheckout(root)) return { available: true, managed: true, root }

  if (existsSync(root)) {
    return {
      available: false,
      reason: "no-source",
      message: `The managed Furnace source at ${root} is incomplete. Move or remove that directory, then run /evolve again.`,
    }
  }

  const deps = input.deps ?? defaultManagedSourceDeps
  const tag = `v${input.version}`
  const staging = `${root}.tmp-${process.pid}-${Date.now()}`
  mkdirSync(dirname(root), { recursive: true })
  rmSync(staging, { force: true, recursive: true })

  try {
    input.onStatus?.(`Downloading Furnace ${tag} source for evolve…`)
    const cloned = await deps.run({
      args: ["clone", "--branch", tag, "--depth", "1", FURNACE_REPOSITORY, staging],
      command: "git",
      cwd: dirname(root),
    })
    if (!cloned.ok) {
      return unavailable(`Could not download Furnace ${tag}: ${lastUsefulLine(cloned.log)}`)
    }

    input.onStatus?.("Installing evolve build dependencies…")
    const installed = await deps.run({
      args: ["ci"],
      command: process.platform === "win32" ? "npm.cmd" : "npm",
      cwd: staging,
    })
    if (!installed.ok) {
      return unavailable(`Could not install evolve build dependencies: ${lastUsefulLine(installed.log)}`)
    }

    input.onStatus?.("Building the known-good Furnace baseline…")
    const baseline = await deps.prepareBaseline(staging)
    if (!baseline.ok) {
      return unavailable(`Could not build the managed Furnace baseline: ${lastUsefulLine(baseline.log)}`)
    }

    renameSync(staging, root)
    return { available: true, managed: true, root }
  } finally {
    rmSync(staging, { force: true, recursive: true })
  }
}

function isUsableCheckout(root: string): boolean {
  if (
    !existsSync(join(root, ".git"))
    || !existsSync(join(root, "src", "cli.ts"))
    || !existsSync(join(root, "src", "evolve", "orchestrator.ts"))
    || !existsSync(join(root, "package.json"))
  ) {
    return false
  }
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name?: string }
    return parsed.name === "cook-furnace"
  } catch {
    return false
  }
}

function unavailable(message: string): FurnaceRootResult {
  return { available: false, reason: "no-source", message }
}

function lastUsefulLine(log: string): string {
  return log.trim().split("\n").filter(Boolean).at(-1) ?? "unknown error"
}

const defaultManagedSourceDeps: ManagedSourceDeps = {
  prepareBaseline: async (root) => {
    const verified = await verifyToTemp(root)
    if (!verified.ok) return { ok: false, log: `${verified.step}: ${verified.log}` }
    performSwap(root, verified.build)
    return { ok: true, log: verified.build.log }
  },
  run: ({ args, command, cwd }) => new Promise((done) => {
    const child = spawn(command, args, { cwd: resolve(cwd) })
    let log = ""
    child.stdout?.on("data", (chunk) => { log += chunk.toString() })
    child.stderr?.on("data", (chunk) => { log += chunk.toString() })
    child.on("error", (error) => done({ ok: false, log: `${log}\n${error.message}`.trim() }))
    child.on("close", (code) => done({ ok: code === 0, log: log.trim() }))
  }),
}
