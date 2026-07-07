import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("ensureFurnaceStateExcluded adds .furnace to local git excludes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "furnace-git-exclude-"))
  try {
    await mkdir(join(cwd, ".git", "info"), { recursive: true })

    const { ensureFurnaceStateExcluded } = await import("../dist/git-exclude.js")
    ensureFurnaceStateExcluded(cwd)
    ensureFurnaceStateExcluded(cwd)

    const exclude = await readFile(join(cwd, ".git", "info", "exclude"), "utf8")
    assert.equal(exclude.match(/^\.furnace\/$/gm)?.length, 1)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test("ensureFurnaceStateExcluded uses cwd-relative state path from nested repos", async () => {
  const repo = await mkdtemp(join(tmpdir(), "furnace-git-exclude-nested-"))
  try {
    await mkdir(join(repo, ".git", "info"), { recursive: true })
    await mkdir(join(repo, "packages", "app"), { recursive: true })

    const { ensureFurnaceStateExcluded } = await import("../dist/git-exclude.js")
    ensureFurnaceStateExcluded(join(repo, "packages", "app"))

    const exclude = await readFile(join(repo, ".git", "info", "exclude"), "utf8")
    assert.match(exclude, /^packages\/app\/\.furnace\/$/m)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test("ensureFurnaceStateExcluded handles gitdir files used by worktrees", async () => {
  const root = await mkdtemp(join(tmpdir(), "furnace-git-exclude-worktree-"))
  try {
    const worktree = join(root, "worktree")
    const gitDir = join(root, "gitdir")
    await mkdir(join(gitDir, "info"), { recursive: true })
    await mkdir(worktree, { recursive: true })
    await writeFile(join(worktree, ".git"), `gitdir: ${gitDir}\n`, "utf8")

    const { ensureFurnaceStateExcluded } = await import("../dist/git-exclude.js")
    ensureFurnaceStateExcluded(worktree)

    const exclude = await readFile(join(gitDir, "info", "exclude"), "utf8")
    assert.match(exclude, /^\.furnace\/$/m)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
