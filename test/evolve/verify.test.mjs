import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

function stubDeps(overrides = {}) {
  const calls = []
  const base = {
    typecheck: () => { calls.push("typecheck"); return { ok: true, log: "" } },
    test: () => { calls.push("test"); return { ok: true, log: "" } },
    buildToTemp: () => { calls.push("build"); return { ok: true, log: "", tempCliPath: "/tmp/x", tempPromptsPath: "/tmp/p" } },
    swap: () => { calls.push("swap") },
  }
  return { deps: { ...base, ...overrides }, calls }
}

test("verifyAndBuild runs typecheck -> test -> build -> swap in order on success", async () => {
  const { verifyAndBuild } = await import("../../dist/evolve/verify.js")
  const { deps, calls } = stubDeps()
  const result = verifyAndBuild("/root", deps)
  assert.equal(result.ok, true)
  assert.deepEqual(calls, ["typecheck", "test", "build", "swap"])
})

test("verifyAndBuild stops at a failing test and never swaps", async () => {
  const { verifyAndBuild } = await import("../../dist/evolve/verify.js")
  const { deps, calls } = stubDeps({ test: () => { calls?.push?.("test"); return { ok: false, log: "boom" } } })
  const result = verifyAndBuild("/root", deps)
  assert.equal(result.ok, false)
  assert.equal(result.step, "test")
  assert.equal(calls.includes("swap"), false)
  assert.equal(calls.includes("build"), false)
})

test("verifyAndBuild stops at a failing build and never swaps", async () => {
  const { verifyAndBuild } = await import("../../dist/evolve/verify.js")
  const { deps, calls } = stubDeps({ buildToTemp: () => ({ ok: false, log: "esbuild error" }) })
  const result = verifyAndBuild("/root", deps)
  assert.equal(result.ok, false)
  assert.equal(result.step, "build")
  assert.equal(calls.includes("swap"), false)
})

test("verifyAndBuild leaves live dist untouched when a gate fails", async () => {
  const { verifyAndBuild, performSwap } = await import("../../dist/evolve/verify.js")
  const root = await mkdtemp(join(tmpdir(), "furnace-evolve-verify-"))
  try {
    await mkdir(join(root, "dist"), { recursive: true })
    await writeFile(join(root, "dist", "cli.js"), "LIVE\n", "utf8")
    // A real swap would overwrite; but a failing gate must skip swap entirely.
    const { deps } = stubDeps({
      typecheck: () => ({ ok: false, log: "type error" }),
      swap: (r, build) => performSwap(r, build),
    })
    const result = verifyAndBuild(root, deps)
    assert.equal(result.ok, false)
    assert.equal(await readFile(join(root, "dist", "cli.js"), "utf8"), "LIVE\n")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("performSwap replaces dist/cli.js and dist/prompts from the temp build", async () => {
  const { performSwap } = await import("../../dist/evolve/verify.js")
  const root = await mkdtemp(join(tmpdir(), "furnace-evolve-swap-"))
  try {
    await mkdir(join(root, "dist", "prompts"), { recursive: true })
    await writeFile(join(root, "dist", "cli.js"), "OLD\n", "utf8")
    await writeFile(join(root, "dist", "prompts", "base-system.md"), "old prompt\n", "utf8")

    const staging = await mkdtemp(join(tmpdir(), "furnace-evolve-staging-"))
    await writeFile(join(staging, "cli.js"), "NEW\n", "utf8")
    await mkdir(join(staging, "prompts"), { recursive: true })
    await writeFile(join(staging, "prompts", "base-system.md"), "new prompt\n", "utf8")

    performSwap(root, { ok: true, log: "", tempCliPath: join(staging, "cli.js"), tempPromptsPath: join(staging, "prompts") })

    assert.equal(await readFile(join(root, "dist", "cli.js"), "utf8"), "NEW\n")
    assert.equal(await readFile(join(root, "dist", "prompts", "base-system.md"), "utf8"), "new prompt\n")
    await rm(staging, { recursive: true, force: true })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
