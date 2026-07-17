import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

test("project preferences override only model, model settings, and theme", async () => {
  const home = await mkdtemp(join(tmpdir(), "furnace-preferences-home-"))
  const cwd = await mkdtemp(join(tmpdir(), "furnace-preferences-project-"))
  const previousHome = process.env.HOME
  process.env.HOME = home
  try {
    const { loadPreferences, saveGlobalPreferences } = await import("../dist/preferences.js")
    await saveGlobalPreferences({
      layout: "forge",
      provider: "anthropic",
      statusShowCost: false,
      typingIndicator: "bar",
    })
    await mkdir(join(cwd, ".furnace"), { recursive: true })
    await writeFile(join(cwd, ".furnace", "preferences.json"), JSON.stringify({
      layout: "classic",
      model: "project-model",
      provider: "openrouter",
      statusShowCost: true,
      theme: "gruvbox",
      typingIndicator: "underscore",
    }), "utf8")

    const preferences = await loadPreferences(cwd)
    assert.equal(preferences.layout, "forge")
    assert.equal(preferences.provider, "anthropic")
    assert.equal(preferences.statusShowCost, false)
    assert.equal(preferences.typingIndicator, "bar")
    assert.equal(preferences.model, "project-model")
    assert.equal(preferences.theme, "gruvbox")
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    await Promise.all([rm(home, { recursive: true, force: true }), rm(cwd, { recursive: true, force: true })])
  }
})

test("project saves do not copy global settings and concurrent global saves do not lose fields", async () => {
  const home = await mkdtemp(join(tmpdir(), "furnace-preferences-home-"))
  const cwd = await mkdtemp(join(tmpdir(), "furnace-preferences-project-"))
  const previousHome = process.env.HOME
  process.env.HOME = home
  try {
    const { loadPreferences, saveGlobalPreferences, saveModelPreferences } = await import("../dist/preferences.js")
    await Promise.all([
      saveGlobalPreferences({ layout: "signal" }),
      saveGlobalPreferences({ statusShowCost: false }),
      saveGlobalPreferences({ notifications: true }),
    ])
    await saveModelPreferences(cwd, { model: "project-model", theme: "flexoki" })

    const projectFile = JSON.parse(await readFile(join(cwd, ".furnace", "preferences.json"), "utf8"))
    assert.deepEqual(projectFile, { model: "project-model", theme: "flexoki" })

    const preferences = await loadPreferences(cwd)
    assert.equal(preferences.layout, "signal")
    assert.equal(preferences.statusShowCost, false)
    assert.equal(preferences.notifications, true)
    assert.equal(preferences.model, "project-model")
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    await Promise.all([rm(home, { recursive: true, force: true }), rm(cwd, { recursive: true, force: true })])
  }
})

test("repo index policy is global and normalizes invalid values", async () => {
  const home = await mkdtemp(join(tmpdir(), "furnace-preferences-home-"))
  const cwd = await mkdtemp(join(tmpdir(), "furnace-preferences-project-"))
  const previousHome = process.env.HOME
  process.env.HOME = home
  try {
    const {
      loadPreferences,
      normalizeRepoIndexPolicy,
      saveGlobalPreferences,
      saveModelPreferences,
    } = await import("../dist/preferences.js")
    assert.equal(normalizeRepoIndexPolicy(undefined), "agent-decides")
    assert.equal(normalizeRepoIndexPolicy("invalid"), "agent-decides")
    assert.equal(normalizeRepoIndexPolicy("every-git-push"), "every-git-push")

    await saveGlobalPreferences({ repoIndexPolicy: "every-git-push" })
    await saveModelPreferences(cwd, { repoIndexPolicy: "agent-decides", model: "project-model" })
    assert.equal((await loadPreferences(cwd)).repoIndexPolicy, "every-git-push")
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    await Promise.all([rm(home, { recursive: true, force: true }), rm(cwd, { recursive: true, force: true })])
  }
})

test("cost display mode migrates the old boolean and pinned chats persist globally", async () => {
  const home = await mkdtemp(join(tmpdir(), "furnace-preferences-home-"))
  const cwd = await mkdtemp(join(tmpdir(), "furnace-preferences-project-"))
  const previousHome = process.env.HOME
  process.env.HOME = home
  try {
    const { loadPreferences, normalizeCostDisplayMode, saveGlobalPreferences } = await import("../dist/preferences.js")
    assert.equal(normalizeCostDisplayMode(undefined, false), "off")
    assert.equal(normalizeCostDisplayMode(undefined, true), "session")
    assert.equal(normalizeCostDisplayMode("total", false), "total")
    await saveGlobalPreferences({ pinnedChatIds: ["session-a", "session-b"], statusCostMode: "total" })
    const preferences = await loadPreferences(cwd)
    assert.deepEqual(preferences.pinnedChatIds, ["session-a", "session-b"])
    assert.equal(preferences.statusCostMode, "total")
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    await Promise.all([rm(home, { recursive: true, force: true }), rm(cwd, { recursive: true, force: true })])
  }
})

test("release acknowledgements normalize, deduplicate, and remain global", async () => {
  const home = await mkdtemp(join(tmpdir(), "furnace-preferences-home-"))
  const cwd = await mkdtemp(join(tmpdir(), "furnace-preferences-project-"))
  const previousHome = process.env.HOME
  process.env.HOME = home
  try {
    const {
      acknowledgeReleaseVersion,
      loadPreferences,
      normalizeAcknowledgedReleaseVersions,
      saveModelPreferences,
    } = await import("../dist/preferences.js")

    assert.deepEqual(normalizeAcknowledgedReleaseVersions(["0.2.4", "bad", "0.2.4", 1]), ["0.2.4"])
    await Promise.all([
      acknowledgeReleaseVersion("0.2.3"),
      acknowledgeReleaseVersion("0.2.4"),
      acknowledgeReleaseVersion("0.2.4"),
    ])
    await saveModelPreferences(cwd, {
      acknowledgedReleaseVersions: ["9.9.9"],
      model: "project-model",
    })

    const preferences = await loadPreferences(cwd)
    assert.deepEqual(preferences.acknowledgedReleaseVersions, ["0.2.3", "0.2.4"])
    const projectFile = JSON.parse(await readFile(join(cwd, ".furnace", "preferences.json"), "utf8"))
    assert.deepEqual(projectFile, { model: "project-model" })
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    await Promise.all([rm(home, { recursive: true, force: true }), rm(cwd, { recursive: true, force: true })])
  }
})
