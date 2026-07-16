import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

test("usage ledger is idempotent, key-scoped, and supports undoing accepted lines", async () => {
  const home = await mkdtemp(join(tmpdir(), "furnace-usage-home-"))
  const previousHome = process.env.HOME
  process.env.HOME = home
  try {
    const {
      readKeyUsage,
      recordAcceptedLines,
      recordTurnUsage,
      removeAcceptedLines,
      usageDatabasePath,
    } = await import("../dist/usage/store.js")
    const usage = {
      completionTokens: 25,
      costUsd: 0.125,
      promptTokens: 100,
      provider: "openrouter",
    }
    recordTurnUsage({ apiKey: "key-a", createdAt: Date.now(), eventId: "turn-1", provider: "openrouter", usage })
    recordTurnUsage({ apiKey: "key-a", createdAt: Date.now(), eventId: "turn-1", provider: "openrouter", usage })
    recordTurnUsage({ apiKey: "key-b", createdAt: Date.now(), eventId: "turn-2", provider: "openrouter", usage })
    recordAcceptedLines({ apiKey: "key-a", createdAt: Date.now(), eventId: "tool-1", lines: 7, provider: "openrouter" })

    assert.deepEqual(
      { ...readKeyUsage("openrouter", "key-a"), days: [] },
      {
        acceptedLines: 7,
        completionTokens: 25,
        costUsd: 0.125,
        days: [],
        promptTokens: 100,
        unknownCostTurns: 0,
      },
    )
    assert.equal(readKeyUsage("openrouter", "key-b").acceptedLines, 0)
    const { default: Database } = await import("better-sqlite3")
    const db = new Database(usageDatabasePath(), { readonly: true })
    const storedKey = db.prepare("select key_id from usage_turns where event_id = ?").get("turn-1").key_id
    db.close()
    assert.notEqual(storedKey, "key-a")
    assert.equal(storedKey.length, 64)
    removeAcceptedLines("tool-1")
    assert.equal(readKeyUsage("openrouter", "key-a").acceptedLines, 0)
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    await rm(home, { recursive: true, force: true })
  }
})

test("accepted line metrics count successful write diffs and patch additions", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "furnace-usage-lines-"))
  try {
    const { acceptedLinesForTool } = await import("../dist/usage/summary.js")
    await writeFile(join(cwd, "file.txt"), "one\ntwo\nthree\n", "utf8")
    assert.equal(acceptedLinesForTool({
      args: JSON.stringify({ path: "file.txt", content: "one\ntwo\nthree\n" }),
      cwd,
      snapshot: { existed: true, path: "file.txt", previousContent: "one\n" },
      toolName: "write",
    }), 2)
    assert.equal(acceptedLinesForTool({
      args: JSON.stringify({ patch: "*** Begin Patch\n*** Update File: file.txt\n@@\n one\n+two\n+three\n*** End Patch" }),
      cwd,
      toolName: "edit",
    }), 2)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test("usage report renders a contribution grid and totals", async () => {
  const { renderUsageReport } = await import("../dist/usage/summary.js")
  const report = renderUsageReport({
    acceptedLines: 12,
    completionTokens: 2_000,
    costUsd: 0.25,
    days: [{ acceptedLines: 12, completionTokens: 2_000, costUsd: 0.25, day: "2026-07-15", promptTokens: 10_000 }],
    promptTokens: 10_000,
    unknownCostTurns: 0,
  }, new Date("2026-07-16T12:00:00").getTime())
  assert.match(report, /Agent Usage/)
  assert.match(report, /Press Esc to close/)
  assert.match(report, /Tokens used \(last 12 months\)/)
  assert.match(report, /Recorded key cost \(all time\): \$0\.2500/)
  assert.match(report, /█/)
})
