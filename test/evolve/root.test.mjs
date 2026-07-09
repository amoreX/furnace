import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

async function makeRepo(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "furnace-evolve-root-"))
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: options.name ?? "cook-furnace" }), "utf8")
  if (options.src !== false) await mkdir(join(dir, "src"), { recursive: true })
  if (options.git !== false) await mkdir(join(dir, ".git"), { recursive: true })
  return dir
}

test("resolveFurnaceRoot finds the root from a nested directory", async () => {
  const { resolveFurnaceRoot } = await import("../../dist/evolve/root.js")
  const dir = await makeRepo()
  try {
    await mkdir(join(dir, "src", "evolve"), { recursive: true })
    const result = resolveFurnaceRoot(join(dir, "src", "evolve"))
    assert.equal(result.available, true)
    assert.equal(result.root, dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("resolveFurnaceRoot reports no-source when src/ is absent", async () => {
  const { resolveFurnaceRoot } = await import("../../dist/evolve/root.js")
  const dir = await makeRepo({ src: false })
  try {
    const result = resolveFurnaceRoot(dir)
    assert.equal(result.available, false)
    assert.equal(result.reason, "no-source")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("resolveFurnaceRoot reports not-git when root is not a worktree", async () => {
  const { resolveFurnaceRoot } = await import("../../dist/evolve/root.js")
  const dir = await makeRepo({ git: false })
  try {
    const result = resolveFurnaceRoot(dir)
    assert.equal(result.available, false)
    assert.equal(result.reason, "not-git")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("resolveFurnaceRoot reports no-source when no cook-furnace package.json is found", async () => {
  const { resolveFurnaceRoot } = await import("../../dist/evolve/root.js")
  const dir = await mkdtemp(join(tmpdir(), "furnace-evolve-root-none-"))
  try {
    const result = resolveFurnaceRoot(dir)
    assert.equal(result.available, false)
    assert.equal(result.reason, "no-source")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("isGitWorktree recognizes a gitdir worktree file", async () => {
  const { isGitWorktree } = await import("../../dist/evolve/root.js")
  const dir = await mkdtemp(join(tmpdir(), "furnace-evolve-worktree-"))
  try {
    await writeFile(join(dir, ".git"), "gitdir: /somewhere/else\n", "utf8")
    assert.equal(isGitWorktree(dir), true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
